/**
 * One error vocabulary for the whole application.
 *
 * Rules this file enforces by construction:
 *  - Every failure has a stable machine-readable code the UI can branch on.
 *  - Every failure carries a message written for a human in the product's voice,
 *    saying what happened and what to do next — never "Something went wrong".
 *  - Internal detail (stack, query, provider payload) lives in `internal` and is
 *    logged, never serialised to a client.
 */

export type ErrorCode =
  // auth
  | "AUTH_REQUIRED"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_ACCOUNT_LOCKED"
  | "AUTH_EMAIL_UNVERIFIED"
  | "AUTH_MFA_REQUIRED"
  | "AUTH_MFA_INVALID"
  | "AUTH_STEP_UP_REQUIRED"
  | "AUTH_SESSION_EXPIRED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  // input
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  // uploads
  | "UPLOAD_TYPE_REJECTED"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_CORRUPT"
  | "UPLOAD_DIMENSIONS_REJECTED"
  | "UPLOAD_SCAN_PENDING"
  | "UPLOAD_SCAN_FAILED"
  // ai
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_QUOTA_EXCEEDED"
  | "AI_CONTENT_BLOCKED"
  | "AI_OUTPUT_INVALID"
  // commerce
  | "CART_EMPTY"
  | "QUOTE_EXPIRED"
  | "SPEC_CHANGED"
  | "SPEC_NOT_APPROVED"
  | "OUT_OF_STOCK"
  | "COUPON_INVALID"
  | "COUPON_EXHAUSTED"
  | "PAYMENT_FAILED"
  | "PAYMENT_ALREADY_SETTLED"
  | "REFUND_EXCEEDS_CAPTURED"
  | "REWARD_NOT_ELIGIBLE"
  | "REWARD_OUT_OF_STOCK"
  // marketplace
  | "ILLEGAL_STATE_TRANSITION"
  | "JOB_ALREADY_TAKEN"
  | "NO_PRODUCER_AVAILABLE"
  | "PRODUCER_NOT_VERIFIED"
  | "CAPACITY_EXCEEDED"
  // platform
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_EMAIL_UNVERIFIED: 403,
  AUTH_MFA_REQUIRED: 401,
  AUTH_MFA_INVALID: 401,
  AUTH_STEP_UP_REQUIRED: 401,
  AUTH_SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  CSRF_INVALID: 403,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPLOAD_TYPE_REJECTED: 415,
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_CORRUPT: 422,
  UPLOAD_DIMENSIONS_REJECTED: 422,
  UPLOAD_SCAN_PENDING: 409,
  UPLOAD_SCAN_FAILED: 422,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_QUOTA_EXCEEDED: 429,
  AI_CONTENT_BLOCKED: 422,
  AI_OUTPUT_INVALID: 502,
  CART_EMPTY: 409,
  QUOTE_EXPIRED: 409,
  SPEC_CHANGED: 409,
  SPEC_NOT_APPROVED: 412,
  OUT_OF_STOCK: 409,
  COUPON_INVALID: 422,
  COUPON_EXHAUSTED: 409,
  PAYMENT_FAILED: 402,
  PAYMENT_ALREADY_SETTLED: 409,
  REFUND_EXCEEDS_CAPTURED: 422,
  REWARD_NOT_ELIGIBLE: 403,
  REWARD_OUT_OF_STOCK: 409,
  ILLEGAL_STATE_TRANSITION: 409,
  JOB_ALREADY_TAKEN: 409,
  NO_PRODUCER_AVAILABLE: 503,
  PRODUCER_NOT_VERIFIED: 403,
  CAPACITY_EXCEEDED: 409,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export interface AppErrorOptions {
  /** What the customer should do next. Rendered directly in the UI. */
  action?: string;
  /** Field-level problems, keyed by form field path. */
  fields?: Record<string, string>;
  /** Never leaves the server. Logged with the correlation id. */
  internal?: unknown;
  cause?: unknown;
  /** For RATE_LIMITED / AI_QUOTA_EXCEEDED. */
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly action: string | undefined;
  readonly fields: Record<string, string> | undefined;
  readonly internal: unknown;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.action = options.action;
    this.fields = options.fields;
    this.internal = options.internal;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /** The only shape ever sent to a client. Nothing here is sensitive. */
  toPublicJSON(correlationId?: string): {
    error: {
      code: ErrorCode;
      message: string;
      action?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
      correlationId?: string;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.action ? { action: this.action } : {}),
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.retryAfterSeconds ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
        ...(correlationId ? { correlationId } : {}),
      },
    };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/**
 * Wraps anything thrown into an AppError without leaking internals.
 * An unknown throw becomes INTERNAL_ERROR with a generic public message and the
 * original preserved in `internal` for the log.
 */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  return new AppError(
    "INTERNAL_ERROR",
    "Não conseguimos concluir esta operação agora.",
    {
      action: "Tente novamente em alguns instantes. Se continuar, fale com o suporte com o código desta tela.",
      internal: e,
      cause: e,
    },
  );
}

// --- Shorthand constructors for the failures raised most often ---------------

export const notFound = (what: string) =>
  new AppError("NOT_FOUND", `${what} não foi encontrado.`, {
    action: "Verifique o link ou volte para a página anterior.",
  });

export const forbidden = (what = "esta ação") =>
  new AppError("FORBIDDEN", `Você não tem permissão para ${what}.`, {
    action: "Se acredita que deveria ter acesso, fale com o suporte.",
  });

export const authRequired = () =>
  new AppError("AUTH_REQUIRED", "Você precisa entrar na sua conta para continuar.", {
    action: "Entre ou crie uma conta — leva menos de um minuto.",
  });

export const validationFailed = (fields: Record<string, string>, message?: string) =>
  new AppError("VALIDATION_FAILED", message ?? "Alguns campos precisam de atenção.", {
    action: "Corrija os campos destacados e envie novamente.",
    fields,
  });

export const illegalTransition = (from: string, to: string) =>
  new AppError("ILLEGAL_STATE_TRANSITION", `Este pedido não pode ir de ${from} para ${to}.`, {
    action: "Atualize a página para ver o estado atual do pedido.",
    internal: { from, to },
  });
