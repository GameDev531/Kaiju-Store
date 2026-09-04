import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { MockPaymentProvider } from "@/server/payments/mock-provider";
import { verifyShippingWebhook } from "@/server/shipping";

/**
 * A public URL is not an authenticator.
 *
 * These tests cover the four properties every webhook endpoint in this codebase
 * must hold: authenticated, validated, replay-safe, and idempotent. Idempotency
 * itself lives in a unique database constraint and is asserted in the integration
 * test; here we prove the signature and replay window.
 */

const SECRET = "test-payment-webhook-secret";
const provider = new MockPaymentProvider();

const body = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "evt_test_1",
    type: "payment.captured",
    data: { payment_ref: "mock_pi_abc", amount_cents: 74_900 },
    ...overrides,
  });

const sign = (raw: string, atSeconds = Math.floor(Date.now() / 1000), secret = SECRET) =>
  MockPaymentProvider.sign(raw, secret, atSeconds);

describe("payment webhook signature", () => {
  it("accepts a correctly signed, fresh event", () => {
    const raw = body();
    const result = provider.verifyWebhook(raw, sign(raw));
    expect(result.valid).toBe(true);
    expect(result.externalId).toBe("evt_test_1");
    expect(result.eventType).toBe("payment.captured");
  });

  it("rejects an unsigned request", () => {
    const result = provider.verifyWebhook(body(), new Headers({ "content-type": "application/json" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_signature_headers");
  });

  it("rejects a signature made with the wrong secret", () => {
    const raw = body();
    const result = provider.verifyWebhook(raw, sign(raw, Math.floor(Date.now() / 1000), "wrong-secret"));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a tampered body carrying a valid signature for the original", () => {
    // The attack: intercept a real R$ 100 capture, rewrite it to R$ 100 000,
    // and replay it with the original signature.
    const original = body();
    const headers = sign(original);
    const tampered = body({ data: { payment_ref: "mock_pi_abc", amount_cents: 10_000_000 } });
    const result = provider.verifyWebhook(tampered, headers);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a stale event even when its signature is genuine", () => {
    const raw = body();
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const result = provider.verifyWebhook(raw, sign(raw, tenMinutesAgo));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_outside_window");
  });

  it("rejects an event timestamped in the future", () => {
    const raw = body();
    const future = Math.floor(Date.now() / 1000) + 600;
    const result = provider.verifyWebhook(raw, sign(raw, future));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_outside_window");
  });

  it("accepts an event at the edge of the replay window and rejects just past it", () => {
    const raw = body();
    const now = Math.floor(Date.now() / 1000);
    expect(provider.verifyWebhook(raw, sign(raw, now - 290)).valid).toBe(true);
    expect(provider.verifyWebhook(raw, sign(raw, now - 310)).valid).toBe(false);
  });

  it("rejects malformed JSON before it reaches any handler", () => {
    const raw = "{not json";
    const result = provider.verifyWebhook(raw, sign(raw));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("malformed_json");
  });

  it("rejects a signed event missing its id or type", () => {
    const raw = JSON.stringify({ data: {} });
    const result = provider.verifyWebhook(raw, sign(raw));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_id_or_type");
  });

  it("does not leak whether a mismatch was near or far", () => {
    // Every rejection returns the same coarse reason, so an attacker cannot
    // binary-search a signature from the responses.
    const raw = body();
    const almost = new Headers({
      "x-kaiju-signature": createHmac("sha256", SECRET).update(`${Math.floor(Date.now() / 1000)}.${raw}x`).digest("hex"),
      "x-kaiju-timestamp": String(Math.floor(Date.now() / 1000)),
    });
    expect(provider.verifyWebhook(raw, almost).reason).toBe("signature_mismatch");
  });
});

describe("shipping webhook signature", () => {
  const shipSecret = "test-shipping-webhook-secret";
  const shipSign = (raw: string, at = Math.floor(Date.now() / 1000)) =>
    new Headers({
      "x-carrier-signature": createHmac("sha256", shipSecret).update(`${at}.${raw}`).digest("hex"),
      "x-carrier-timestamp": String(at),
    });

  it("accepts a correctly signed carrier event", () => {
    const raw = JSON.stringify({ event_id: "c1", tracking_code: "BR123", events: [] });
    expect(verifyShippingWebhook(raw, shipSign(raw))).toBe(true);
  });

  it("rejects a wrong signature, a stale timestamp and missing headers", () => {
    const raw = JSON.stringify({ event_id: "c1" });
    expect(verifyShippingWebhook(raw, new Headers({ "x-carrier-signature": "deadbeef", "x-carrier-timestamp": String(Math.floor(Date.now() / 1000)) }))).toBe(false);
    expect(verifyShippingWebhook(raw, shipSign(raw, Math.floor(Date.now() / 1000) - 3600))).toBe(false);
    expect(verifyShippingWebhook(raw, new Headers())).toBe(false);
  });

  it("does not accept a payment signature on the shipping endpoint", () => {
    // Separate secrets per integration: a compromise of one does not forge the other.
    const raw = JSON.stringify({ event_id: "c1" });
    const at = Math.floor(Date.now() / 1000);
    const crossSigned = new Headers({
      "x-carrier-signature": createHmac("sha256", SECRET).update(`${at}.${raw}`).digest("hex"),
      "x-carrier-timestamp": String(at),
    });
    expect(verifyShippingWebhook(raw, crossSigned)).toBe(false);
  });
});

describe("payment intent creation", () => {
  it("returns a PIX code without a redirect", async () => {
    const intent = await provider.createIntent({
      orderId: "o1", orderReference: "KJ-TEST-0001", amountCents: 10_000, currency: "BRL",
      method: "PIX", customerEmail: "a@b.com", idempotencyKey: "k1", returnUrl: "http://localhost:3000/x",
    });
    expect(intent.status).toBe("PENDING");
    expect(intent.displayCode).toBeTruthy();
    expect(intent.redirectUrl).toBeUndefined();
  });

  it("never returns a captured status straight from intent creation", async () => {
    // Money is only ever confirmed by a signed webhook, never by the call that
    // creates the intent.
    const intent = await provider.createIntent({
      orderId: "o1", orderReference: "KJ-TEST-0002", amountCents: 10_000, currency: "BRL",
      method: "CARD", customerEmail: "a@b.com", idempotencyKey: "k2", returnUrl: "http://localhost:3000/x",
    });
    expect(intent.status).toBe("PENDING");
  });

  it("issues a distinct provider reference per intent", async () => {
    const a = await provider.createIntent({
      orderId: "o1", orderReference: "KJ-A", amountCents: 1, currency: "BRL", method: "PIX",
      customerEmail: "a@b.com", idempotencyKey: "k3", returnUrl: "http://x",
    });
    const b = await provider.createIntent({
      orderId: "o2", orderReference: "KJ-B", amountCents: 1, currency: "BRL", method: "PIX",
      customerEmail: "a@b.com", idempotencyKey: "k4", returnUrl: "http://x",
    });
    expect(a.providerRef).not.toBe(b.providerRef);
  });
});
