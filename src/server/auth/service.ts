import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { db } from "../db";
import { hashPassword, verifyPassword, needsRehash, randomToken, hashToken, hmacSign, hmacVerify } from "../lib/crypto";
import { env } from "../lib/env";
import { PRIVILEGED_ROLES } from "../domain/enums";
import { enqueue } from "../jobs/queue";
import { AppError } from "../lib/errors";
import { securityEvent, log } from "../lib/logger";
import { enforceRateLimit, RATE_LIMITS } from "../lib/ratelimit";
import { serializeRoles, parseRoles, type Role } from "../domain/enums";
import { createSession, revokeAllSessions } from "./session";
import { recordAudit } from "../domain/audit";

/**
 * Account lifecycle.
 *
 * Two rules shape everything here:
 *  - Login must not tell an attacker whether an email exists. Every failure path
 *    below takes comparable time and returns the same message.
 *  - Roles are never accepted from input. A registration always produces a
 *    CUSTOMER; every elevation is a separate, audited, human-approved action.
 */

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

// A hash to compare against when the account does not exist, so a missing user
// costs the same scrypt work as a wrong password. Without this, response timing
// enumerates the customer list.
let decoyHashPromise: Promise<string> | null = null;
const decoyHash = (): Promise<string> => {
  decoyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyHashPromise;
};

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  rateLimitSubject: string;
  acceptedTerms: boolean;
  marketingConsent: boolean;
  policyVersion: string;
}

/** Rejects the passwords that actually get accounts taken over. */
export function validatePasswordStrength(password: string, email: string): string | null {
  if (password.length < 12) return "A senha precisa de pelo menos 12 caracteres.";
  if (password.length > 200) return "A senha é longa demais (máximo 200 caracteres).";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) {
    return "A senha não pode conter seu e-mail.";
  }
  const common = [
    "senha", "password", "123456", "qwerty", "abc123", "kaiju", "111111",
    "anime", "otaku", "iloveyou", "admin123", "letmein",
  ];
  const lower = password.toLowerCase();
  if (common.some((c) => lower.includes(c) && password.length < 16)) {
    return "Essa senha é muito comum. Escolha algo menos previsível — uma frase funciona bem.";
  }
  if (/^(.)\1+$/.test(password)) return "A senha não pode ser um único caractere repetido.";
  return null;
}

export async function register(input: RegisterInput): Promise<{ userId: string }> {
  await enforceRateLimit(RATE_LIMITS.signup, input.rateLimitSubject, { route: "auth.register" });

  const email = input.email.trim().toLowerCase();
  if (!input.acceptedTerms) {
    throw new AppError("VALIDATION_FAILED", "É preciso aceitar os Termos e a Política de Privacidade.", {
      fields: { acceptedTerms: "Marque para continuar." },
    });
  }
  const weak = validatePasswordStrength(input.password, email);
  if (weak) {
    throw new AppError("VALIDATION_FAILED", "Escolha uma senha mais forte.", { fields: { password: weak } });
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await db.user.create({
      data: {
        email,
        displayName: input.displayName.trim().slice(0, 80),
        passwordHash,
        // Roles are assigned by the server. Never read from the request.
        roles: serializeRoles(["CUSTOMER"]),
        consents: {
          create: [
            { kind: "ESSENTIAL", granted: true, policyVersion: input.policyVersion },
            { kind: "MARKETING", granted: input.marketingConsent, policyVersion: input.policyVersion },
            // AI training on customer images is off unless explicitly turned on later.
            { kind: "AI_IMPROVEMENT", granted: false, policyVersion: input.policyVersion },
          ],
        },
      },
    });

    await issueEmailVerification(user.id);
    await recordAudit({
      actorUserId: user.id,
      action: "auth.register",
      targetType: "User",
      targetId: user.id,
      newState: { email, roles: ["CUSTOMER"] },
    });
    return { userId: user.id };
  } catch (error) {
    // Unique violation on email. Do NOT reveal that the address is taken here —
    // the caller sends the same "check your inbox" response either way.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      log.info("auth.register.duplicate", { emailDomain: email.split("@")[1] });
      throw new AppError("CONFLICT", "Não foi possível concluir o cadastro com esses dados.", {
        action: "Se você já tem conta, entre normalmente ou use 'esqueci minha senha'.",
      });
    }
    throw error;
  }
}

export interface LoginInput {
  email: string;
  password: string;
  rateLimitSubject: string;
}

