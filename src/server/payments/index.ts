import { db } from "../db";
import { env } from "../lib/env";
import { AppError } from "../lib/errors";
import { log, securityEvent } from "../lib/logger";
import { sha256 } from "../lib/crypto";
import { transitionOrder } from "../domain/orders";
import { consumeReservations, releaseReservations } from "../domain/stock";
import { recordAudit } from "../domain/audit";
import { enqueue } from "../jobs/queue";
import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";

export type { PaymentProvider, CreateIntentInput, PaymentIntent } from "./provider";

export function paymentProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return new MockPaymentProvider();
    default:
      // Stripe/MercadoPago adapters implement the same interface; until one is
      // contracted, failing loudly beats silently taking orders that cannot be paid.
      throw new AppError("PROVIDER_ERROR", "Meio de pagamento indisponível no momento.", {
        action: "Tente novamente em instantes ou fale com o suporte.",
        internal: { configured: env.PAYMENT_PROVIDER },
      });
  }
}

/**
 * Webhook ingestion.
 *
 * The four properties that matter, in order:
 *  1. Authenticated — the signature is verified before the body is parsed for
 *     anything meaningful.
 *  2. Persisted first — the raw event is stored before any state changes, so a
 *     crash mid-processing leaves an auditable record to replay from.
 *  3. Idempotent — (provider, externalId) is a unique key. A duplicate delivery
 *     returns success without re-applying the effect.
 *  4. Replay-safe — the provider's timestamp window plus the uniqueness constraint
 *     mean an intercepted-and-resent event does nothing.
 */
export async function ingestPaymentWebhook(rawBody: string, headers: Headers): Promise<{ status: number; body: unknown }> {
  const provider = paymentProvider();
  const verification = provider.verifyWebhook(rawBody, headers);

  if (!verification.valid) {
    securityEvent("webhook.signature.invalid", {
      provider: provider.name,
      reason: verification.reason,
      route: "payments",
    });
    // A deliberately vague 400: an attacker probing signatures learns nothing.
    return { status: 400, body: { error: { code: "VALIDATION_FAILED", message: "Invalid webhook." } } };
  }

  const externalId = verification.externalId!;
  const eventType = verification.eventType!;
  const payload = verification.payload ?? {};

  // Store-then-process. The unique constraint is the idempotency guarantee.
  let eventRowId: string;
  try {
    const row = await db.webhookEvent.create({
      data: {
        provider: provider.name,
        externalId,
        eventType,
        signatureOk: true,
        payloadHash: sha256(rawBody),
        payloadJson: rawBody.slice(0, 100_000),
        status: "RECEIVED",
      },
    });
    eventRowId = row.id;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      securityEvent("webhook.replay.blocked", { provider: provider.name, externalId, eventType });
      // Already handled. 200 so the provider stops retrying.
      return { status: 200, body: { received: true, duplicate: true } };
    }
    throw error;
  }

  try {
    await applyPaymentEvent(eventType, payload, externalId);
    await db.webhookEvent.update({
      where: { id: eventRowId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return { status: 200, body: { received: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.webhookEvent.update({
      where: { id: eventRowId },
      data: { status: "FAILED", error: message.slice(0, 1000) },
    });
    log.error("payments.webhook_processing_failed", { externalId, eventType, error });
    // 500 asks the provider to retry; the unique row is already there, so the
    // retry path goes through the duplicate branch and we recover by replaying
    // from the stored payload instead.
    return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Processing failed." } } };
  }
}

async function applyPaymentEvent(
  eventType: string,
  payload: Record<string, unknown>,
  externalId: string,
): Promise<void> {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const providerRef = typeof data.payment_ref === "string" ? data.payment_ref : null;
  if (!providerRef) {
    log.warn("payments.webhook_without_ref", { eventType, externalId });
    return;
  }

  const payment = await db.payment.findUnique({
    where: { providerRef },
    select: { id: true, orderId: true, status: true, amountCents: true, currency: true },
  });
  if (!payment) {
    log.warn("payments.webhook_unknown_payment", { eventType, providerRef });
    return;
  }

  switch (eventType) {
    case "payment.captured":
    case "payment.succeeded": {
      // The provider's amount is authoritative; a mismatch against what we
      // recorded is a fraud signal, not something to reconcile silently.
      const reported = typeof data.amount_cents === "number" ? data.amount_cents : null;
      if (reported !== null && reported !== payment.amountCents) {
        await db.fraudSignal.create({
          data: {
            orderId: payment.orderId,
            kind: "VELOCITY",
            score: 90,
            detail: `Valor divergente: esperado ${payment.amountCents}, recebido ${reported}`,
            action: "HELD",
          },
        });
        await transitionOrder({
          orderId: payment.orderId,
          to: "ON_HOLD",
          actor: "SYSTEM",
          reason: "Divergência de valor no pagamento — retido para conferência.",
        });
        return;
      }

      if (payment.status === "CAPTURED") return; // already applied

      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "CAPTURED",
          capturedAt: new Date(),
          authorizedAt: new Date(),
          instrumentBrand: typeof data.brand === "string" ? data.brand : null,
          instrumentLast4: typeof data.last4 === "string" ? data.last4.slice(-4) : null,
        },
      });
      // Money is in: the hold becomes a sale. Stock on hand drops and the
      // reservation stops holding — both together, or the unit is lost twice.
      await consumeReservations(payment.orderId);

      await transitionOrder({
        orderId: payment.orderId,
        to: "PAID",
        actor: "PROVIDER_WEBHOOK",
        reason: "Pagamento confirmado pelo provedor.",
        meta: { providerRef, externalId },
      });
      await enqueue("webhook_effect", { kind: "MATCH_PRODUCERS", orderId: payment.orderId }, { dedupeKey: `match:${payment.orderId}` });
      break;
    }

    case "payment.failed": {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureCode: typeof data.failure_code === "string" ? data.failure_code : "unknown",
        },
      });
      // The order goes back for another attempt, so the hold stays — but only
      // until its existing deadline. A failed payment does not extend the window;
      // that would let repeated failures hold stock indefinitely.
      await transitionOrder({
        orderId: payment.orderId,
        to: "CUSTOMER_APPROVED",
        actor: "PROVIDER_WEBHOOK",
        reason: failureMessage(typeof data.failure_code === "string" ? data.failure_code : "unknown"),
      });
      break;
    }

    case "payment.chargeback": {
      await db.payment.update({ where: { id: payment.id }, data: { status: "CHARGEBACK" } });
      await db.fraudSignal.create({
        data: { orderId: payment.orderId, kind: "REFUND_ABUSE", score: 80, detail: "Chargeback aberto.", action: "HELD" },
      });
      await transitionOrder({
        orderId: payment.orderId,
        to: "DISPUTED",
        actor: "PROVIDER_WEBHOOK",
        reason: "Chargeback aberto pelo emissor.",
      });
      break;
    }

    case "payment.cancelled":
    case "payment.expired": {
      await db.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
      await releaseReservations(payment.orderId, "Pagamento cancelado ou expirado no provedor.");
      await transitionOrder({
        orderId: payment.orderId,
        to: "CANCELLED",
        actor: "PROVIDER_WEBHOOK",
        reason: "O pagamento foi cancelado. As peças voltaram para o catálogo.",
      }).catch(() => undefined);
      break;
    }

    case "refund.succeeded": {
      const refundRef = typeof data.refund_ref === "string" ? data.refund_ref : null;
      if (refundRef) {
        await db.refund.updateMany({ where: { providerRef: refundRef }, data: { status: "SUCCEEDED" } });
      }
      await transitionOrder({
        orderId: payment.orderId,
        to: "REFUNDED",
        actor: "PROVIDER_WEBHOOK",
        reason: "Reembolso concluído pelo provedor.",
      });
      break;
    }

    default:
      log.info("payments.webhook_ignored", { eventType, externalId });
  }
}

