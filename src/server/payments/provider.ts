import type { CurrencyCode } from "../lib/money";

/**
 * Payment provider boundary.
 *
 * The application never sees a card number. It asks a provider to create an
 * intent, redirects or renders the provider's own element, and then waits for a
 * signed webhook to tell it money moved. Nothing about payment state is ever
 * believed because the browser said so.
 */

export interface CreateIntentInput {
  orderId: string;
  orderReference: string;
  amountCents: number;
  currency: CurrencyCode;
  method: "CARD" | "PIX" | "BOLETO";
  customerEmail: string;
  /** Makes retrying the same checkout safe at the provider too. */
  idempotencyKey: string;
  returnUrl: string;
}

export interface PaymentIntent {
  providerRef: string;
  status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED";
  /** Where to send the customer, when the provider hosts the payment step. */
  redirectUrl?: string;
  /** For PIX: the copy-and-paste code. Never a secret. */
  displayCode?: string;
  expiresAt?: Date;
}

export interface RefundInput {
  providerRef: string;
  amountCents: number;
  currency: CurrencyCode;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRef: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
  externalId?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Signature + timestamp verification. Must be constant-time on the signature. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification;
}
