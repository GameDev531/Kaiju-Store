import { db } from "../db";
import { log } from "../lib/logger";
import { claim, complete, fail, reclaimStale, type QueueName } from "./queue";
import { readFileBytes, sweepExpiredFiles } from "../storage";
import { looksLikeActiveContent, probeImage } from "../storage/validate";
import { dispatchOrderToProducers } from "../domain/production";
import { rebuildTasteProfile } from "../domain/recommender";
import { evaluateActiveCampaignsForUser, revokeGrantsForOrder } from "../domain/rewards";
import { pruneRateLimitBuckets } from "../lib/ratelimit";
import { findProducers } from "../domain/matching";
import { parseSpecJson } from "../domain/spec";
import type { JobRole } from "../domain/enums";

/**
 * Queue handlers.
 *
 * Everything here must be safe to run twice: the queue guarantees at-least-once
 * delivery, not exactly-once. Each handler is written so a duplicate run is a
 * no-op rather than a double charge, a double grant, or a duplicate e-mail.
 */

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/**
 * Content scanning.
 *
 * In production this hands the object to a real scanning service (ClamAV,
 * a cloud malware API). The local implementation re-verifies what the upload
 * path checked, from the bytes on disk, and marks the verdict — so the
 * "nothing is served before a verdict" rule is enforced end to end even
 * without an external scanner contracted.
 */
const malwareScan: Handler = async (payload) => {
  const fileId = str(payload.fileId);
  if (!fileId) return;

  const file = await db.storedFile.findUnique({
    where: { id: fileId },
    select: { id: true, storageKey: true, scanStatus: true, contentType: true },
  });
  if (!file || file.scanStatus !== "PENDING") return; // idempotent

  let verdict: "CLEAN" | "SUSPECT" | "REJECTED" = "CLEAN";
  let notes: string | null = null;

  try {
    const bytes = await readFileBytes(file.storageKey);
    if (looksLikeActiveContent(bytes)) {
      verdict = "REJECTED";
      notes = "Assinatura de conteúdo executável detectada na verificação pós-upload.";
    } else {
      const probe = probeImage(bytes);
      if (!probe) {
        verdict = "REJECTED";
        notes = "O arquivo não é decodificável como imagem na verificação pós-upload.";
      } else if (probe.contentType !== file.contentType) {
        // The stored type came from the bytes at upload; a mismatch now means
        // the object changed underneath us.
        verdict = "SUSPECT";
        notes = `Tipo divergente: registrado ${file.contentType}, lido ${probe.contentType}.`;
      }
    }
  } catch (error) {
    verdict = "SUSPECT";
    notes = "Arquivo ilegível durante a verificação.";
    log.warn("scan.read_failed", { fileId, error });
  }

  await db.storedFile.update({ where: { id: fileId }, data: { scanStatus: verdict, scanNotes: notes } });

  if (verdict !== "CLEAN") {
    await db.moderationCase.create({
      data: {
        targetType: "REFERENCE_IMAGE",
        targetId: fileId,
        reason: "MALWARE",
        severity: verdict === "REJECTED" ? "HIGH" : "MEDIUM",
        source: "AUTOMATED",
        detail: notes ?? "Verificação automática reprovou o arquivo.",
      },
    });
  }
};

/** Placeholder for derivative generation (thumbnails, stripped EXIF). */
const imageDerivatives: Handler = async (payload) => {
  const fileId = str(payload.fileId);
  if (!fileId) return;
  // Deliberately a no-op rather than a fake: the platform serves originals
  // through the signed route today. When an image pipeline is added, this is
  // where thumbnails are written and EXIF (including GPS) is stripped.
  log.debug("derivatives.noop", { fileId });
};

const notification: Handler = async (payload) => {
  const kind = str(payload.kind);
  if (!kind) return;

  if (kind === "ORDER_STATUS") {
    const orderId = str(payload.orderId);
    const status = str(payload.status);
    if (!orderId || !status) return;
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { userId: true, reference: true },
    });
    if (!order) return;

    const { ORDER_STATUS_LABELS } = await import("../domain/enums");
    const meta = ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS];
    if (!meta) return;

    // The unique-ish body plus the queue's dedupe key keep this single-shot.
    await db.notification.create({
      data: {
        userId: order.userId,
        kind: "ORDER_STATUS",
        title: `Pedido ${order.reference}: ${meta.pt}`,
        body: meta.customerHint,
        href: `/pedido/${order.reference}`,
      },
    });
    return;
  }

  if (kind === "JOB_OFFERED") {
    const producerId = str(payload.producerId);
    const jobId = str(payload.jobId);
    if (!producerId || !jobId) return;
    const producer = await db.producer.findUnique({ where: { id: producerId }, select: { userId: true } });
    if (!producer) return;
    await db.notification.create({
      data: {
        userId: producer.userId,
        kind: "JOB_OFFERED",
        title: "Novo trabalho compatível com seu ateliê",
        body: "Uma ficha técnica que combina com suas especializações está aberta. Ofertas expiram em 24 horas.",
        href: `/atelie/painel/trabalhos/${jobId}`,
      },
    });
    return;
  }

  if (kind === "REWARD_GRANTED") {
    const userId = str(payload.userId);
    if (!userId) return;
    await db.notification.create({
      data: {
        userId,
        kind: "REWARD_GRANTED",
        title: `Você desbloqueou: ${str(payload.rewardName) ?? "um item de campanha"}`,
        body: `Campanha ${str(payload.campaignName) ?? ""}. O item vai junto com seu próximo envio.`,
        href: "/conta/colecao",
      },
    });
  }
};