/** Failure reasons the customer can act on, instead of "payment declined". */
function failureMessage(code: string): string {
  const map: Record<string, string> = {
    insufficient_funds: "O pagamento não passou por saldo insuficiente. Tente outro cartão ou pague via PIX.",
    card_declined: "O banco recusou a transação. Isso costuma ser resolvido ligando para o emissor ou usando outro cartão.",
    expired_card: "O cartão está vencido. Use outro cartão.",
    incorrect_cvc: "O código de segurança não confere. Confira os três dígitos no verso.",
    processing_error: "Houve uma falha técnica no processamento. Tente novamente em alguns minutos.",
    pix_expired: "O código PIX expirou. Gere um novo para concluir.",
  };
  return map[code] ?? "O pagamento não foi concluído. Você pode tentar novamente com outro meio de pagamento.";
}

/**
 * Refunds are server-authoritative and bounded by what was actually captured.
 * There is no code path where a client-supplied amount becomes a refund.
 */
export async function issueRefund(params: {
  orderId: string;
  amountCents: number;
  reason: string;
  kind: "FULL" | "PARTIAL";
  approvedByUserId: string;
}): Promise<string> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    include: { payments: true, refunds: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "Pedido não encontrado.");

  const captured = order.payments
    .filter((p) => p.status === "CAPTURED")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const alreadyRefunded = order.refunds
    .filter((r) => r.status !== "FAILED")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const available = captured - alreadyRefunded;

  if (params.amountCents <= 0) {
    throw new AppError("VALIDATION_FAILED", "O valor do reembolso precisa ser maior que zero.");
  }
  if (params.amountCents > available) {
    throw new AppError(
      "REFUND_EXCEEDS_CAPTURED",
      `O reembolso solicitado excede o valor disponível (${(available / 100).toFixed(2)}).`,
      { action: "Ajuste o valor para no máximo o total ainda não reembolsado." },
    );
  }

  const capturedPayment = order.payments.find((p) => p.status === "CAPTURED");
  if (!capturedPayment) throw new AppError("PRECONDITION_FAILED", "Não há pagamento capturado para reembolsar.");

  const provider = paymentProvider();
  const result = await provider.refund({
    providerRef: capturedPayment.providerRef,
    amountCents: params.amountCents,
    currency: capturedPayment.currency as "BRL",
    reason: params.reason,
    idempotencyKey: `refund:${params.orderId}:${alreadyRefunded + params.amountCents}`,
  });

  const refund = await db.refund.create({
    data: {
      orderId: params.orderId,
      paymentId: capturedPayment.id,
      providerRef: result.providerRef,
      amountCents: params.amountCents,
      currency: capturedPayment.currency,
      reason: params.reason,
      kind: params.kind,
      status: result.status,
      approvedByUserId: params.approvedByUserId,
    },
  });

  await recordAudit({
    actorUserId: params.approvedByUserId,
    action: "payment.refund_issued",
    targetType: "Order",
    targetId: params.orderId,
    newState: { amountCents: params.amountCents, kind: params.kind, refundId: refund.id },
    reason: params.reason,
  });
  securityEvent("admin.sensitive_action", {
    userId: params.approvedByUserId,
    action: "refund",
    orderId: params.orderId,
    amountCents: params.amountCents,
  });

  return refund.id;
}