export type LoginResult =
  | { outcome: "SUCCESS"; userId: string }
  | { outcome: "MFA_REQUIRED"; challengeToken: string };

export async function login(input: LoginInput): Promise<LoginResult> {
  await enforceRateLimit(RATE_LIMITS.login, input.rateLimitSubject, { route: "auth.login" });

  const email = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  // Same work, same message, whether or not the account exists.
  if (!user || user.deletedAt) {
    await verifyPassword(input.password, await decoyHash());
    securityEvent("auth.login.failure", { reason: "no_such_user" });
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    securityEvent("auth.lockout", { userId: user.id });
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError("AUTH_ACCOUNT_LOCKED", "Conta temporariamente bloqueada por tentativas seguidas.", {
      action: `Aguarde ${minutes} minuto${minutes > 1 ? "s" : ""} ou redefina sua senha para desbloquear agora.`,
    });
  }

  if (user.status === "SUSPENDED") {
    securityEvent("auth.login.failure", { userId: user.id, reason: "suspended" });
    throw new AppError("FORBIDDEN", "Esta conta está suspensa.", {
      action: "Fale com o suporte para entender o motivo e o que fazer.",
    });
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    securityEvent("auth.login.failure", { userId: user.id, reason: "bad_password", failed });
    if (lock) securityEvent("auth.lockout", { userId: user.id });
    throw invalidCredentials();
  }

  // Successful password step. Reset counters before any MFA branch.
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  // Opportunistic upgrade when the cost parameters have moved on.
  if (needsRehash(user.passwordHash)) {
    const fresh = await hashPassword(input.password);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: fresh } }).catch(() => undefined);
  }

  const roles = parseRoles(user.roles);
  if (user.mfaEnrolledAt && user.mfaSecret) {
    return { outcome: "MFA_REQUIRED", challengeToken: mintMfaChallenge(user.id) };
  }

  // Staff without MFA cannot get a privileged session at all.
  if (roles.some((r) => PRIVILEGED_ROLES.includes(r)) && !user.mfaEnrolledAt) {
    securityEvent("auth.login.failure", { userId: user.id, reason: "staff_without_mfa" });
    throw new AppError("AUTH_MFA_REQUIRED", "Contas com acesso administrativo exigem verificação em duas etapas.", {
      action: "Fale com um administrador para concluir a ativação da sua conta.",
    });
  }

  await createSession(user.id);
  securityEvent("auth.login.success", { userId: user.id });
  return { outcome: "SUCCESS", userId: user.id };
}

const invalidCredentials = () =>
  new AppError("AUTH_INVALID_CREDENTIALS", "E-mail ou senha incorretos.", {
    action: "Confira os dados. Se esqueceu a senha, use 'esqueci minha senha'.",
  });

// -------------------------------------------------------------------- MFA ---

/**
 * TOTP (RFC 6238), 30-second step, 6 digits, SHA-1 — the parameters every
 * authenticator app implements. Implemented locally rather than pulling a
 * dependency for ~40 lines of HMAC.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new AppError("VALIDATION_FAILED", "Segredo de verificação inválido.");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** ±1 step of drift tolerance — one window either side, no more. */
