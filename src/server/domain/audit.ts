import { headers } from "next/headers";
import { db } from "../db";
import { env } from "../lib/env";
import { keyedHash } from "../lib/crypto";
import { log } from "../lib/logger";

/**
 * The audit trail.
 *
 * Every sensitive action answers WHO / WHAT / WHEN / TARGET / OLD / NEW / WHY.
 * Rows are append-only — there is no update or delete path in the application
 * for this table, and the admin UI renders it read-only.
 *
 * Writing an audit row must never break the operation it describes. A failure
 * here is logged loudly and swallowed; losing an order because the audit insert
 * timed out would be the worse outcome.
 */

export interface AuditInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  oldState?: unknown;
  newState?: unknown;
  reason?: string | null;
  correlationId?: string | null;
}

/** Fields never written into an audit snapshot, even if present in the object. */
const SNAPSHOT_DENYLIST = new Set([
  "passwordHash", "password", "mfaSecret", "mfaRecoveryCodes", "tokenHash",
  "taxId", "taxIdHash", "payoutRefLast4", "instrumentLast4",
]);

function snapshot(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const strip = (v: unknown, depth = 0): unknown => {
    if (depth > 5 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => strip(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SNAPSHOT_DENYLIST.has(k)) continue;
      out[k] = strip(val, depth + 1);
    }
    return out;
  };
  const json = JSON.stringify(strip(value));
  return json.length > 20_000 ? `${json.slice(0, 20_000)}"…truncated"` : json;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    let actorIpHash: string | null = null;
    try {
      const hdrs = await headers();
      const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip");
      if (ip) actorIpHash = keyedHash(ip, env.AUTH_SECRET).slice(0, 32);
    } catch {
      // Outside a request context (a queue worker). No IP to record; that is fine.
    }

    await db.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        actorIpHash,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        oldStateJson: snapshot(input.oldState),
        newStateJson: snapshot(input.newState),
        reason: input.reason ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  } catch (error) {
    log.error("audit.write_failed", { action: input.action, targetId: input.targetId, error });
  }
}

export async function readAuditTrail(
  targetType: string,
  targetId: string,
  limit = 100,
): Promise<
  {
    id: string;
    action: string;
    createdAt: Date;
    actorUserId: string | null;
    reason: string | null;
    oldStateJson: string | null;
    newStateJson: string | null;
  }[]
> {
  return db.auditLog.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    select: {
      id: true,
      action: true,
      createdAt: true,
      actorUserId: true,
      reason: true,
      oldStateJson: true,
      newStateJson: true,
    },
  });
}
