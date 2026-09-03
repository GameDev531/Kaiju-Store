import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type {
  PaymentProvider,
  CreateIntentInput,
  PaymentIntent,
  RefundInput,
  RefundResult,
  WebhookVerification,
} from "./provider";
import { env } from "../lib/env";

/**
 * Development / test payment provider.
 *
 * It implements the same contract a real gateway does — including HMAC webhook
 * signatures with a timestamp — so the security-critical paths (signature
 * verification, replay windows, idempotency) are exercised by the test suite
 * rather than stubbed out and discovered in production.
 *
 * It moves no money and must never be selected in production; env.ts enforces
 * that the production webhook secret is not the development one.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    const providerRef = `mock_pi_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    if (input.method === "PIX") {
      return {
        providerRef,
        status: "PENDING",
        displayCode: `00020126${providerRef.toUpperCase()}5204000053039865802BR`,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      };
    }
    return {
      providerRef,
      status: "PENDING",
      redirectUrl: `${env.APP_URL}/checkout/simulacao?ref=${providerRef}&order=${input.orderReference}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { providerRef: `mock_re_${randomUUID().replace(/-/g, "").slice(0, 20)}`, status: "SUCCEEDED" };
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    const signature = headers.get("x-kaiju-signature");
    const timestamp = headers.get("x-kaiju-timestamp");
    if (!signature || !timestamp) return { valid: false, reason: "missing_signature_headers" };

    // Reject anything outside a 5-minute window: an old capture cannot be
    // replayed later even with a valid signature.
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return { valid: false, reason: "timestamp_outside_window" };
    }

    const expected = createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "signature_mismatch" };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false, reason: "malformed_json" };
    }

    const externalId = typeof payload.id === "string" ? payload.id : undefined;
    const eventType = typeof payload.type === "string" ? payload.type : undefined;
    if (!externalId || !eventType) return { valid: false, reason: "missing_id_or_type" };

    return { valid: true, externalId, eventType, payload };
  }

  /** Test helper: produces the headers a real provider would send. */
  static sign(rawBody: string, secret: string, atSeconds = Math.floor(Date.now() / 1000)): Headers {
    const signature = createHmac("sha256", secret).update(`${atSeconds}.${rawBody}`, "utf8").digest("hex");
    return new Headers({
      "x-kaiju-signature": signature,
      "x-kaiju-timestamp": String(atSeconds),
      "content-type": "application/json",
    });
  }
}
