import { db } from "../db";
import { AppError, notFound, forbidden } from "../lib/errors";
import { publicReference } from "../lib/crypto";
import { log } from "../lib/logger";
import { findProducers, planJobSplit } from "./matching";
import { parseSpecJson, specHash } from "./spec";
import { transitionOrder } from "./orders";
import { recordAudit } from "./audit";
import { enqueue } from "../jobs/queue";
import { PRODUCTION_STAGES, type ProductionStageName } from "./enums";

/**
 * Production: turning a paid order into work an atelier can accept and execute.
 *
 * Producer isolation is enforced here, at the query. Every function that touches
 * a job takes the producer id and filters on it — there is no "fetch by id then
 * check" pattern anywhere in this file, because that pattern is how BOLA bugs
 * get written.
 */

const OFFER_TTL_HOURS = 24;

/** Fans an order out into jobs and offers each to the best-matched ateliers. */
export async function dispatchOrderToProducers(orderId: string): Promise<number> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { designVersion: true, quotation: true } },
      shippingAddress: { select: { state: true } },
    },
  });
  if (!order) throw notFound("O pedido");
  if (order.status !== "PAID" && order.status !== "PRODUCER_PENDING") {
    throw new AppError("PRECONDITION_FAILED", "Só despachamos para produção depois do pagamento confirmado.");
  }

  let created = 0;

  for (const item of order.items) {
    if (item.kind !== "CUSTOM" || !item.designVersionId || !item.specSnapshotJson) continue;

    const spec = parseSpecJson(item.specSnapshotJson);
    const splits = planJobSplit(spec);
    // The payout the quote reserved for production, split across the crafts.
    const totalPayout = item.quotation
      ? item.quotation.subtotalCents - Math.round(item.quotation.subtotalCents * 0.18)
      : Math.round(item.totalPriceCents * 0.6);
    const primaryShare = splits.length === 1 ? totalPayout : Math.round(totalPayout * 0.7);
    const rest = totalPayout - primaryShare;

    for (const [index, split] of splits.entries()) {
      const payout = split.role === "PRIMARY" ? primaryShare : Math.round(rest / Math.max(1, splits.length - 1));

      const job = await db.productionJob.create({
        data: {
          reference: publicReference("JOB"),
          orderId: order.id,
          orderItemId: item.id,
          designVersionId: item.designVersionId,
          role: split.role,
          status: "UNASSIGNED",
          payoutCents: payout,
          currency: order.currency,
          dueAt: new Date(Date.now() + (item.quotation?.productionDaysMax ?? 21) * 86_400_000),
        },
      });

      // A job's stage checklist is created up front so the producer sees the
      // whole path and the customer's tracker has something real to reflect.
      const stages = stagesForRole(split.role, spec.embroidery !== undefined, spec.printing !== undefined);
      await db.productionStage.createMany({
        data: stages.map((stage, position) => ({ jobId: job.id, stage, position })),
      });

      const candidates = await findProducers({
        spec,
        role: split.role,
        preferredState: order.shippingAddress?.state ?? null,
        limit: 3,
      });

      if (candidates.length === 0) {
        log.warn("production.no_producer_available", { jobId: job.id, role: split.role });
        await db.productionJob.update({
          where: { id: job.id },
          data: { status: "UNASSIGNED", matchExplanationJson: JSON.stringify({ note: "Nenhum ateliê elegível." }) },
        });
        continue;
      }

      for (const candidate of candidates) {
        await db.jobOffer.create({
          data: {
            jobId: job.id,
            producerId: candidate.producerId,
            score: candidate.score,
            status: "OFFERED",
            expiresAt: new Date(Date.now() + OFFER_TTL_HOURS * 3_600_000),
          },
        });
        await enqueue("notification", { kind: "JOB_OFFERED", producerId: candidate.producerId, jobId: job.id });
      }

      await db.productionJob.update({
        where: { id: job.id },
        data: {
          status: "OFFERED",
          offeredAt: new Date(),
          matchScore: candidates[0]?.score ?? null,
          // Kept for admin review; never exposed to a producer.
          matchExplanationJson: JSON.stringify(candidates),
        },
      });
      created += 1;
    }
  }

  if (created > 0 && order.status === "PAID") {
    await transitionOrder({
      orderId: order.id,
      to: "PRODUCER_PENDING",
      actor: "SYSTEM",
      reason: `Ficha enviada para ${created} ateliê(s) compatível(is).`,
    });
  } else if (created === 0) {
    await transitionOrder({
      orderId: order.id,
      to: "ON_HOLD",
      actor: "SYSTEM",
      reason:
        "Ainda não encontramos um ateliê com a especialização e a capacidade que esta peça exige. Nossa equipe está buscando manualmente.",
    });
  }

  return created;
}

