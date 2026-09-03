import { cookies, headers } from "next/headers";
import { db } from "../db";
import { env } from "../lib/env";
import { hashToken, keyedHash, randomToken, hmacSign, hmacVerify, constantTimeEqual } from "../lib/crypto";
import { AppError, authRequired } from "../lib/errors";
import { securityEvent } from "../lib/logger";
import { parseRoles, type Role } from "../domain/enums";
import { STEP_UP_WINDOW_MINUTES, requirePermission, type Permission } from "./rbac";

/**
 * Sessions are opaque, server-side, and revocable.
 *
 * There is no JWT here on purpose: a stolen JWT stays valid until it expires,
 * and this application has to be able to kill a session the instant a customer
 * clicks "sign out everywhere" or fraud review flags an account.
 *
 * The cookie holds `<sessionId>.<secret>`; the database holds only SHA-256 of the
 * secret. A read of the sessions table cannot resurrect a live login.
 */

const SESSION_COOKIE = "__Host-kaiju_session";
const CSRF_COOKIE = "__Host-kaiju_csrf";
const ANON_COOKIE = "__Host-kaiju_anon";

// __Host- prefixed cookies cannot be set by a subdomain or with a Path other than "/",
// which removes a whole class of subdomain-takeover session fixation.
const SESSION_TTL_HOURS = 24 * 14;
const SESSION_IDLE_HOURS = 24 * 7;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  status: string;
  locale: string;
  currency: string;
  emailVerified: boolean;
  mfaEnrolled: boolean;
}

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
  /** When the session last passed an MFA challenge — drives step-up. */
  mfaVerifiedAt: Date | null;
}

/**
 * Cookie hardening follows the SCHEME OF APP_URL, not the build mode.
 *
 * `Secure` over plain http is silently dropped by browsers, and `__Host-`
 * requires `Secure`. Keying these off NODE_ENV would break every cookie in a
 * locally-served production build; keying them off the actual origin means
 * https always gets the strongest form and http never gets a broken one.
 */
const isSecureOrigin = env.APP_URL.startsWith("https://");

const cookieOptions = (maxAgeSeconds: number) =>
  ({
    httpOnly: true,
    secure: isSecureOrigin,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  });

/** __Host- requires Secure, which requires https. An http origin uses a plain name. */
const cookieName = (base: string): string =>
  isSecureOrigin ? base : base.replace("__Host-", "");

export async function createSession(
  userId: string,
  options: { mfaVerified?: boolean } = {},
): Promise<void> {
  const secret = randomToken(32);
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? "";
  const ip = clientIpFrom(hdrs);

  const session = await db.session.create({
    data: {
      tokenHash: hashToken(secret),
      userId,
      userAgentHash: ua ? keyedHash(ua, env.AUTH_SECRET).slice(0, 32) : null,
      ipHash: ip ? keyedHash(ip, env.AUTH_SECRET).slice(0, 32) : null,
      mfaVerifiedAt: options.mfaVerified ? new Date() : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000),
    },
  });

  const jar = await cookies();
  jar.set(cookieName(SESSION_COOKIE), `${session.id}.${secret}`, cookieOptions(SESSION_TTL_HOURS * 3600));

  // A fresh CSRF secret per session. Rotating it on login prevents a pre-login
  // fixed token from being usable afterwards.
  jar.set(cookieName(CSRF_COOKIE), randomToken(24), {
    ...cookieOptions(SESSION_TTL_HOURS * 3600),
    // Readable by the client is NOT required: the token is embedded server-side
    // into forms, so this stays httpOnly.
    httpOnly: true,
  });
}

export async function destroySession(reason = "user_signout"): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(cookieName(SESSION_COOKIE))?.value;
  if (raw) {
    const [sessionId] = raw.split(".");
    if (sessionId) {
      await db.session
        .updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: reason },
        })
        .catch(() => undefined);
      securityEvent("auth.session.revoked", { sessionId, reason });
    }
  }
  jar.delete(cookieName(SESSION_COOKIE));
  jar.delete(cookieName(CSRF_COOKIE));
}

/** Revokes every session for a user — "sign out everywhere", or a fraud action. */
export async function revokeAllSessions(userId: string, reason: string): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  securityEvent("auth.session.revoked", { userId, reason, count });
  return count;
}

/**
 * Resolves the current session. Returns null rather than throwing so that public
 * pages can render for signed-out visitors without a try/catch at every call site.
 */
export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const raw = jar.get(cookieName(SESSION_COOKIE))?.value;
  if (!raw) return null;

  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!sessionId || !secret) return null;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  if (!constantTimeEqual(session.tokenHash, hashToken(secret))) {
    // Right session id, wrong secret: someone is guessing. Kill the session.
    securityEvent("auth.session.revoked", { sessionId, reason: "token_mismatch" });
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: "token_mismatch" },
    });
    return null;
  }

  const now = new Date();
  if (session.expiresAt <= now) return null;
  // Idle timeout: a session untouched for a week is dead even if not expired.
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_HOURS * 3600 * 1000) {
    await db.session.update({
      where: { id: sessionId },
      data: { revokedAt: now, revokedReason: "idle_timeout" },
    });
    return null;
  }

  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return null;

  // Throttle the write: updating lastSeenAt on every request is a write per page view.
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: sessionId }, data: { lastSeenAt: now } }).catch(() => undefined);
  }

  return {
    sessionId: session.id,
    mfaVerifiedAt: session.mfaVerifiedAt,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      roles: parseRoles(session.user.roles),
      status: session.user.status,
      locale: session.user.locale,
      currency: session.user.currency,
      emailVerified: session.user.emailVerified !== null,
      mfaEnrolled: session.user.mfaEnrolledAt !== null,
    },
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw authRequired();
  return auth;
}

