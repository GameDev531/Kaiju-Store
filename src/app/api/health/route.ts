import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { activeProviderName } from "@/server/ai";
import { env } from "@/server/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness and readiness in one endpoint.
 *
 * It reports the state of dependencies a load balancer can act on, and nothing
 * an attacker can use: no versions, no hostnames, no connection strings, no
 * queue contents.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "degraded" | "down"> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }

  try {
    const stuck = await db.jobQueueItem.count({
      where: { status: "PENDING", runAfter: { lt: new Date(Date.now() - 30 * 60_000) } },
    });
    checks.queue = stuck > 100 ? "degraded" : "ok";
  } catch {
    checks.queue = "down";
  }

  const dead = Object.values(checks).some((v) => v === "down");
  const degraded = Object.values(checks).some((v) => v === "degraded");

  return NextResponse.json(
    {
      status: dead ? "down" : degraded ? "degraded" : "ok",
      checks,
      ai: { provider: activeProviderName() },
      environment: env.APP_ENV,
      latencyMs: Date.now() - started,
    },
    { status: dead ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
