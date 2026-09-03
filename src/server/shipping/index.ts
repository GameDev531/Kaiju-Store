import { db } from "../db";
import { env } from "../lib/env";
import { log, securityEvent } from "../lib/logger";
import { AppError } from "../lib/errors";
import { transitionOrder } from "../domain/orders";
import type { ShipmentStatus } from "../domain/enums";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shipping is an abstraction layer, not an integration.
 *
 * Core business logic knows about quotes, labels, tracking codes and shipment
 * events. It does not know that Correios exists. Adding a carrier means writing
 * one adapter and registering it — no order, checkout, or production code changes.
 */

export interface ShippingQuoteRequest {
  originPostalCode: string;
  destinationPostalCode: string;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  declaredValueCents: number;
}

export interface ShippingQuote {
  provider: string;
  service: string;
  serviceLabel: string;
  priceCents: number;
  estimatedDays: number;
  /** True when the quote came from a live carrier API rather than a table. */
  live: boolean;
}

export interface LabelRequest {
  shipmentId: string;
  service: string;
  recipient: { name: string; postalCode: string; line1: string; city: string; state: string };
  weightGrams: number;
}

export interface LabelResult {
  trackingCode: string;
  labelFileKey?: string;
  estimatedDeliveryAt?: Date;
}

export interface CarrierEvent {
  externalId: string;
  code: string;
  description: string;
  location?: string;
  occurredAt: Date;
  status: ShipmentStatus;
}

export interface ShippingProvider {
  readonly name: string;
  quote(request: ShippingQuoteRequest): Promise<ShippingQuote[]>;
  createLabel(request: LabelRequest): Promise<LabelResult>;
  /** Normalises a carrier's own event vocabulary into ours. */
  parseWebhook(rawBody: string, headers: Headers): { valid: boolean; reason?: string; trackingCode?: string; events?: CarrierEvent[] };
}

/**
 * Manual provider: the operator books postage and enters the tracking code.
 *
 * This is what a real early-stage operation actually does before it has carrier
 * contracts, and it exercises the same interface — so switching to an API-backed
 * carrier later changes one line of configuration.
 */
class ManualShippingProvider implements ShippingProvider {
  readonly name = "manual";

  async quote(request: ShippingQuoteRequest): Promise<ShippingQuote[]> {
    // A published zone table, not a fabricated carrier price. Region is derived
    // from the first digit of the Brazilian postal code.
    const region = Number(request.destinationPostalCode.replace(/\D/g, "").charAt(0) || "0");
    const billableGrams = Math.max(request.weightGrams, volumetricGrams(request));
    const bands: { maxGrams: number; base: number }[] = [
      { maxGrams: 500, base: 2_490 },
      { maxGrams: 1_000, base: 3_290 },
      { maxGrams: 2_000, base: 4_490 },
      { maxGrams: 5_000, base: 6_990 },
      { maxGrams: Number.MAX_SAFE_INTEGER, base: 9_900 },
    ];
    const band = bands.find((b) => billableGrams <= b.maxGrams)!;
    // Zone surcharge: further from the São Paulo dispatch region costs more.
    const zoneSurcharge = [0, 0, 400, 900, 1_400, 1_400, 1_900, 1_900, 2_400, 2_400][region] ?? 1_900;
    const days = [0, 4, 5, 6, 8, 8, 9, 9, 11, 11][region] ?? 9;

    return [
      {
        provider: this.name,
        service: "STANDARD",
        serviceLabel: "Entrega padrão",
        priceCents: band.base + zoneSurcharge,
        estimatedDays: days,
        live: false,
      },
      {
        provider: this.name,
        service: "EXPRESS",
        serviceLabel: "Entrega expressa",
        priceCents: Math.round((band.base + zoneSurcharge) * 1.8),
        estimatedDays: Math.max(2, Math.round(days / 2)),
        live: false,
      },
    ];
  }

  async createLabel(): Promise<LabelResult> {
    // Deliberately unimplemented: the operator posts the parcel and records the
    // real tracking code. Inventing one here would put a fake code in front of
    // a customer, which is worse than an honest manual step.
    throw new AppError("PROVIDER_ERROR", "Este envio precisa ser postado manualmente pela operação.", {
      action: "A equipe registra o código de rastreio assim que a etiqueta é emitida.",
    });
  }

  parseWebhook(): { valid: boolean; reason: string } {
    return { valid: false, reason: "manual provider receives no webhooks" };
  }
}

const providers: Record<string, ShippingProvider> = {
  manual: new ManualShippingProvider(),
};