/**
 * E-mail delivery.
 *
 * No provider is contracted yet, so this logs the intent WITHOUT the token and
 * leaves the queue item successful. Wiring a real provider means replacing the
 * body of this function and nothing else. The token is deliberately not logged:
 * a verification link in an application log is a credential in an application log.
 */
const email: Handler = async (payload) => {
  const kind = str(payload.kind);
  const userId = str(payload.userId);
  log.info("email.dispatch_pending", {
    kind,
    userId,
    note: "Nenhum provedor de e-mail configurado; o envio real acontece quando um for conectado.",
  });
};

const webhookEffect: Handler = async (payload) => {
  const kind = str(payload.kind);

  if (kind === "MATCH_PRODUCERS") {
    const orderId = str(payload.orderId);
    if (!orderId) return;
    // dispatchOrderToProducers refuses to run twice: it only acts on PAID or
    // PRODUCER_PENDING orders and creates jobs per order item.
    const existing = await db.productionJob.count({ where: { orderId } });
    if (existing > 0) return;
    await dispatchOrderToProducers(orderId);
    return;
  }

  if (kind === "REMATCH_JOB") {
    const jobId = str(payload.jobId);
    if (!jobId) return;
    const job = await db.productionJob.findUnique({
      where: { id: jobId },
      include: { designVersion: true, offers: { select: { producerId: true } } },
    });
    if (!job || job.producerId || !job.designVersion) return;

    const spec = parseSpecJson(job.designVersion.specJson);
    const candidates = await findProducers({
      spec,
      role: job.role as JobRole,
      // Never re-offer to a studio that already declined or let an offer lapse.
      excludeProducerIds: job.offers.map((o) => o.producerId),
      limit: 3,
    });

    if (candidates.length === 0) {
      const { transitionOrder } = await import("../domain/orders");
      await transitionOrder({
        orderId: job.orderId,
        to: "ON_HOLD",
        actor: "SYSTEM",
        reason:
          "Os ateliês compatíveis não puderam assumir esta peça. Nossa equipe está buscando manualmente e entra em contato.",
      }).catch(() => undefined);
      return;
    }

    for (const candidate of candidates) {
      await db.jobOffer
        .create({
          data: {
            jobId: job.id,
            producerId: candidate.producerId,
            score: candidate.score,
            status: "OFFERED",
            expiresAt: new Date(Date.now() + 24 * 3_600_000),
          },
        })
        .catch(() => undefined); // unique (jobId, producerId): already offered
    }
  }
};

const rewardEvaluation: Handler = async (payload) => {
  const orderId = str(payload.orderId);
  if (!orderId) return;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true, status: true } });
  if (!order) return;

  // A refunded or disputed order takes grants away rather than giving them.
  if (order.status === "REFUNDED" || order.status === "DISPUTED" || order.status === "CANCELLED") {
    await revokeGrantsForOrder(orderId, `Pedido em estado ${order.status}.`);
    return;
  }
  await evaluateActiveCampaignsForUser(order.userId, orderId);
};

const tasteProfile: Handler = async (payload) => {
  const userId = str(payload.userId);
  const anonId = str(payload.anonId);
  if (!userId && !anonId) return;
  await rebuildTasteProfile({ userId, anonId });
};

const retentionSweep: Handler = async () => {
  const deleted = await sweepExpiredFiles(500);
  const pruned = await pruneRateLimitBuckets(48);

  // Expired offers stop blocking a job from being re-matched.
  const { count: expiredOffers } = await db.jobOffer.updateMany({
    where: { status: "OFFERED", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", respondedAt: new Date() },
  });

  // Sessions and one-time tokens do not need to outlive their usefulness.
  const { count: sessions } = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
  });
  const { count: tokens } = await db.verificationToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });

  log.info("retention.sweep_complete", { deleted, pruned, expiredOffers, sessions, tokens });
};

const shippingSync: Handler = async () => {
  // Placeholder for carrier polling where a carrier has no webhook. Left as a
  // no-op rather than a simulation that would invent shipment events.
  log.debug("shipping.sync_noop");
};

const payoutRollup: Handler = async () => {
  log.debug("payout.rollup_noop");
};

const aiAnalysis: Handler = async () => {
  // The analysis runs inline in the request today so the customer can watch it.
  // This queue exists for the batch/retry path when volume justifies it.
  log.debug("ai.queued_analysis_noop");
};

const HANDLERS: Record<QueueName, Handler> = {
  malware_scan: malwareScan,
  image_derivatives: imageDerivatives,
  notification,
  email,
  webhook_effect: webhookEffect,
  reward_evaluation: rewardEvaluation,
  taste_profile: tasteProfile,
  retention_sweep: retentionSweep,
  shipping_sync: shippingSync,
  payout_rollup: payoutRollup,
  ai_analysis: aiAnalysis,
};

export const ALL_QUEUES = Object.keys(HANDLERS) as QueueName[];

/** Processes up to `max` jobs. Returns how many actually ran. */
export async function drainQueues(workerId: string, max = 25): Promise<number> {
  await reclaimStale(15);
  let processed = 0;

  for (let i = 0; i < max; i += 1) {
    const job = await claim(ALL_QUEUES, workerId);
    if (!job) break;

    const handler = HANDLERS[job.queue as QueueName];
    if (!handler) {
      await fail(job.id, new Error(`No handler for queue ${job.queue}`), job.attempts, job.maxAttempts);
      continue;
    }

    try {
      await handler(job.payload);
      await complete(job.id);
      processed += 1;
    } catch (error) {
      await fail(job.id, error, job.attempts, job.maxAttempts);
    }
  }

  return processed;
}
