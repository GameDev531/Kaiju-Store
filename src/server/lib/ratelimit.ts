import { db } from "../db";
import { AppError } from "./errors";
import { env } from "./env";
import { keyedHash } from "./crypto";
import { securityEvent } from "./logger";

/**
 * Fixed-window rate limiting backed by the database.
 *
 * Chosen over an in-memory counter because the app runs multiple instances and a
 * per-process limiter is trivially bypassed by spreading requests. The DB row is
 * the shared truth. For very high-volume endpoints this driver should be swapped
 * for Redis — the call site does not change.
 */

export interface RateLimitRule {
  /** Stable identifier for the protected action. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** How long to hard-block once the limit is breached. 0 = just wait out the window. */
  blockSeconds?: number;
}

/**
 * The catalogue of limits. Tuned to be invisible to a real customer and
 * expensive for a script: signup and login are the tightest, browsing is loose.
 */
export const RATE_LIMITS = {
  login: { name: "login", limit: 8, windowSeconds: 900, blockSeconds: 900 },
  signup: { name: "signup", limit: 5, windowSeconds: 3600, blockSeconds: 3600 },
  passwordReset: { name: "password_reset", limit: 5, windowSeconds: 3600 },
  mfaAttempt: { name: "mfa_attempt", limit: 6, windowSeconds: 600, blockSeconds: 1800 },
  upload: { name: "upload", limit: 40, windowSeconds: 3600 },
  aiAnalysis: { name: "ai_analysis", limit: 15, windowSeconds: 3600 },
  checkout: { name: "checkout", limit: 12, windowSeconds: 600 },
  couponAttempt: { name: "coupon_attempt", limit: 10, windowSeconds: 600, blockSeconds: 1800 },
  contact: { name: "contact", limit: 5, windowSeconds: 3600 },
  copyrightReport: { name: "copyright_report", limit: 10, windowSeconds: 86_400 },
  jobApplication: { name: "job_application", limit: 25, windowSeconds: 86_400 },
  write: { name: "write", limit: 120, windowSeconds: 600 },
  read: { name: "read", limit: 600, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * `subject` should be the most specific stable identifier available:
 * a user id when authenticated, otherwise a keyed hash of the client IP.
 * Never the raw IP — buckets are stored, and stored IPs are personal data.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
  context: { userId?: string; route?: string } = {},
): Promise<RateLimitResult> {
  if (env.RATE_LIMIT_DISABLED) {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }

  const key = `${rule.name}:${keyedHash(subject, env.AUTH_SECRET).slice(0, 32)}`;
  const now = new Date();
  const windowMs = rule.windowSeconds * 1000;

  const existing = await db.rateLimitBucket.findUnique({ where: { key } });

  if (existing?.blockedUntil && existing.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000);
    securityEvent("ratelimit.blocked", { ...context, rule: rule.name, retryAfterSeconds });
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() >= windowMs;

  if (windowExpired) {
    await db.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now, blockedUntil: null },
      update: { count: 1, windowStart: now, blockedUntil: null },
    });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  const next = existing.count + 1;
  if (next > rule.limit) {
    const blockedUntil = rule.blockSeconds
      ? new Date(now.getTime() + rule.blockSeconds * 1000)
      : new Date(existing.windowStart.getTime() + windowMs);
    await db.rateLimitBucket.update({
      where: { key },
      data: { count: next, blockedUntil },
    });
    const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
    securityEvent("ratelimit.blocked", { ...context, rule: rule.name, retryAfterSeconds });
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  await db.rateLimitBucket.update({ where: { key }, data: { count: next } });
  return { allowed: true, remaining: rule.limit - next, retryAfterSeconds: 0 };
}

/** Throws a RATE_LIMITED AppError with a real retry hint instead of a bare 429. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  subject: string,
  context: { userId?: string; route?: string } = {},
): Promise<void> {
  const result = await checkRateLimit(rule, subject, context);
  if (!result.allowed) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    throw new AppError("RATE_LIMITED", "Muitas tentativas em pouco tempo.", {
      action:
        minutes <= 1
          ? "Aguarde um minuto e tente de novo."
          : `Aguarde cerca de ${minutes} minutos e tente de novo.`,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

/** Periodic cleanup so the bucket table does not grow without bound. */
export async function pruneRateLimitBuckets(olderThanHours = 48): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: new Date() } }] },
  });
  return count;
}