export function shippingProvider(name?: string): ShippingProvider {
  const key = name ?? env.SHIPPING_PROVIDER;
  const provider = providers[key];
  if (!provider) {
    throw new AppError("PROVIDER_ERROR", "Transportadora não configurada.", { internal: { key } });
  }
  return provider;
}

/** Volumetric weight: 6000 cm³ per kg, the standard divisor. */
function volumetricGrams(r: ShippingQuoteRequest): number {
  return Math.round(((r.lengthCm * r.widthCm * r.heightCm) / 6000) * 1000);
}

export async function quoteShipping(request: ShippingQuoteRequest): Promise<ShippingQuote[]> {
  const postal = request.destinationPostalCode.replace(/\D/g, "");
  if (postal.length !== 8) {
    throw new AppError("VALIDATION_FAILED", "O CEP precisa ter 8 dígitos.", {
      fields: { postalCode: "Informe um CEP válido, com ou sem hífen." },
      action: "Confira o CEP de entrega.",
    });
  }
  try {
    return await shippingProvider().quote({ ...request, destinationPostalCode: postal });
  } catch (error) {
    log.error("shipping.quote_failed", { error });
    throw new AppError("PROVIDER_ERROR", "Não conseguimos calcular o frete agora.", {
      action: "Tente novamente em instantes. Se persistir, finalize o pedido e a equipe envia o valor do frete por e-mail.",
      cause: error,
    });
  }
}

/**
 * Applies carrier events idempotently.
 *
 * `(shipmentId, externalId)` is unique, so a carrier that resends a week of
 * history — which they do — produces no duplicates and no repeated state changes.
 */
export async function applyCarrierEvents(shipmentId: string, events: CarrierEvent[]): Promise<number> {
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, orderId: true, status: true },
  });
  if (!shipment) throw new AppError("NOT_FOUND", "Envio não encontrado.");

  let applied = 0;
  let latest: CarrierEvent | null = null;

  for (const event of events) {
    try {
      await db.shipmentEvent.create({
        data: {
          shipmentId,
          externalId: event.externalId,
          code: event.code,
          description: event.description,
          location: event.location ?? null,
          occurredAt: event.occurredAt,
        },
      });
      applied += 1;
      if (!latest || event.occurredAt > latest.occurredAt) latest = event;
    } catch (error) {
      // Unique violation = already seen. Exactly the intended outcome.
      if (!(typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002")) {
        throw error;
      }
    }
  }

  if (latest && latest.status !== shipment.status) {
    await db.shipment.update({
      where: { id: shipmentId },
      data: {
        status: latest.status,
        ...(latest.status === "DELIVERED" ? { deliveredAt: latest.occurredAt } : {}),
        ...(latest.status === "PICKED_UP" ? { shippedAt: latest.occurredAt } : {}),
      },
    });

    // Only two carrier states move the order itself; the rest are informational.
    if (latest.status === "DELIVERED") {
      await transitionOrder({
        orderId: shipment.orderId,
        to: "DELIVERED",
        actor: "PROVIDER_WEBHOOK",
        reason: "Entrega confirmada pela transportadora.",
      }).catch((e) => log.warn("shipping.transition_skipped", { orderId: shipment.orderId, error: e }));
    } else if (latest.status === "LOST" || latest.status === "RETURNED") {
      await transitionOrder({
        orderId: shipment.orderId,
        to: "ON_HOLD",
        actor: "SYSTEM",
        reason:
          latest.status === "LOST"
            ? "A transportadora reportou extravio. Abrimos a investigação e entramos em contato."
            : "A encomenda voltou ao remetente. Vamos confirmar o endereço com você.",
      }).catch((e) => log.warn("shipping.transition_skipped", { orderId: shipment.orderId, error: e }));
    }
  }

  return applied;
}

/** Same signature discipline as payments — a public URL is not an authenticator. */
export function verifyShippingWebhook(rawBody: string, headers: Headers): boolean {
  const signature = headers.get("x-carrier-signature");
  const timestamp = headers.get("x-carrier-timestamp");
  if (!signature || !timestamp) {
    securityEvent("webhook.signature.invalid", { route: "shipping", reason: "missing_headers" });
    return false;
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    securityEvent("webhook.signature.invalid", { route: "shipping", reason: "timestamp_window" });
    return false;
  }
  const expected = createHmac("sha256", env.SHIPPING_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) securityEvent("webhook.signature.invalid", { route: "shipping", reason: "mismatch" });
  return ok;
}
