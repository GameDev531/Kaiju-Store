import { db } from "../db";
import { log } from "../lib/logger";
import { sha256 } from "../lib/crypto";

/**
 * A durable job queue on top of the database.
 *
 * Everything slow, flaky, or third-party goes through here: AI analysis, image
 * derivatives, malware scanning, e-mail, shipping sync, webhook side effects,
 * payout rollups. A request handler enqueues and returns; it never waits on a
 * provider.
 *
 * The driver is deliberately boring — `SELECT ... FOR UPDATE SKIP LOCKED` in
 * PostgreSQL, an optimistic claim in SQLite. Swapping in SQS or BullMQ means
 * reimplementing `claim`/`complete`, not touching a single call site.
 */

export type QueueName =
  | "ai_analysis"
  | "image_derivatives"
  | "malware_scan"
  | "email"
  | "notification"
  | "shipping_sync"
  | "webhook_effect"
  | "reward_evaluation"
  | "taste_profile"
  | "retention_sweep"
  | "payout_rollup";

export interface EnqueueOptions {
  /** Makes the enqueue itself idempotent — the same key never queues twice. */
  dedupeKey?: string;
  delaySeconds?: number;
  maxAttempts?: number;
}

export async function enqueue(
  queue: QueueName,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const runAfter = new Date(Date.now() + (options.delaySeconds ?? 0) * 1000);
  const dedupeKey = options.dedupeKey ? `${queue}:${sha256(options.dedupeKey).slice(0, 40)}` : null;

  try {
    const item = await db.jobQueueItem.create({
      data: {
        queue,
        payloadJson: JSON.stringify(payload),
        dedupeKey,
        runAfter,
        maxAttempts: options.maxAttempts ?? 5,
      },
    });
    return item.id;
  } catch (error) {
    // Unique violation on dedupeKey means the work is already queued. That is a
    // success from the caller's point of view, not an error.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      log.debug("queue.duplicate_suppressed", { queue, dedupeKey });
      return null;
    }
    throw error;
  }
}

export interface ClaimedJob {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/**
 * Claims one job. The `updateMany` guarded on `status: "PENDING"` is the
 * concurrency control: two workers racing for the same row, exactly one wins.
 */
export async function claim(queues: QueueName[], workerId: string): Promise<ClaimedJob | null> {
  const candidate = await db.jobQueueItem.findFirst({
    where: { queue: { in: queues }, status: "PENDING", runAfter: { lte: new Date() } },
    orderBy: { runAfter: "asc" },
  });
  if (!candidate) return null;

  const { count } = await db.jobQueueItem.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempts: candidate.attempts + 1 },
  });
  if (count === 0) return null; // lost the race; the caller loops

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(candidate.payloadJson) as Record<string, unknown>;
  } catch {
    await db.jobQueueItem.update({
      where: { id: candidate.id },
      data: { status: "DEAD", lastError: "payload is not valid JSON" },
    });
    return null;
  }

  return {
    id: candidate.id,
    queue: candidate.queue,
    payload,
    attempts: candidate.attempts + 1,
    maxAttempts: candidate.maxAttempts,
  };
}

export async function complete(jobId: string): Promise<void> {
  await db.jobQueueItem.update({
    where: { id: jobId },
    data: { status: "DONE", lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Exponential backoff with a cap; exhausted jobs go to DEAD for inspection. */
export async function fail(jobId: string, error: unknown, attempts: number, maxAttempts: number): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  if (attempts >= maxAttempts) {
    await db.jobQueueItem.update({
      where: { id: jobId },
      data: { status: "DEAD", lastError: message.slice(0, 1000), lockedAt: null, lockedBy: null },
    });
    log.error("queue.job_dead", { jobId, attempts, error: message });
    return;
  }
  const backoffSeconds = Math.min(3600, 2 ** attempts * 15);
  await db.jobQueueItem.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      runAfter: new Date(Date.now() + backoffSeconds * 1000),
      lastError: message.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
    },
  });
  log.warn("queue.job_retry", { jobId, attempts, backoffSeconds, error: message });
}

/** Re-queues jobs whose worker died mid-run. */
export async function reclaimStale(olderThanMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const { count } = await db.jobQueueItem.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  if (count > 0) log.warn("queue.reclaimed_stale", { count });
  return count;
}