function stagesForRole(role: string, hasEmbroidery: boolean, hasPrinting: boolean): ProductionStageName[] {
  if (role === "EMBROIDERY") return ["MATERIALS", "EMBROIDERY", "QC"];
  if (role === "PRINTING") return ["MATERIALS", "PRINTING", "QC"];
  if (role === "THREE_D") return ["MATERIALS", "FINISHING", "QC"];
  return PRODUCTION_STAGES.filter((s) => {
    if (s === "EMBROIDERY") return hasEmbroidery;
    if (s === "PRINTING") return hasPrinting;
    return true;
  });
}

/**
 * A producer accepting a job. The `updateMany` guarded on status UNASSIGNED/OFFERED
 * is what makes two ateliers clicking "accept" at the same moment safe.
 */
export async function acceptJob(jobId: string, producerId: string): Promise<void> {
  const offer = await db.jobOffer.findFirst({
    where: { jobId, producerId, status: "OFFERED", expiresAt: { gt: new Date() } },
  });
  if (!offer) {
    throw new AppError("JOB_ALREADY_TAKEN", "Esta oferta não está mais disponível para você.", {
      action: "Veja os trabalhos abertos agora — a lista se atualiza sozinha.",
    });
  }

  const producer = await db.producer.findUnique({
    where: { id: producerId },
    select: { status: true, verificationLevel: true, activeJobCount: true, weeklyCapacity: true },
  });
  if (!producer || producer.status !== "ACTIVE") throw forbidden("aceitar trabalhos");
  if (producer.verificationLevel === "UNVERIFIED") {
    throw new AppError("PRODUCER_NOT_VERIFIED", "Sua conta ainda está em verificação.", {
      action: "Assim que a documentação for aprovada, os trabalhos aparecem aqui.",
    });
  }
  if (producer.activeJobCount >= producer.weeklyCapacity) {
    throw new AppError("CAPACITY_EXCEEDED", "Você está com a agenda cheia para esta semana.", {
      action: "Conclua um trabalho em andamento ou ajuste sua capacidade nas configurações.",
    });
  }

  const { count } = await db.productionJob.updateMany({
    where: { id: jobId, status: { in: ["UNASSIGNED", "OFFERED"] }, producerId: null },
    data: { producerId, status: "ACCEPTED", acceptedAt: new Date() },
  });
  if (count === 0) {
    throw new AppError("JOB_ALREADY_TAKEN", "Outro ateliê aceitou este trabalho primeiro.", {
      action: "Acontece — os trabalhos são disputados. Veja os outros abertos.",
    });
  }

  await db.$transaction([
    db.jobOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    db.jobOffer.updateMany({
      where: { jobId, status: "OFFERED", NOT: { id: offer.id } },
      data: { status: "WITHDRAWN", respondedAt: new Date() },
    }),
    db.producer.update({ where: { id: producerId }, data: { activeJobCount: { increment: 1 } } }),
  ]);

  const job = await db.productionJob.findUniqueOrThrow({ where: { id: jobId }, select: { orderId: true } });
  await transitionOrder({
    orderId: job.orderId,
    to: "PRODUCER_ACCEPTED",
    actor: "PRODUCER",
    reason: "Ateliê aceitou a produção.",
  }).catch((e) => log.warn("production.order_transition_skipped", { jobId, error: e }));

  await recordAudit({
    action: "job.accepted",
    targetType: "ProductionJob",
    targetId: jobId,
    newState: { producerId },
  });
}

