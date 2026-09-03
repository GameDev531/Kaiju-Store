import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { verifyShippingWebhook, applyCarrierEvents } from "@/server/shipping";
import { sha256 } from "@/server/lib/crypto";
import { log, securityEvent } from "@/server/lib/logger";
import { SHIPMENT_STATUSES } from "@/server/domain/enums";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CarrierPayloadSchema = z.object({
  event_id: z.string().min(1).max(200),
  tracking_code: z.string().min(3).max(64),
  events: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        code: z.string().min(1).max(40),
        description: z.string().min(1).max(400),
        location: z.string().max(200).optional(),
        occurred_at: z.string().datetime(),
        status: z.enum(SHIPMENT_STATUSES),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > 256 * 1024) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  if (!verifyShippingWebhook(raw, request.headers)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }

  const parsed = CarrierPayloadSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    log.warn("webhook.shipping.schema_violation", {
      issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")),
    });
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 422 });
  }

  // Store-then-process, with the provider's event id as the idempotency key.
  try {
    await db.webhookEvent.create({
      data: {
        provider: "carrier",
        externalId: parsed.data.event_id,
        eventType: "shipment.update",
        signatureOk: true,
        payloadHash: sha256(raw),
        payloadJson: raw.slice(0, 100_000),
        status: "RECEIVED",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      securityEvent("webhook.replay.blocked", { route: "shipping", externalId: parsed.data.event_id });
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    throw error;
  }

  const shipment = await db.shipment.findFirst({
    where: { trackingCode: parsed.data.tracking_code },
    select: { id: true },
  });
  if (!shipment) {
    // Not an error: carriers push events for parcels we did not book.
    log.info("webhook.shipping.unknown_tracking", { trackingCode: parsed.data.tracking_code });
    await db.webhookEvent.updateMany({
      where: { provider: "carrier", externalId: parsed.data.event_id },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const applied = await applyCarrierEvents(
    shipment.id,
    parsed.data.events.map((e) => ({
      externalId: e.id,
      code: e.code,
      description: e.description,
      ...(e.location ? { location: e.location } : {}),
      occurredAt: new Date(e.occurred_at),
      status: e.status,
    })),
  );

  await db.webhookEvent.updateMany({
    where: { provider: "carrier", externalId: parsed.data.event_id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });

  return NextResponse.json({ received: true, applied }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