/**
 * The standard guard for a privileged operation: authenticated, permitted, and
 * — for the highest-risk permissions — recently re-challenged with MFA.
 */
export async function requirePermissionContext(permission: Permission): Promise<AuthContext> {
  const auth = await requireAuth();
  requirePermission(auth.user.roles, permission, { userId: auth.user.id });

  const { requiresStepUp } = await import("./rbac");
  if (requiresStepUp(permission)) {
    if (!auth.user.mfaEnrolled) {
      throw new AppError("AUTH_MFA_REQUIRED", "Esta ação exige verificação em duas etapas ativa.", {
        action: "Ative a verificação em duas etapas no seu perfil antes de continuar.",
      });
    }
    const fresh =
      auth.mfaVerifiedAt !== null &&
      Date.now() - auth.mfaVerifiedAt.getTime() < STEP_UP_WINDOW_MINUTES * 60 * 1000;
    if (!fresh) {
      throw new AppError("AUTH_STEP_UP_REQUIRED", "Confirme sua identidade para concluir esta ação.", {
        action: `Informe o código do seu aplicativo autenticador. A confirmação vale ${STEP_UP_WINDOW_MINUTES} minutos.`,
      });
    }
  }
  return auth;
}

export async function markMfaVerified(sessionId: string): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
}

// ------------------------------------------------------------------ CSRF ----

/**
 * Double-submit with an HMAC binding.
 *
 * The token embedded in a form is HMAC(cookieSecret + action), so a token minted
 * for one action cannot be replayed against another, and a token cannot be
 * forged without the httpOnly cookie value.
 */
export async function csrfToken(action: string): Promise<string> {
  const jar = await cookies();
  let secret = jar.get(cookieName(CSRF_COOKIE))?.value;
  if (!secret) {
    secret = randomToken(24);
    jar.set(cookieName(CSRF_COOKIE), secret, cookieOptions(SESSION_TTL_HOURS * 3600));
  }
  return hmacSign(`${secret}:${action}`, env.AUTH_SECRET);
}

export async function assertCsrf(action: string, submitted: unknown): Promise<void> {
  const jar = await cookies();
  const secret = jar.get(cookieName(CSRF_COOKIE))?.value;
  if (!secret || typeof submitted !== "string" || submitted.length === 0) {
    securityEvent("csrf.rejected", { action, reason: "missing" });
    throw new AppError("CSRF_INVALID", "Sua sessão expirou enquanto esta página estava aberta.", {
      action: "Atualize a página e envie novamente. Nada foi perdido.",
    });
  }
  if (!hmacVerify(`${secret}:${action}`, submitted, env.AUTH_SECRET)) {
    securityEvent("csrf.rejected", { action, reason: "mismatch" });
    throw new AppError("CSRF_INVALID", "Não conseguimos validar o envio deste formulário.", {
      action: "Atualize a página e tente novamente.",
    });
  }

  // Defence in depth: Server Actions are same-origin by construction, but an
  // explicit Origin check costs nothing and catches proxy misconfiguration.
  const hdrs = await headers();
  const origin = hdrs.get("origin");
  if (origin && !originAllowed(origin)) {
    securityEvent("csrf.rejected", { action, reason: "origin", origin });
    throw new AppError("CSRF_INVALID", "Origem da requisição não reconhecida.", {
      action: "Acesse o site diretamente e tente novamente.",
    });
  }
}

function originAllowed(origin: string): boolean {
  try {
    const allowed = new URL(env.APP_URL);
    const got = new URL(origin);
    return allowed.protocol === got.protocol && allowed.host === got.host;
  } catch {
    return false;
  }
}

// ------------------------------------------------- anonymous visitor id ------

/**
 * A rotating pseudonymous id for signed-out visitors, so the recommender has
 * something to key on without fingerprinting. It is a random value in a cookie —
 * not derived from IP, headers, or anything about the device — and it is
 * discarded and replaced with the user id the moment someone signs in.
 */
export async function getOrCreateAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(cookieName(ANON_COOKIE))?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const fresh = randomToken(16);
  jar.set(cookieName(ANON_COOKIE), fresh, cookieOptions(180 * 24 * 3600));
  return fresh;
}

export async function readAnonId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(cookieName(ANON_COOKIE))?.value;
  return value && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

// ----------------------------------------------------------------- utils ----

function clientIpFrom(hdrs: Headers): string | null {
  // Trust only the leftmost hop of x-forwarded-for and only because the platform
  // proxy is known to append. Behind an untrusted proxy this must be replaced.
  const xff = hdrs.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return hdrs.get("x-real-ip");
}

/** Rate-limit subject: user id when known, else a keyed hash of the IP. */
export async function rateLimitSubject(auth: AuthContext | null): Promise<string> {
  if (auth) return `user:${auth.user.id}`;
  const hdrs = await headers();
  const ip = clientIpFrom(hdrs) ?? "unknown";
  return `ip:${ip}`;
}
