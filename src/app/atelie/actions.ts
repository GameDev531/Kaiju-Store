"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireAuth, assertCsrf, rateLimitSubject } from "@/server/auth/session";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/ratelimit";
import { AppError, toAppError, forbidden } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { recordAudit } from "@/server/domain/audit";
import { acceptJob, declineJob, advanceStage, submitQualityCheck } from "@/server/domain/production";
import { storeImage } from "@/server/storage";
import { PRODUCTION_STAGES, type ProductionStageName } from "@/server/domain/enums";
import { QC_CHECKLIST } from "./constants";
import { transitionOrder } from "@/server/domain/orders";

export interface AtelierState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  redirectTo?: string;
}

const failure = (error: unknown): AtelierState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("atelier.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

/**
 * Resolves the caller's own producer record.
 *
 * Every action in this file starts here. There is no code path that takes a
 * producerId from a form field — the producer is derived from the session, so a
 * forged id in a request body addresses nothing.
 */
async function requireProducer(): Promise<{ producerId: string; userId: string }> {
  const auth = await requireAuth();
  const producer = await db.producer.findUnique({
    where: { userId: auth.user.id },
    select: { id: true, status: true },
  });
  if (!producer) throw forbidden("acessar a área do ateliê");
  if (producer.status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "Sua conta de ateliê está suspensa.", {
      action: "Fale com o suporte para entender o motivo.",
    });
  }
  return { producerId: producer.id, userId: auth.user.id };
}

// ------------------------------------------------------------- onboarding ---

const ApplySchema = z.object({
  studioName: z.string().trim().min(2, "Informe o nome do ateliê.").max(120),
  bio: z.string().trim().max(1200).optional(),
  city: z.string().trim().min(2, "Informe a cidade.").max(100),
  state: z.string().trim().length(2, "Use a sigla do estado."),
  weeklyCapacity: z.coerce.number().int().min(1).max(50),
  maxComplexity: z.coerce.number().int().min(1).max(5),
  specializations: z.array(z.string()).min(1, "Escolha ao menos uma especialização."),
});

export async function applyAsProducerAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("atelier.apply", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.write, await rateLimitSubject(auth), { userId: auth.user.id });

    const existing = await db.producer.findUnique({ where: { userId: auth.user.id }, select: { id: true } });
    if (existing) {
      return { ok: false, code: "CONFLICT", message: "Você já tem um cadastro de ateliê.", action: "Acompanhe a análise no painel do ateliê." };
    }

    const parsed = ApplySchema.safeParse({
      studioName: formData.get("studioName"),
      bio: formData.get("bio") || undefined,
      city: formData.get("city"),
      state: formData.get("state"),
      weeklyCapacity: formData.get("weeklyCapacity"),
      maxComplexity: formData.get("maxComplexity"),
      specializations: formData.getAll("specializations").map(String),
    });
    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Faltam informações no cadastro.",
        action: "Corrija os campos destacados.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const producer = await db.producer.create({
      data: {
        userId: auth.user.id,
        studioName: parsed.data.studioName,
        bio: parsed.data.bio ?? null,
        city: parsed.data.city,
        state: parsed.data.state.toUpperCase(),
        weeklyCapacity: parsed.data.weeklyCapacity,
        maxComplexity: parsed.data.maxComplexity,
        // Applications start UNVERIFIED and PENDING. A human reviews the
        // documentation before any real customer's garment reaches this studio.
        status: "PENDING",
        verificationLevel: "UNVERIFIED",
      },
    });

    for (const raw of parsed.data.specializations) {
      const [kind, value] = raw.split(":");
      if (!kind || !value) continue;
      await db.producerSpecialization.create({
        data: { producerId: producer.id, kind, value, skillLevel: 3 },
      }).catch(() => undefined);
    }

    // Granting the PRODUCER role at application time only unlocks the dashboard;
    // job offers require ACTIVE + VERIFIED, which only an admin can set.
    const { parseRoles, serializeRoles } = await import("@/server/domain/enums");
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { roles: true } });
    const roles = parseRoles(user.roles);
    if (!roles.includes("PRODUCER")) {
      await db.user.update({
        where: { id: auth.user.id },
        data: { roles: serializeRoles([...roles, "PRODUCER"]) },
      });
    }

    await recordAudit({
      actorUserId: auth.user.id,
      action: "producer.applied",
      targetType: "Producer",
      targetId: producer.id,
      newState: { studioName: producer.studioName, status: "PENDING" },
    });

    return { ok: true, redirectTo: "/atelie/painel" };
  } catch (error) {
    return failure(error);
  }
}

