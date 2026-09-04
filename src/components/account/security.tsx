"use client";

import { useActionState, useState } from "react";
import type { SecurityState } from "@/app/conta/seguranca/actions";
import { Field, ErrorState, Notice, Label } from "@/components/ui";

const INITIAL: SecurityState = { ok: false };
type SecurityAction = (prev: SecurityState, formData: FormData) => Promise<SecurityState>;

function Result({ state }: { state: SecurityState }) {
  if (!state.ok && state.message) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <ErrorState code={state.code} message={state.message} action={state.action ?? "Tente novamente."} />
      </div>
    );
  }
  if (state.ok && state.message && !state.enrolment) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <Notice tone="good" title={state.message}>{state.action ?? ""}</Notice>
      </div>
    );
  }
  return null;
}

export function MfaSetup({
  beginAction,
  confirmAction,
  disableAction,
  csrfBegin,
  csrfConfirm,
  csrfDisable,
  enrolled,
  isStaff,
}: {
  beginAction: SecurityAction;
  confirmAction: SecurityAction;
  disableAction: SecurityAction;
  csrfBegin: string;
  csrfConfirm: string;
  csrfDisable: string;
  enrolled: boolean;
  isStaff: boolean;
}) {
  const [beginState, beginFormAction, beginPending] = useActionState(beginAction, INITIAL);
  const [confirmState, confirmFormAction, confirmPending] = useActionState(confirmAction, INITIAL);
  const [disableState, disableFormAction, disablePending] = useActionState(disableAction, INITIAL);
  const [showDisable, setShowDisable] = useState(false);
  const [copied, setCopied] = useState(false);

  // Enrolment finished in this render pass — codes are shown exactly once.
  if (confirmState.ok && confirmState.recoveryCodes) {
    return (
      <div className="panel corner-ticks" style={{ padding: "1.5rem" }}>
        <Notice tone="good" title="Verificação em duas etapas ativada">
          Guarde estes códigos de recuperação em um lugar seguro <strong>agora</strong>. Eles não serão
          mostrados de novo, e cada um funciona uma única vez. Sem eles, perder o aplicativo
          autenticador significa perder o acesso à conta.
        </Notice>
        <div className="panel-sunk" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
          <Label>Códigos de recuperação</Label>
          <ul
            className="t-mono"
            style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.4rem", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", fontSize: "0.95rem", letterSpacing: "0.05em" }}
          >
            {confirmState.recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          className="btn btn-ink"
          style={{ marginTop: "1.25rem" }}
          onClick={() => {
            void navigator.clipboard.writeText(confirmState.recoveryCodes!.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? "Copiado ✓" : "Copiar todos"}
        </button>
      </div>
    );
  }

  if (enrolled) {
    return (
      <div className="panel" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="conf conf-observed">Ativa</span>
          <p style={{ fontWeight: 650 }}>Verificação em duas etapas</p>
        </div>
        <p style={{ color: "var(--color-ink-soft)", marginTop: "0.75rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Sua conta pede um código do aplicativo autenticador a cada novo acesso. Ações sensíveis pedem
          uma confirmação recente, válida por 15 minutos.
        </p>

        {isStaff ? (
          <div style={{ marginTop: "1.25rem" }}>
            <Notice tone="info" title="Sua conta tem acesso administrativo">
              Contas de equipe não podem desativar a verificação em duas etapas. Ela protege os dados
              de outras pessoas, não só os seus.
            </Notice>
          </div>
        ) : !showDisable ? (
          <button type="button" className="btn btn-quiet" style={{ marginTop: "1.25rem" }} onClick={() => setShowDisable(true)}>
            Desativar
          </button>
        ) : (
          <form action={disableFormAction} style={{ marginTop: "1.25rem", display: "grid", gap: "1rem", maxWidth: "22rem" }}>
            <input type="hidden" name="csrf" value={csrfDisable} />
            <Field
              label="Confirme com um código do aplicativo"
              name="code"
              required
              hint="Provar que você ainda tem o aplicativo impede que alguém com acesso à sua sessão desligue a proteção."
              {...(disableState.fields?.code ? { error: disableState.fields.code } : {})}
            >
              <input id="code" name="code" className="input t-mono" inputMode="numeric" maxLength={6} required disabled={disablePending} autoComplete="one-time-code" />
            </Field>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="submit" className="btn btn-outline" disabled={disablePending}>
                {disablePending ? "Desativando…" : "Confirmar desativação"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setShowDisable(false)} disabled={disablePending}>
                Cancelar
              </button>
            </div>
            <Result state={disableState} />
          </form>
        )}
      </div>
    );
  }

  // Step 2: a candidate secret exists, waiting for proof.
  if (beginState.ok && beginState.enrolment) {
    const { secret, uri, handle } = beginState.enrolment;
    return (
      <form action={confirmFormAction} className="panel corner-ticks" style={{ padding: "1.5rem", display: "grid", gap: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrfConfirm} />
        <input type="hidden" name="handle" value={handle} />

        <div>
          <Label>Passo 2 de 2</Label>
          <p className="t-title" style={{ marginTop: "0.5rem" }}>Adicione ao seu aplicativo</p>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Abra o Google Authenticator, Authy, 1Password ou equivalente e adicione uma nova conta com a
            chave abaixo. Depois informe o código de seis dígitos que aparecer.
          </p>
        </div>

        <div className="panel-sunk" style={{ padding: "1.15rem" }}>
          <Label>Chave de configuração</Label>
          <p className="t-mono" style={{ fontSize: "1rem", letterSpacing: "0.12em", marginTop: "0.5rem", wordBreak: "break-all" }}>
            {secret}
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.6rem", wordBreak: "break-all" }}>
            Ou use este link: <span className="t-mono">{uri.slice(0, 60)}…</span>
          </p>
        </div>

        <Field
          label="Código do aplicativo"
          name="code"
          required
          {...(confirmState.fields?.code ? { error: confirmState.fields.code } : {})}
        >
          <input
            id="code"
            name="code"
            className="input t-mono"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
            autoComplete="one-time-code"
            disabled={confirmPending}
            style={{ fontSize: "1.3rem", letterSpacing: "0.35em", textAlign: "center" }}
          />
        </Field>

        <button type="submit" className="btn btn-primary" disabled={confirmPending}>
          {confirmPending ? "Verificando…" : "Ativar verificação em duas etapas"}
        </button>

        <Result state={confirmState} />
      </form>
    );
  }

  // Step 1.
  return (
    <div className="panel" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <span className="conf conf-uncertain">Inativa</span>
        <p style={{ fontWeight: 650 }}>Verificação em duas etapas</p>
      </div>
      <p style={{ color: "var(--color-ink-soft)", marginTop: "0.75rem", fontSize: "0.9rem", lineHeight: 1.6, maxWidth: "60ch" }}>
        Com ela ativa, saber a sua senha não é suficiente para entrar na sua conta. É a proteção mais
        efetiva contra vazamento de senha em outro serviço — que é como a maioria das contas cai.
      </p>
      <form action={beginFormAction} style={{ marginTop: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrfBegin} />
        <button type="submit" className="btn btn-primary" disabled={beginPending}>
          {beginPending ? "Preparando…" : "Ativar verificação em duas etapas"}
        </button>
      </form>
      <Result state={beginState} />
    </div>
  );
}

export function SessionControls({ action, csrf }: { action: SecurityAction; csrf: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return (
    <div className="panel" style={{ padding: "1.5rem" }}>
      <p style={{ fontWeight: 650 }}>Sair de todos os dispositivos</p>
      <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", fontSize: "0.9rem", lineHeight: 1.6, maxWidth: "60ch" }}>
        Encerra todas as sessões abertas, inclusive esta. Use se perdeu um aparelho, usou um computador
        compartilhado, ou suspeita que alguém entrou na sua conta.
      </p>
      <form action={formAction} style={{ marginTop: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrf} />
        <button type="submit" className="btn btn-outline" disabled={pending}>
          {pending ? "Encerrando…" : "Encerrar todas as sessões"}
        </button>
      </form>
      <Result state={state} />
    </div>
  );
}