export async function declineJob(jobId: string, producerId: string, reason: string): Promise<void> {
  const { count } = await db.jobOffer.updateMany({
    where: { jobId, producerId, status: "OFFERED" },
    data: { status: "DECLINED", declineReason: reason.slice(0, 300), respondedAt: new Date() },
  });
  if (count === 0) throw notFound("A oferta");

  // If every offer is now gone, widen the search rather than letting the job rot.
  const remaining = await db.jobOffer.count({ where: { jobId, status: "OFFERED" } });
  if (remaining === 0) {
    await enqueue("webhook_effect", { kind: "REMATCH_JOB", jobId }, { dedupeKey: `rematch:${jobId}:${Date.now()}` });
  }
}

/** Ownership-scoped: a producer can only ever read their own jobs. */
export async function getJobForProducer(jobId: string, producerId: string) {
  const job = await db.productionJob.findFirst({
    where: { id: jobId, producerId },
    include: {
      designVersion: true,
      stages: { orderBy: { position: "asc" } },
      assets: { orderBy: { createdAt: "desc" } },
      checks: { orderBy: { createdAt: "desc" } },
      orderItem: {
        select: {
          titleSnapshot: true,
          quantity: true,
          measurementProfile: {
            // The atelier gets the measurements and nothing else about the person.
            select: {
              unit: true, source: true, heightMm: true, chestMm: true, waistMm: true, hipMm: true,
              shoulderMm: true, sleeveMm: true, inseamMm: true, outseamMm: true, neckMm: true,
              thighMm: true, wristMm: true, torsoMm: true, notes: true,
            },
          },
        },
      },
      order: { select: { reference: true, status: true, currency: true } },
    },
  });
  if (!job) throw notFound("O trabalho");
  return job;
}

/**
 * Advances a stage. Also verifies the spec has not been changed out from under
 * the atelier: production is pinned to a hash, and a mismatch is surfaced rather
 * than silently accepted.
 */
export async function advanceStage(params: {
  jobId: string;
  producerId: string;
  stage: ProductionStageName;
  status: "IN_PROGRESS" | "DONE" | "BLOCKED";
  note?: string;
  blockedReason?: string;
}): Promise<void> {
  const job = await db.productionJob.findFirst({
    where: { id: params.jobId, producerId: params.producerId },
    include: { designVersion: true, order: { select: { id: true, status: true } } },
  });
  if (!job) throw notFound("O trabalho");

  if (job.designVersion?.specHash) {
    const current = specHash(parseSpecJson(job.designVersion.specJson));
    if (current !== job.designVersion.specHash) {
      throw new AppError("SPEC_CHANGED", "A ficha aprovada não confere com a versão registrada.", {
        action: "Pare a produção e acione o suporte. Não corte nada até esclarecermos.",
        internal: { jobId: params.jobId },
      });
    }
  }

  await db.productionStage.update({
    where: { jobId_stage: { jobId: params.jobId, stage: params.stage } },
    data: {
      status: params.status,
      note: params.note?.slice(0, 500) ?? null,
      blockedReason: params.blockedReason?.slice(0, 300) ?? null,
      ...(params.status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),
      ...(params.status === "DONE" ? { completedAt: new Date() } : {}),
    },
  });

  // The order's status mirrors the stage the atelier is actually on.
  const orderStatus = ORDER_STATUS_BY_STAGE[params.stage];
  if (orderStatus && params.status === "IN_PROGRESS") {
    await transitionOrder({
      orderId: job.orderId,
      to: orderStatus,
      actor: "PRODUCER",
      reason: `Etapa iniciada: ${params.stage}.`,
    }).catch((e) => log.debug("production.stage_transition_skipped", { stage: params.stage, error: e }));
  }

  if (params.status === "BLOCKED") {
    await transitionOrder({
      orderId: job.orderId,
      to: "REQUIRES_CUSTOMER_ACTION",
      actor: "PRODUCER",
      reason: params.blockedReason ?? "O ateliê precisa de um esclarecimento antes de continuar.",
    }).catch(() => undefined);
  }

  await db.productionJob.update({
    where: { id: params.jobId },
    data: { status: params.status === "BLOCKED" ? "AWAITING_CLARIFICATION" : "IN_PRODUCTION" },
  });
}

