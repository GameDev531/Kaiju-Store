import { NextResponse } from "next/server";
import { ingestPaymentWebhook } from "@/server/payments";
import { log } from "@/server/lib/logger";

/**
 * Payment provider webhook.
 *
 * The body is read as raw text before anything else — signature verification is
 * over the exact bytes the provider signed, and any framework-level JSON parsing
 * would have already changed them.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch (error) {
    log.warn("webhook.payments.unreadable_body", { error });
    return NextResponse.json({ error: { code: "VALIDATION_FAILED" } }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE" } }, { status: 413 });
  }

  const result = await ingestPaymentWebhook(raw, request.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

/** Anything but POST is a misconfiguration; say so without leaking behaviour. */
export async function GET() {
  return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
}
