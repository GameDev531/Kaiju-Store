"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { assertCsrf, destroySession, rateLimitSubject, getAuth } from "@/server/auth/session";
import { login, register, completeMfaLogin, requestPasswordReset } from "@/server/auth/service";
import { toAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { SITE } from "@/lib/site";

export interface AuthState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  redirectTo?: string;
  /** Present when the password step succeeded and a TOTP code is now required. */
  mfaChallenge?: string;
}

const failure = (error: unknown): AuthState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("auth.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false,
    code: e.code,
    message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

/** Only same-origin, absolute-path redirects. Blocks open-redirect via ?next=. */
function safeNext(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/conta";
  return value;
}

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await assertCsrf("auth.login", formData.get("csrf"));
    const parsed = LoginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Confira os campos.",
        action: "Preencha e-mail e senha para continuar.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const result = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      rateLimitSubject: await rateLimitSubject(null),
    });

    if (result.outcome === "MFA_REQUIRED") {
      return {
        ok: true,
        mfaChallenge: result.challengeToken,
        message: "Informe o código do seu aplicativo autenticador.",
      };
    }
    return { ok: true, redirectTo: safeNext(formData.get("next")) };
  } catch (error) {
    return failure(error);
  }
}

export async function mfaAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await assertCsrf("auth.mfa", formData.get("csrf"));
    const challenge = String(formData.get("challenge") ?? "");
    const code = String(formData.get("code") ?? "");
    await completeMfaLogin(challenge, code, await rateLimitSubject(null));
    return { ok: true, redirectTo: safeNext(formData.get("next")) };
  } catch (error) {
    return failure(error);
  }
}

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  displayName: z.string().trim().min(2, "Como quer ser chamado?").max(80),
  password: z.string().min(1, "Escolha uma senha."),
});

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await assertCsrf("auth.register", formData.get("csrf"));
    const parsed = RegisterSchema.safeParse({
      email: formData.get("email"),
      displayName: formData.get("displayName"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Confira os campos destacados.",
        action: "Corrija e envie novamente.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    await register({
      ...parsed.data,
      rateLimitSubject: await rateLimitSubject(null),
      acceptedTerms: formData.get("acceptedTerms") === "on",
      marketingConsent: formData.get("marketingConsent") === "on",
      policyVersion: SITE.policyVersion,
    });

    // Registration does not sign you in: e-mail verification comes first, so a
    // typo'd address cannot end up owning an account with saved measurements.
    const result = await login({
      email: parsed.data.email,
      password: parsed.data.password,
      rateLimitSubject: await rateLimitSubject(null),
    });
    if (result.outcome === "SUCCESS") {
      return { ok: true, redirectTo: safeNext(formData.get("next")) };
    }
    return { ok: true, message: "Conta criada.", action: "Entre com seu e-mail e senha." };
  } catch (error) {
    return failure(error);
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
}

export async function requestResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    await assertCsrf("auth.reset", formData.get("csrf"));
    const email = String(formData.get("email") ?? "");
    await requestPasswordReset(email, await rateLimitSubject(null));
    // Deliberately identical whether or not the address exists.
    return {
      ok: true,
      message: "Se existir uma conta com esse e-mail, enviamos um link de redefinição.",
      action: "O link vale por uma hora. Confira também a caixa de spam.",
    };
  } catch (error) {
    return failure(error);
  }
}