const ORDER_STATUS_BY_STAGE: Partial<Record<ProductionStageName, "MATERIALS_PREPARATION" | "CUTTING" | "SEWING" | "FINISHING" | "QUALITY_CONTROL" | "READY_TO_SHIP">> = {
  MATERIALS: "MATERIALS_PREPARATION",
  CUTTING: "CUTTING",
  SEWING: "SEWING",
  EMBROIDERY: "SEWING",
  PRINTING: "SEWING",
  FINISHING: "FINISHING",
  QC: "QUALITY_CONTROL",
  PACKED: "READY_TO_SHIP",
};

/**
 * Quality control against measurable criteria.
 *
 * "Looks good" is not a QC result. The check compares recorded measurements
 * against the approved spec within the tolerance the customer agreed to, and
 * records the deltas — which is what makes a later dispute answerable.
 */
export async function submitQualityCheck(params: {
  jobId: string;
  producerId: string;
  measured: Record<string, number>;
  checklist: Record<string, boolean>;
  inspectorUserId: string;
}): Promise<{ result: "PASS" | "FAIL" | "PASS_WITH_NOTES"; failures: string[] }> {
  const job = await db.productionJob.findFirst({
    where: { id: params.jobId, producerId: params.producerId },
    include: { designVersion: true },
  });
  if (!job) throw notFound("O trabalho");

  const spec = job.designVersion ? parseSpecJson(job.designVersion.specJson) : null;
  const tolerance = spec?.measurements?.toleranceMm ?? 15;
  const target = spec?.measurements;

  const failures: string[] = [];

  if (target) {
    for (const [key, measuredValue] of Object.entries(params.measured)) {
      const expected = (target as unknown as Record<string, number | undefined>)[key];
      if (typeof expected !== "number") continue;
      const delta = Math.abs(measuredValue - expected);
      if (delta > tolerance) {
        failures.push(`${key}: ${measuredValue}mm contra ${expected}mm aprovado (${delta}mm fora da tolerância de ${tolerance}mm)`);
      }
    }
  }

  for (const [item, passed] of Object.entries(params.checklist)) {
    if (!passed) failures.push(`Checklist reprovado: ${item}`);
  }

  const result: "PASS" | "FAIL" | "PASS_WITH_NOTES" = failures.length === 0 ? "PASS" : "FAIL";

  await db.qualityCheck.create({
    data: {
      jobId: params.jobId,
      checklistJson: JSON.stringify(params.checklist),
      measuredJson: JSON.stringify(params.measured),
      toleranceMm: tolerance,
      result,
      failures: failures.length > 0 ? JSON.stringify(failures) : null,
      inspectorType: "PRODUCER",
      inspectorUserId: params.inspectorUserId,
    },
  });

  await db.productionJob.update({
    where: { id: params.jobId },
    data: { status: result === "PASS" ? "QC_PENDING" : "QC_FAILED" },
  });

  await recordAudit({
    actorUserId: params.inspectorUserId,
    action: "job.qc_submitted",
    targetType: "ProductionJob",
    targetId: params.jobId,
    newState: { result, failureCount: failures.length },
  });

  return { result, failures };
}

/** Recomputes a producer's quality signals from actual outcomes, never self-reported. */
export async function recomputeProducerScores(producerId: string): Promise<void> {
  const jobs = await db.productionJob.findMany({
    where: { producerId, status: { in: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, status: true, dueAt: true, completedAt: true, checks: { select: { result: true } } },
  });
  if (jobs.length === 0) return;

  const completed = jobs.filter((j) => j.status === "COMPLETED");
  const onTime = completed.filter((j) => j.dueAt && j.completedAt && j.completedAt <= j.dueAt);
  const defects = completed.filter((j) => j.checks.some((c) => c.result === "FAIL"));

  const completionRateBp = Math.round((completed.length / jobs.length) * 10_000);
  const onTimeRateBp = completed.length > 0 ? Math.round((onTime.length / completed.length) * 10_000) : 0;
  const defectRateBp = completed.length > 0 ? Math.round((defects.length / completed.length) * 10_000) : 0;

  // 0..1000, weighted towards delivering at all, then on time, then defect-free.
  const qualityScore = Math.max(
    0,
    Math.min(1000, Math.round(completionRateBp * 0.05 + onTimeRateBp * 0.03 + (10_000 - defectRateBp) * 0.02)),
  );

  await db.producer.update({
    where: { id: producerId },
    data: { completionRateBp, onTimeRateBp, defectRateBp, qualityScore, completedJobs: completed.length },
  });
}