// ------------------------------------------------------------------ jobs ----

export async function acceptJobAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId } = await requireProducer();
    await assertCsrf("atelier.job.accept", formData.get("csrf"));
    const jobId = String(formData.get("jobId") ?? "");
    await acceptJob(jobId, producerId);
    revalidatePath("/atelie/painel");
    return {
      ok: true,
      message: "Trabalho aceito.",
      action: "A ficha técnica completa e as medidas já estão disponíveis.",
      redirectTo: `/atelie/painel/trabalhos/${jobId}`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function declineJobAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId } = await requireProducer();
    await assertCsrf("atelier.job.decline", formData.get("csrf"));
    const jobId = String(formData.get("jobId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 3) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Diga por que está recusando.",
        action: "O motivo ajuda a não te oferecer o mesmo tipo de trabalho de novo.",
        fields: { reason: "Informe um motivo." },
      };
    }
    await declineJob(jobId, producerId, reason);
    revalidatePath("/atelie/painel");
    return { ok: true, message: "Trabalho recusado.", action: "Vamos oferecer a outro ateliê compatível." };
  } catch (error) {
    return failure(error);
  }
}

const StageSchema = z.object({
  jobId: z.string().min(1),
  stage: z.enum(PRODUCTION_STAGES),
  status: z.enum(["IN_PROGRESS", "DONE", "BLOCKED"]),
  note: z.string().trim().max(500).optional(),
  blockedReason: z.string().trim().max(300).optional(),
});

export async function advanceStageAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId } = await requireProducer();
    await assertCsrf("atelier.job.stage", formData.get("csrf"));

    const parsed = StageSchema.safeParse({
      jobId: formData.get("jobId"),
      stage: formData.get("stage"),
      status: formData.get("status"),
      note: formData.get("note") || undefined,
      blockedReason: formData.get("blockedReason") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, code: "VALIDATION_FAILED", message: "Etapa inválida.", action: "Recarregue a página." };
    }

    if (parsed.data.status === "BLOCKED" && !parsed.data.blockedReason) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Explique o que está travando a produção.",
        action: "O cliente recebe exatamente este texto, então seja específico sobre o que precisa ser decidido.",
        fields: { blockedReason: "Descreva o impedimento." },
      };
    }

    await advanceStage({
      jobId: parsed.data.jobId,
      producerId,
      stage: parsed.data.stage as ProductionStageName,
      status: parsed.data.status,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      ...(parsed.data.blockedReason ? { blockedReason: parsed.data.blockedReason } : {}),
    });

    revalidatePath(`/atelie/painel/trabalhos/${parsed.data.jobId}`);
    return {
      ok: true,
      message: parsed.data.status === "BLOCKED" ? "Impedimento registrado." : "Etapa atualizada.",
      action: parsed.data.status === "BLOCKED"
        ? "O cliente foi avisado e a produção fica parada até a resposta."
        : "O cliente vê esta atualização no acompanhamento do pedido.",
    };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadProgressPhotoAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId, userId } = await requireProducer();
    await assertCsrf("atelier.job.photo", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.upload, await rateLimitSubject(null), { userId });

    const jobId = String(formData.get("jobId") ?? "");
    const caption = String(formData.get("caption") ?? "").trim().slice(0, 200);
    const stage = String(formData.get("stage") ?? "").trim() || null;
    const kind = String(formData.get("kind") ?? "PROGRESS");

    // Ownership check before touching the bytes.
    const job = await db.productionJob.findFirst({ where: { id: jobId, producerId }, select: { id: true } });
    if (!job) throw new AppError("NOT_FOUND", "Trabalho não encontrado.");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, code: "VALIDATION_FAILED", message: "Escolha uma foto.", action: "Selecione um arquivo de imagem.", fields: { file: "Nenhum arquivo selecionado." } };
    }

    const stored = await storeImage({
      buffer: Buffer.from(await file.arrayBuffer()),
      declaredName: file.name,
      purpose: kind === "QC" ? "QC_PHOTO" : "PROGRESS_PHOTO",
      ownerUserId: userId,
    });

    await db.productionAsset.create({
      data: {
        jobId,
        fileId: stored.fileId,
        kind: kind === "QC" ? "QC" : "PROGRESS",
        stage,
        caption: caption || null,
        // Progress photos are the customer's window into their own garment.
        visibleToCustomer: true,
      },
    });

    revalidatePath(`/atelie/painel/trabalhos/${jobId}`);
    return { ok: true, message: "Foto enviada.", action: "O cliente já consegue ver no acompanhamento do pedido." };
  } catch (error) {
    return failure(error);
  }
}