export function verifyTotp(secret: string, code: string, at: Date = new Date()): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(at.getTime() / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    const expected = totpCode(secret, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string): string {
  return `otpauth://totp/${encodeURIComponent(`KAIJU:${email}`)}?secret=${secret}&issuer=KAIJU&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Short-lived, signed handle for the interval between password and code.
 * Stateless by design: a half-finished login should not leave a row behind, and
 * the signature plus the embedded expiry are enough to make it unforgeable.
 */
function mintMfaChallenge(userId: string): string {
  const expires = Date.now() + 5 * 60_000;
  const payload = `${userId}.${expires}`;
  return `${Buffer.from(payload).toString("base64url")}.${hmacSign(payload, env.AUTH_SECRET)}`;
}

export async function completeMfaLogin(
  challengeToken: string,
  code: string,
  rateLimitSubject: string,
): Promise<{ userId: string }> {
  await enforceRateLimit(RATE_LIMITS.mfaAttempt, rateLimitSubject, { route: "auth.mfa" });

  const [encoded, signature] = challengeToken.split(".");
  if (!encoded || !signature) throw mfaInvalid();
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  if (!hmacVerify(payload, signature, env.AUTH_SECRET)) throw mfaInvalid();

  const [userId, expiresRaw] = payload.split(".");
  if (!userId || !expiresRaw || Number(expiresRaw) < Date.now()) {
    throw new AppError("AUTH_SESSION_EXPIRED", "O tempo para informar o código acabou.", {
      action: "Entre novamente com seu e-mail e senha.",
    });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.mfaSecret) throw mfaInvalid();

  if (!verifyTotp(user.mfaSecret, code)) {
    const consumed = await consumeRecoveryCode(user.id, code);
    if (!consumed) {
      securityEvent("auth.mfa.failure", { userId: user.id });
      throw mfaInvalid();
    }
  }

  await createSession(user.id, { mfaVerified: true });
  securityEvent("auth.login.success", { userId: user.id, mfa: true });
  return { userId: user.id };
}

const mfaInvalid = () =>
  new AppError("AUTH_MFA_INVALID", "Código de verificação incorreto.", {
    action: "Confira o código atual no seu aplicativo. Ele muda a cada 30 segundos.",
  });

export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => randomToken(6).slice(0, 10).toUpperCase());
  const hashed = await Promise.all(codes.map((c) => hashPassword(c)));
  await db.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: JSON.stringify(hashed) } });
  return codes;
}

async function consumeRecoveryCode(userId: string, candidate: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { mfaRecoveryCodes: true } });
  if (!user?.mfaRecoveryCodes) return false;
  let hashes: string[];
  try {
    hashes = JSON.parse(user.mfaRecoveryCodes) as string[];
  } catch {
    return false;
  }
  const normalized = candidate.replace(/\s|-/g, "").toUpperCase();
  for (const [i, hash] of hashes.entries()) {
    if (await verifyPassword(normalized, hash)) {
      // Single use: burn it.
      hashes.splice(i, 1);
      await db.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: JSON.stringify(hashes) } });
      securityEvent("auth.mfa.failure", { userId, note: "recovery_code_used" });
      return true;
    }
  }
  return false;
}

// ---------------------------------------------- email verification / reset ---

export async function issueEmailVerification(userId: string): Promise<string> {
  const token = randomToken(32);
  await db.verificationToken.create({
    data: {
      userId,
      purpose: "EMAIL_VERIFY",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });
  // Delivery is a queued job; the raw token never touches a log.
  await enqueue("email", { kind: "EMAIL_VERIFY", userId, token });
  return token;
}

export async function consumeVerificationToken(
  token: string,
  purpose: "EMAIL_VERIFY" | "PASSWORD_RESET",
): Promise<string> {
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) {
    throw new AppError("VALIDATION_FAILED", "Este link não é mais válido.", {
      action: "Peça um novo link — os anteriores expiram por segurança.",
    });
  }
  await db.verificationToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return row.userId;
}

export async function requestPasswordReset(email: string, rateLimitSubject: string): Promise<void> {
  await enforceRateLimit(RATE_LIMITS.passwordReset, rateLimitSubject, { route: "auth.reset" });
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always returns silently: the response must not confirm the address exists.
  if (!user || user.deletedAt) return;

  const token = randomToken(32);
  await db.verificationToken.create({
    data: {
      userId: user.id,
      purpose: "PASSWORD_RESET",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await enqueue("email", { kind: "PASSWORD_RESET", userId: user.id, token });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await consumeVerificationToken(token, "PASSWORD_RESET");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const weak = validatePasswordStrength(newPassword, user.email);
  if (weak) throw new AppError("VALIDATION_FAILED", "Escolha uma senha mais forte.", { fields: { password: weak } });

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null },
  });
  // A password change invalidates every existing session, everywhere.
  await revokeAllSessions(userId, "password_reset");
  await recordAudit({
    actorUserId: userId,
    action: "auth.password_reset",
    targetType: "User",
    targetId: userId,
  });
}

export async function grantRole(
  targetUserId: string,
  role: Role,
  actorUserId: string,
  reason: string,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: targetUserId } });
  const current = parseRoles(user.roles);
  if (current.includes(role)) return;
  const next = [...current, role];
  await db.user.update({ where: { id: targetUserId }, data: { roles: serializeRoles(next) } });
  await recordAudit({
    actorUserId,
    action: "auth.role_granted",
    targetType: "User",
    targetId: targetUserId,
    oldState: { roles: current },
    newState: { roles: next },
    reason,
  });
  securityEvent("admin.sensitive_action", { actorUserId, targetUserId, role, action: "role_granted" });
}
