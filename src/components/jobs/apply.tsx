"use client";

import { useActionState } from "react";
import type { ApplyState } from "@/app/trabalhos/aplicar-actions";
import { Field, ErrorState, Notice } from "@/components/ui";

const INITIAL: ApplyState = { ok: false };
type ApplyAction = (prev: ApplyState, formData: FormData) => Promise<ApplyState>;

export function JobApplicationForm({
  action,
  csrf,
  postingId,
  alreadyApplied,
}: {
  action: ApplyAction;
  csrf: string;
  postingId: string;
  alreadyApplied: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (alreadyApplied || (state.ok && state.message)) {
    return (
      <Notice tone="good" title={state.message ?? "Você já se candidatou a esta vaga"}>
        {state.action ??
          "A empresa entra em contato pelo e-mail da sua conta. Lembre: nenhuma vaga legítima cobra nada de você."}
      </Notice>
    );
  }

  return (
    <form action={formAction} className="panel" style={{ padding: "1.5rem", display: "grid", gap: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="postingId" value={postingId} />

      <div>
        <p className="t-label">Candidatura</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
          A empresa recebe seu nome, o e-mail da conta, sua mensagem e o link do portfólio. Nada além disso.
        </p>
      </div>

      <Field
        label="Mensagem"
        name="coverNote"
        hint="O que você faz, há quanto tempo, e por que esta vaga. Não precisa ser formal."
        {...(state.fields?.coverNote ? { error: state.fields.coverNote } : {})}
      >
        <textarea id="coverNote" name="coverNote" className="textarea" rows={5} maxLength={2000} disabled={pending} />
      </Field>

      <Field
        label="Portfólio (opcional)"
        name="portfolioUrl"
        hint="Instagram, Behance, Drive, site próprio — o que mostrar seu trabalho."
        {...(state.fields?.portfolioUrl ? { error: state.fields.portfolioUrl } : {})}
      >
        <input id="portfolioUrl" name="portfolioUrl" type="url" className="input" placeholder="https://" maxLength={300} disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar candidatura"}
      </button>

      {!state.ok && state.message ? (
        <ErrorState code={state.code} message={state.message} action={state.action ?? "Tente novamente."} />
      ) : null}
    </form>
  );
}
