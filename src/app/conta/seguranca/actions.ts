"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireAuth, assertCsrf, markMfaVerified, revokeAllSessions, rateLimitSubject } from "@/server/auth/session";
import { generateTotpSecret, verifyTotp, totpUri, generateRecoveryCodes } from "@/server/auth/service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/ratelimit";
import { toAppError, AppError } from "@/server/lib/errors";
import { recordAudit } from "@/server/domain/audit";
import { securityEvent, log } from "@/server/lib/logger";
import { hmacSign, hmacVerify } from "@/server/lib/crypto";
import { env } from "@/server/lib/env";

export interface SecurityState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  /** Enrolment step: the pending secret, its otpauth URI, and a signed handle. */
  enrolment?: { secret: string; uri: string; handle: string };
  /** Shown exactly once, after enrolment succeeds. */
  recoveryCodes?: string[];
}

const failure = (error: unknown): SecurityState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("security.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

/**
 * Begins TOTP enrolment.
 *
 * The candidate secret is NOT written to the user row yet — it is handed back
 * inside a short-lived signed handle. A secret only becomes the account's second
 * factor once the person has proved they can generate a code from it; storing it
 * first would leave accounts in a state where MFA is "on" but unusable.
 */
export async function beginMfaEnrolmentAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("security.mfa.begin", formData.get("csrf"));

    const user = await db.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { email: true, mfaEnrolledAt: true },
    });
    if (user.mfaEnrolledAt) {
      throw new AppError("CONFLICT", "A verificação em duas etapas já está ativa.", {
        action: "Para trocar de aplicativo, desative primeiro e ative de novo.",
      });
    }

    const secret = generateTotpSecret();
    const expires = Date.now() + 10 * 60_000;
    const payload = `${auth.user.id}.${secret}.${expires}`;
    const handle = `${Buffer.from(payload).toString("base64url")}.${hmacSign(payload, env.AUTH_SECRET)}`;

    return {
      ok: true,
      enrolment: { secret, uri: totpUri(secret, user.email), handle },
      message: "Escaneie o código no seu aplicativo autenticador.",
    };
  } catch (error) {
    return failure(error);
  }
}

/** Confirms enrolment by proving a code from the candidate secret. */
export async function confirmMfaEnrolmentAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("security.mfa.confirm", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.mfaAttempt, await rateLimitSubject(auth), { userId: auth.user.id });

    const handle = String(formData.get("handle") ?? "");
    const code = String(formData.get("code") ?? "");

    const [encoded, signature] = handle.split(".");
    if (!encoded || !signature) throw invalidEnrolment();
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    if (!hmacVerify(payload, signature, env.AUTH_SECRET)) throw invalidEnrolment();

    const [userId, secret, expiresRaw] = payload.split(".");
    // The handle is bound to the user it was minted for.
    if (!userId || !secret || userId !== auth.user.id) throw invalidEnrolment();
    if (!expiresRaw || Number(expiresRaw) < Date.now()) {
      throw new AppError("AUTH_SESSION_EXPIRED", "O tempo para concluir a ativação acabou.", {
        action: "Comece a ativação de novo — leva menos de um minuto.",
      });
    }

    if (!verifyTotp(secret, code)) {
      securityEvent("auth.mfa.failure", { userId: auth.user.id, note: "enrolment_confirm" });
      throw new AppError("AUTH_MFA_INVALID", "Código incorreto.", {
        action: "Confira o código atual no aplicativo. Ele muda a cada 30 segundos.",
        fields: { code: "Código não confere." },
      });
    }

    await db.user.update({
      where: { id: auth.user.id },
      data: { mfaSecret: secret, mfaEnrolledAt: new Date() },
    });
    const codes = await generateRecoveryCodes(auth.user.id);
    await markMfaVerified(auth.sessionId);

    await recordAudit({
      actorUserId: auth.user.id,
      action: "auth.mfa_enrolled",
      targetType: "User",
      targetId: auth.user.id,
    });

    revalidatePath("/conta/seguranca");
    return {
      ok: true,
      message: "Verificação em duas etapas ativada.",
      action: "Guarde os códigos de recuperação abaixo AGORA. Eles não serão mostrados de novo.",
      recoveryCodes: codes,
    };
  } catch (error) {
    return failure(error);
  }
}

const invalidEnrolment = () =>
  new AppError("VALIDATION_FAILED", "Esta ativação não é mais válida.", {
    action: "Comece a ativação novamente.",
  });

export async function disableMfaAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("security.mfa.disable", formData.get("csrf"));
    await enforceRateLimit(RATE_LIMITS.mfaAttempt, await rateLimitSubject(auth), { userId: auth.user.id });

    // Staff cannot turn off the control that protects everyone else's data.
    const { PRIVILEGED_ROLES } = await import("@/server/domain/enums");
    if (auth.user.roles.some((r) => PRIVILEGED_ROLES.includes(r))) {
      throw new AppError("FORBIDDEN", "Contas com acesso administrativo não podem desativar a verificação em duas etapas.", {
        action: "Se você precisa trocar de aplicativo, fale com outro administrador.",
      });
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { mfaSecret: true },
    });
    // Disabling requires proving you still control the factor.
    if (!user.mfaSecret || !verifyTotp(user.mfaSecret, String(formData.get("code") ?? ""))) {
      throw new AppError("AUTH_MFA_INVALID", "Código incorreto.", {
        action: "Informe um código válido do seu aplicativo para desativar.",
        fields: { code: "Código não confere." },
      });
    }

    await db.user.update({
      where: { id: auth.user.id },
      data: { mfaSecret: null, mfaEnrolledAt: null, mfaRecoveryCodes: null },
    });
    await recordAudit({
      actorUserId: auth.user.id,
      action: "auth.mfa_disabled",
      targetType: "User",
      targetId: auth.user.id,
    });
    securityEvent("auth.mfa.failure", { userId: auth.user.id, note: "mfa_disabled_by_user" });

    revalidatePath("/conta/seguranca");
    return { ok: true, message: "Verificação em duas etapas desativada.", action: "Sua conta ficou menos protegida. Você pode reativar quando quiser." };
  } catch (error) {
    return failure(error);
  }
}

export async function signOutEverywhereAction(_prev: SecurityState, formData: FormData): Promise<SecurityState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("security.sessions.revoke", formData.get("csrf"));
    const count = await revokeAllSessions(auth.user.id, "user_signed_out_everywhere");
    await recordAudit({
      actorUserId: auth.user.id,
      action: "auth.sessions_revoked_all",
      targetType: "User",
      targetId: auth.user.id,
      newState: { count },
    });
    return {
      ok: true,
      message: `${count} sessão(ões) encerrada(s).`,
      action: "Você também foi desconectado deste dispositivo. Entre novamente.",
    };
  } catch (error) {
    return failure(error);
  }
}
