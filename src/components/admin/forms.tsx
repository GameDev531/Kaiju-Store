"use client";

import { useActionState, useState } from "react";
import type { AdminState } from "@/app/admin/actions";
import { Field, ErrorState, Notice } from "@/components/ui";
import { VERIFICATION_LEVELS, VERIFICATION_META, type VerificationLevel } from "@/server/domain/enums";

const INITIAL: AdminState = { ok: false };
type AdminAction = (prev: AdminState, formData: FormData) => Promise<AdminState>;

function Result({ state }: { state: AdminState }) {
  if (!state.ok && state.message) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <ErrorState code={state.code} message={state.message} action={state.action ?? "Tente novamente."} />
      </div>
    );
  }
  if (state.ok && state.message) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <Notice tone="good" title={state.message}>{state.action ?? ""}</Notice>
      </div>
    );
  }
  return null;
}

export function VerificationForm({
  action,
  csrf,
  producerId,
  currentLevel,
  currentStatus,
}: {
  action: AdminAction;
  csrf: string;
  producerId: string;
  currentLevel: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [level, setLevel] = useState(currentLevel);
  const [status, setStatus] = useState(currentStatus);

  const wouldActivateUnverified = status === "ACTIVE" && level === "UNVERIFIED";

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="producerId" value={producerId} />

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Field label="Nível de verificação" name="level" {...(state.fields?.level ? { error: state.fields.level } : {})}>
          <select id="level" name="level" className="select" value={level} onChange={(e) => setLevel(e.target.value)} disabled={pending}>
            {VERIFICATION_LEVELS.map((l) => (
              <option key={l} value={l}>{VERIFICATION_META[l as VerificationLevel].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Situação" name="status">
          <select id="status" name="status" className="select" value={status} onChange={(e) => setStatus(e.target.value)} disabled={pending}>
            <option value="PENDING">Pendente</option>
            <option value="ACTIVE">Ativo</option>
            <option value="PAUSED">Pausado</option>
            <option value="SUSPENDED">Suspenso</option>
          </select>
        </Field>
      </div>

      {wouldActivateUnverified ? (
        <Notice tone="blocking" title="Combinação bloqueada">
          Um ateliê não verificado não pode ficar ativo — isso permitiria que a peça de um cliente
          chegasse a alguém que ninguém conferiu.
        </Notice>
      ) : null}

      <Field
        label="Motivo da decisão"
        name="reason"
        required
        hint="Fica na auditoria com o seu nome. Ex.: “documento de identidade e comprovante de endereço conferidos; portfólio compatível com o nível declarado”."
        {...(state.fields?.reason ? { error: state.fields.reason } : {})}
      >
        <textarea id="reason" name="reason" className="textarea" rows={3} maxLength={500} required disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={pending || wouldActivateUnverified}>
        {pending ? "Registrando…" : "Registrar decisão"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function OrderInterventionForm({
  action,
  csrf,
  orderId,
  allowed,
  labels,
}: {
  action: AdminAction;
  csrf: string;
  orderId: string;
  allowed: string[];
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (allowed.length === 0) {
    return (
      <Notice tone="info" title="Nenhuma transição disponível">
        Este pedido está em um estado terminal, ou não há movimento que a operação possa fazer a partir
        daqui.
      </Notice>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="orderId" value={orderId} />

      <Field label="Mover para" name="to" required>
        <select id="to" name="to" className="select" required disabled={pending}>
          {allowed.map((s) => (
            <option key={s} value={s}>{labels[s] ?? s}</option>
          ))}
        </select>
      </Field>

      <Field
        label="Motivo"
        name="reason"
        required
        hint="Aparece no histórico do pedido, que o cliente também lê. Escreva para ele, não para o log."
        {...(state.fields?.reason ? { error: state.fields.reason } : {})}
      >
        <textarea id="reason" name="reason" className="textarea" rows={2} maxLength={300} required disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Aplicando…" : "Aplicar transição"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function RefundForm({
  action,
  csrf,
  orderId,
  availableCents,
  currency,
}: {
  action: AdminAction;
  csrf: string;
  orderId: string;
  availableCents: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  const [confirmed, setConfirmed] = useState(false);

  const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(availableCents / 100);

  if (availableCents <= 0) {
    return (
      <Notice tone="info" title="Nada disponível para reembolso">
        Este pedido não tem valor capturado em aberto — ou nunca foi pago, ou já foi integralmente
        reembolsado.
      </Notice>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: "1.15rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="kind" value={kind} />

      <Notice tone="attention" title={`Disponível para reembolso: ${formatted}`}>
        Esta ação move dinheiro real e exige verificação em duas etapas confirmada nos últimos 15
        minutos. Ela é registrada com o seu nome e não pode ser desfeita pela plataforma.
      </Notice>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Tipo</legend>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {([["FULL", `Integral — ${formatted}`], ["PARTIAL", "Parcial"]] as const).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="kindChoice" value={value} checked={kind === value} onChange={() => setKind(value)} disabled={pending} />
              <span style={{ fontSize: "0.9rem", fontWeight: 550 }}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "PARTIAL" ? (
        <Field
          label="Valor a reembolsar"
          name="amount"
          required
          hint={`Máximo ${formatted}. Use vírgula para os centavos.`}
          {...(state.fields?.amount ? { error: state.fields.amount } : {})}
        >
          <input id="amount" name="amount" className="input t-mono" inputMode="decimal" placeholder="129,90" required disabled={pending} />
        </Field>
      ) : null}

      <Field
        label="Motivo"
        name="reason"
        required
        hint="Ex.: “peça entregue com medida de busto 3 cm fora da tolerância; refação recusada pelo cliente”."
        {...(state.fields?.reason ? { error: state.fields.reason } : {})}
      >
        <textarea id="reason" name="reason" className="textarea" rows={3} maxLength={500} required disabled={pending} />
      </Field>

      <label className="choice">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} />
        <span style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
          Confirmo que este reembolso está correto e que eu sou responsável por ele.
        </span>
      </label>

      <button type="submit" className="btn btn-primary" disabled={pending || !confirmed}>
        {pending ? "Processando…" : "Emitir reembolso"}
      </button>

      <Result state={state} />
    </form>
  );
}
