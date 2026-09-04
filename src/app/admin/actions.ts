"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePermissionContext, assertCsrf } from "@/server/auth/session";
import { toAppError, AppError } from "@/server/lib/errors";
import { log, securityEvent } from "@/server/lib/logger";
import { recordAudit } from "@/server/domain/audit";
import { transitionOrder } from "@/server/domain/orders";
import { issueRefund } from "@/server/payments";
import { VERIFICATION_LEVELS, OrderStatusSchema } from "@/server/domain/enums";

export interface AdminState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
}

const failure = (error: unknown): AdminState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("admin.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

/**
 * Producer verification.
 *
 * The gate that everything downstream depends on: an unverified studio never
 * receives a customer's garment. Every decision here is recorded with who,
 * what, when and why.
 */
const VerifySchema = z.object({
  producerId: z.string().min(1),
  level: z.enum(VERIFICATION_LEVELS),
  status: z.enum(["PENDING", "ACTIVE", "PAUSED", "SUSPENDED"]),
  reason: z.string().trim().min(5, "Registre o motivo da decisão.").max(500),
});

export async function setProducerVerificationAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    const auth = await requirePermissionContext("admin.producer.verify");
    await assertCsrf("admin.producer.verify", formData.get("csrf"));

    const parsed = VerifySchema.safeParse({
      producerId: formData.get("producerId"),
      level: formData.get("level"),
      status: formData.get("status"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Decisão incompleta.",
        action: "Toda mudança de verificação exige um motivo registrado.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const before = await db.producer.findUnique({
      where: { id: parsed.data.producerId },
      select: { id: true, studioName: true, verificationLevel: true, status: true },
    });
    if (!before) throw new AppError("NOT_FOUND", "Ateliê não encontrado.");

    // An unverified studio cannot be ACTIVE — that combination would let a
    // garment reach a studio nobody checked.
    if (parsed.data.status === "ACTIVE" && parsed.data.level === "UNVERIFIED") {
      return {
        ok: false, code: "PRECONDITION_FAILED",
        message: "Um ateliê não verificado não pode ficar ativo.",
        action: "Defina ao menos o nível Verificado antes de ativar, ou mantenha o status como pendente.",
        fields: { level: "Ative apenas após a verificação." },
      };
    }

    await db.producer.update({
      where: { id: parsed.data.producerId },
      data: {
        verificationLevel: parsed.data.level,
        status: parsed.data.status,
        ...(parsed.data.level !== "UNVERIFIED" && !before.verificationLevel.startsWith("V") ? { verifiedAt: new Date() } : {}),
      },
    });

    await recordAudit({
      actorUserId: auth.user.id,
      actorRole: auth.user.roles.join(","),
      action: "producer.verification_changed",
      targetType: "Producer",
      targetId: parsed.data.producerId,
      oldState: { level: before.verificationLevel, status: before.status },
      newState: { level: parsed.data.level, status: parsed.data.status },
      reason: parsed.data.reason,
    });
    securityEvent("admin.sensitive_action", {
      userId: auth.user.id,
      action: "producer_verification",
      producerId: parsed.data.producerId,
      level: parsed.data.level,
    });

    // Verification documents are deleted once a decision exists — we keep the
    // outcome, not the identity document.
    if (parsed.data.status !== "PENDING") {
      const docs = await db.verificationDocument.findMany({
        where: { producerId: parsed.data.producerId, status: "PENDING" },
        select: { id: true, fileId: true },
      });
      const { deleteStoredFile } = await import("@/server/storage");
      for (const doc of docs) {
        await db.verificationDocument.update({
          where: { id: doc.id },
          data: { status: parsed.data.level === "UNVERIFIED" ? "REJECTED" : "APPROVED", reviewedByUserId: auth.user.id, reviewedAt: new Date() },
        });
        await deleteStoredFile(doc.fileId, "verification_decision_recorded").catch(() => undefined);
      }
    }

    revalidatePath("/admin/atelies");
    return {
      ok: true,
      message: `${before.studioName}: ${parsed.data.level} / ${parsed.data.status}.`,
      action: "A decisão e o motivo ficaram registrados na auditoria.",
    };
  } catch (error) {
    return failure(error);
  }
}

/** Admin override of an order's state. Always requires a written reason. */
export async function adminTransitionOrderAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    const auth = await requirePermissionContext("admin.order.write");
    await assertCsrf("admin.order.transition", formData.get("csrf"));

    const orderId = String(formData.get("orderId") ?? "");
    const to = OrderStatusSchema.parse(formData.get("to"));
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 5) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Registre o motivo da intervenção.",
        action: "O motivo aparece no histórico do pedido, que o cliente também lê.",
        fields: { reason: "Descreva o motivo." },
      };
    }

    await transitionOrder({
      orderId,
      to,
      actor: "ADMIN",
      actorUserId: auth.user.id,
      reason,
    });

    securityEvent("admin.sensitive_action", { userId: auth.user.id, action: "order_transition", orderId, to });
    revalidatePath(`/admin/pedidos`);
    return { ok: true, message: `Pedido movido para ${to}.`, action: "O cliente vê a mudança e o motivo no acompanhamento." };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Refunds. Highest-risk action in the system, so it is gated by a permission
 * that requires MFA within the step-up window, bounded by what was captured,
 * and audited with the operator's identity.
 */
export async function adminRefundAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    // requirePermissionContext enforces the MFA step-up for this permission.
    const auth = await requirePermissionContext("admin.refund.issue");
    await assertCsrf("admin.refund", formData.get("csrf"));

    const orderId = String(formData.get("orderId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const kind = formData.get("kind") === "PARTIAL" ? "PARTIAL" : "FULL";
    const amountRaw = String(formData.get("amount") ?? "").trim();

    if (reason.length < 5) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Registre o motivo do reembolso.",
        action: "Reembolso sem motivo registrado é indefensável em auditoria.",
        fields: { reason: "Descreva o motivo." },
      };
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: true, refunds: true },
    });
    if (!order) throw new AppError("NOT_FOUND", "Pedido não encontrado.");

    const captured = order.payments.filter((p) => p.status === "CAPTURED").reduce((s, p) => s + p.amountCents, 0);
    const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountCents, 0);
    const available = captured - refunded;

    let amountCents: number;
    if (kind === "FULL") {
      amountCents = available;
    } else {
      const { parseAmountToCents } = await import("@/server/lib/money");
      try {
        amountCents = parseAmountToCents(amountRaw, "BRL");
      } catch {
        return {
          ok: false, code: "VALIDATION_FAILED",
          message: "Valor de reembolso inválido.",
          action: "Informe um valor como 129,90.",
          fields: { amount: "Valor não reconhecido." },
        };
      }
    }

    const refundId = await issueRefund({
      orderId,
      amountCents,
      reason,
      kind,
      approvedByUserId: auth.user.id,
    });

    // A refunded order takes back any campaign item it qualified for.
    const { revokeGrantsForOrder } = await import("@/server/domain/rewards");
    await revokeGrantsForOrder(orderId, "Pedido reembolsado.").catch(() => undefined);

    revalidatePath(`/admin/pedidos/${order.reference}`);
    return {
      ok: true,
      message: `Reembolso de R$ ${(amountCents / 100).toFixed(2)} registrado.`,
      action: `Referência interna ${refundId.slice(0, 10)}. A operação está na auditoria com o seu nome.`,
    };
  } catch (error) {
    return failure(error);
  }
}
