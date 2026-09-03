"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuthState } from "@/app/(auth)/actions";
import { Field, ErrorState, Notice } from "@/components/ui";

const INITIAL: AuthState = { ok: false };
type AuthAction = (prev: AuthState, formData: FormData) => Promise<AuthState>;

function Result({ state }: { state: AuthState }) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  if (!state.ok && state.message) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <ErrorState code={state.code} message={state.message} action={state.action ?? "Tente novamente."} />
      </div>
    );
  }
  if (state.ok && state.message && !state.redirectTo && !state.mfaChallenge) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <Notice tone="good" title={state.message}>{state.action ?? ""}</Notice>
      </div>
    );
  }
  return null;
}

export function LoginForm({
  loginAction,
  mfaAction,
  csrfLogin,
  csrfMfa,
  next,
}: {
  loginAction: AuthAction;
  mfaAction: AuthAction;
  csrfLogin: string;
  csrfMfa: string;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const [mfaState, mfaFormAction, mfaPending] = useActionState(mfaAction, INITIAL);

  if (state.mfaChallenge) {
    return (
      <form action={mfaFormAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrfMfa} />
        <input type="hidden" name="challenge" value={state.mfaChallenge} />
        <input type="hidden" name="next" value={next} />

        <Notice tone="info" title="Verificação em duas etapas">
          Sua senha conferiu. Agora informe o código de seis dígitos do seu aplicativo autenticador.
        </Notice>

        <Field
          label="Código de verificação"
          name="code"
          required
          hint="Muda a cada 30 segundos. Se perdeu o acesso ao aplicativo, use um dos códigos de recuperação."
          {...(mfaState.fields?.code ? { error: mfaState.fields.code } : {})}
        >
          <input
            id="code"
            name="code"
            className="input t-mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            required
            autoFocus
            disabled={mfaPending}
            style={{ fontSize: "1.3rem", letterSpacing: "0.35em", textAlign: "center" }}
          />
        </Field>

        <button type="submit" className="btn btn-primary btn-block" disabled={mfaPending}>
          {mfaPending ? "Verificando…" : "Entrar"}
        </button>

        <Result state={mfaState} />
      </form>
    );
  }

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrfLogin} />
      <input type="hidden" name="next" value={next} />

      <Field label="E-mail" name="email" required {...(state.fields?.email ? { error: state.fields.email } : {})}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required disabled={pending} />
      </Field>

      <Field label="Senha" name="password" required {...(state.fields?.password ? { error: state.fields.password } : {})}>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <Link href="/recuperar" className="link">Esqueci minha senha</Link>
        <Link href={`/cadastrar?next=${encodeURIComponent(next)}`} className="link">Criar conta</Link>
      </div>

      <Result state={state} />
    </form>
  );
}

export function RegisterForm({ action, csrf, next }: { action: AuthAction; csrf: string; next: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [password, setPassword] = useState("");

  // Live feedback mirrors the server rule (12+ chars). The server remains the
  // authority; this only saves a round trip on an obvious miss.
  const tooShort = password.length > 0 && password.length < 12;

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="next" value={next} />

      <Field label="Como quer ser chamado?" name="displayName" required {...(state.fields?.displayName ? { error: state.fields.displayName } : {})}>
        <input id="displayName" name="displayName" className="input" autoComplete="name" maxLength={80} required disabled={pending} />
      </Field>

      <Field label="E-mail" name="email" required hint="Usamos para confirmar pedidos e falar sobre a produção." {...(state.fields?.email ? { error: state.fields.email } : {})}>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required disabled={pending} />
      </Field>

      <Field
        label="Senha"
        name="password"
        required
        hint="Mínimo de 12 caracteres. Uma frase que só você usaria funciona melhor do que trocar letra por símbolo."
        {...(tooShort
          ? { error: `Faltam ${12 - password.length} caractere(s).` }
          : state.fields?.password
            ? { error: state.fields.password }
            : {})}
      >
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={12}
          required
          disabled={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={tooShort ? true : undefined}
        />
      </Field>

      <label className="choice">
        <input type="checkbox" name="acceptedTerms" required disabled={pending} />
        <span style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
          Li e aceito os <Link href="/politicas/termos" className="link">Termos de uso</Link> e a{" "}
          <Link href="/politicas/privacidade" className="link">Política de privacidade</Link>.
        </span>
      </label>

      <label className="choice">
        <input type="checkbox" name="marketingConsent" disabled={pending} />
        <span style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
          Quero receber novidades de coleções e campanhas. Opcional, e dá para cancelar a qualquer momento.
        </span>
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending || tooShort}>
        {pending ? "Criando conta…" : "Criar conta"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function ResetRequestForm({ action, csrf }: { action: AuthAction; csrf: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <Field label="E-mail da conta" name="email" required>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required disabled={pending} />
      </Field>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de redefinição"}
      </button>
      <Result state={state} />
    </form>
  );
}