export async function submitQualityCheckAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId, userId } = await requireProducer();
    await assertCsrf("atelier.job.qc", formData.get("csrf"));

    const jobId = String(formData.get("jobId") ?? "");

    // Measured values arrive in centimetres and are stored as integer millimetres.
    const measured: Record<string, number> = {};
    for (const key of ["chest", "waist", "hip", "shoulder", "sleeve", "inseam", "outseam", "neck", "thigh", "wrist", "torso", "height"]) {
      const raw = formData.get(`measured.${key}`);
      if (typeof raw !== "string" || raw.trim() === "") continue;
      const cm = Number(raw.replace(",", "."));
      if (Number.isFinite(cm)) measured[`${key}Mm`] = Math.round(cm * 10);
    }

    const checklist: Record<string, boolean> = {};
    for (const item of QC_CHECKLIST) {
      checklist[item.key] = formData.get(`check.${item.key}`) === "on";
    }

    const result = await submitQualityCheck({ jobId, producerId, measured, checklist, inspectorUserId: userId });

    revalidatePath(`/atelie/painel/trabalhos/${jobId}`);
    if (result.result === "PASS") {
      return { ok: true, message: "Controle de qualidade aprovado.", action: "A peça pode ser embalada e postada." };
    }
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: `Controle de qualidade reprovado em ${result.failures.length} ponto(s).`,
      action: `Corrija e refaça a conferência. Divergências: ${result.failures.slice(0, 3).join("; ")}`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function markReadyToShipAction(_prev: AtelierState, formData: FormData): Promise<AtelierState> {
  try {
    const { producerId, userId } = await requireProducer();
    await assertCsrf("atelier.job.ready", formData.get("csrf"));
    const jobId = String(formData.get("jobId") ?? "");

    const job = await db.productionJob.findFirst({
      where: { id: jobId, producerId },
      include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!job) throw new AppError("NOT_FOUND", "Trabalho não encontrado.");

    // A garment cannot be declared ready without a passing quality check on record.
    const lastCheck = job.checks[0];
    if (!lastCheck || lastCheck.result === "FAIL") {
      return {
        ok: false, code: "PRECONDITION_FAILED",
        message: "Registre um controle de qualidade aprovado antes de marcar como pronto.",
        action: "Preencha as medidas finais e o checklist na aba de qualidade.",
      };
    }

    await db.productionJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.producer.update({
      where: { id: producerId },
      data: { activeJobCount: { decrement: 1 } },
    });
    await transitionOrder({
      orderId: job.orderId,
      to: "READY_TO_SHIP",
      actor: "PRODUCER",
      actorUserId: userId,
      reason: "Peça aprovada na qualidade e embalada.",
    }).catch(() => undefined);

    const { recomputeProducerScores } = await import("@/server/domain/production");
    await recomputeProducerScores(producerId);

    revalidatePath(`/atelie/painel/trabalhos/${jobId}`);
    return { ok: true, message: "Peça marcada como pronta para envio.", action: "A logística assume a partir daqui." };
  } catch (error) {
    return failure(error);
  }
}
