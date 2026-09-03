import { z } from "zod";

/**
 * Environment is parsed once, at import time, and never read via process.env
 * anywhere else. A missing or malformed secret fails the boot, not a request
 * three hours later.
 *
 * Nothing in this module may ever be imported from a Client Component — the
 * "server-only" side of the app is the only consumer.
 */

const schema = z.object({
  /**
   * NODE_ENV describes the BUILD (optimized or not) — `next build` always sets it
   * to "production", even when you are just compiling on a laptop.
   *
   * APP_ENV describes the DEPLOYMENT. The hard production guards below key on
   * APP_ENV, because "am I compiling optimized code" and "am I about to take real
   * money from real people" are different questions and only the second one should
   * refuse to boot over a placeholder secret.
   */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  STORAGE_DIR: z.string().default("./var/storage"),

  AI_PROVIDER: z.enum(["heuristic", "anthropic"]).default("heuristic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(45_000),

  PAYMENT_PROVIDER: z.enum(["mock", "stripe", "mercadopago"]).default("mock"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(8),

  SHIPPING_PROVIDER: z.enum(["manual", "correios"]).default("manual"),
  SHIPPING_WEBHOOK_SECRET: z.string().min(8),
  SHIP_ORIGIN_POSTAL_CODE: z.string().default("01310100"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RATE_LIMIT_DISABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill the required values.`,
    );
  }
  const value = parsed.data;

  // Cross-field rules the shape alone cannot express.
  if (value.AI_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
    throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.");
  }
  // Deployed environments must not run on placeholders. This is the guard that
  // stops a copy of .env.example reaching a server that can charge cards.
  if (value.APP_ENV === "production" || value.APP_ENV === "staging") {
    if (value.PAYMENT_WEBHOOK_SECRET.startsWith("dev-")) {
      throw new Error(`Refusing to boot APP_ENV=${value.APP_ENV} with the development payment webhook secret.`);
    }
    if (value.SHIPPING_WEBHOOK_SECRET.startsWith("dev-")) {
      throw new Error(`Refusing to boot APP_ENV=${value.APP_ENV} with the development shipping webhook secret.`);
    }
    if (!value.APP_URL.startsWith("https://")) {
      throw new Error("APP_URL must be https:// in a deployed environment (secure cookies depend on it).");
    }
    if (value.PAYMENT_PROVIDER === "mock") {
      throw new Error("Refusing to boot a deployed environment with the mock payment provider.");
    }
    if (value.RATE_LIMIT_DISABLED) {
      throw new Error("Rate limiting cannot be disabled in a deployed environment.");
    }
  }
  return value;
}

export const env = load();

/** True for an optimized build. Governs bundling and logging verbosity. */
export const isProductionBuild = env.NODE_ENV === "production";
/** True when this process is actually serving real users. Governs security posture. */
export const isDeployed = env.APP_ENV === "production" || env.APP_ENV === "staging";
export const isProduction = isDeployed;
export const isTest = env.NODE_ENV === "test" || env.APP_ENV === "test";
