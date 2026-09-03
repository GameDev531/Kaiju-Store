import { randomUUID } from "node:crypto";
import { env, isTest } from "./env";

/**
 * Structured JSON logging with hard redaction.
 *
 * The redaction list is a denylist of *key names*, applied recursively before
 * anything is serialised. It exists so that a careless `log.info("ctx", req.body)`
 * cannot put a password or a card token into the log pipeline.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT = new Set(
  [
    "password",
    "passwordhash",
    "newpassword",
    "currentpassword",
    "token",
    "tokenhash",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "authorization",
    "cookie",
    "setcookie",
    "secret",
    "apikey",
    "api_key",
    "authsecret",
    "anthropicapikey",
    "webhooksecret",
    "signature",
    "mfasecret",
    "recoverycodes",
    "cardnumber",
    "pan",
    "cvv",
    "cvc",
    "taxid",
    "cpf",
    "cnpj",
    "postalcode",
    "phone",
    "line1",
    "line2",
  ].map((k) => k.toLowerCase()),
);

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[depth-limit]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      // Stacks are for operators; they never reach a client response.
      stack: env.NODE_ENV === "production" ? undefined : value.stack,
      cause: value.cause ? redact(value.cause, depth + 1) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return "[unserialisable]";
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  role?: string;
  route?: string;
  [key: string]: unknown;
}

function emit(level: Level, message: string, context?: LogContext): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  if (isTest && level !== "error") return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  // stdout for everything below error keeps error streams meaningful in prod.
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (m: string, c?: LogContext) => emit("debug", m, c),
  info: (m: string, c?: LogContext) => emit("info", m, c),
  warn: (m: string, c?: LogContext) => emit("warn", m, c),
  error: (m: string, c?: LogContext) => emit("error", m, c),
};

export const newCorrelationId = (): string => randomUUID();

/**
 * Security-relevant events go to a distinct channel so they can be routed to a
 * SIEM without shipping the whole application log.
 */
export type SecurityEvent =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.lockout"
  | "auth.mfa.failure"
  | "auth.session.revoked"
  | "authz.denied"
  | "csrf.rejected"
  | "ratelimit.blocked"
  | "upload.rejected"
  | "ai.guardrail.triggered"
  | "webhook.signature.invalid"
  | "webhook.replay.blocked"
  | "fraud.signal"
  | "admin.sensitive_action"
  | "moderation.action";

export function securityEvent(event: SecurityEvent, context: LogContext = {}): void {
  emit(event.startsWith("auth.login.success") ? "info" : "warn", `security:${event}`, {
    ...context,
    securityEvent: event,
  });
}
