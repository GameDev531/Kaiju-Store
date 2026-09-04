"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AtelierState } from "@/app/atelie/actions";
import { Field, ErrorState, Notice } from "@/components/ui";
import { STAGE_LABELS, type ProductionStageName } from "@/server/domain/enums";

const INITIAL: AtelierState = { ok: false };
type AtelierAction = (prev: AtelierState, formData: FormData) => Promise<AtelierState>;

function Result({ state }: { state: AtelierState }) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

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

export function ProducerApplicationForm({
  action,
  csrf,
  specializations,
}: {
  action: AtelierAction;
  csrf: string;
  specializations: readonly { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k]! } : {});

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.5rem" }}>
      <input type="hidden" name="csrf" value={csrf} />

      <Field label="Nome do ateliê ou do seu trabalho" name="studioName" required {...err("studioName")}>
        <input id="studioName" name="studioName" className="input" maxLength={120} required disabled={pending} />
      </Field>

      <Field
        label="Conte sobre o seu trabalho"
        name="bio"
        hint="Que tipo de peça você faz há mais tempo? Que máquinas tem? O que você não pega?"
        {...err("bio")}
      >
        <textarea id="bio" name="bio" className="textarea" maxLength={1200} rows={5} disabled={pending} />
      </Field>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "2fr 1fr" }}>
        <Field label="Cidade" name="city" required {...err("city")}>
          <input id="city" name="city" className="input" maxLength={100} required disabled={pending} />
        </Field>
        <Field label="UF" name="state" required {...err("state")}>
          <input id="state" name="state" className="input" maxLength={2} required disabled={pending} style={{ textTransform: "uppercase" }} />
        </Field>
      </div>

      <fieldset style={{ border: "1px solid var(--color-rule)", padding: "1.25rem", borderRadius: 2 }}>
        <legend className="t-label" style={{ padding: "0 0.5rem" }}>O que você faz</legend>
        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginBottom: "1rem" }}>
          Marque só o que você realmente executa bem. É por isto que os trabalhos são direcionados —
          marcar demais só traz peça que você vai acabar recusando.
        </p>
        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {specializations.map((s) => (
            <label key={s.value} className="choice" style={{ padding: "0.6rem 0.75rem" }}>
              <input type="checkbox" name="specializations" value={s.value} disabled={pending} />
              <span style={{ fontSize: "0.875rem", fontWeight: 550 }}>{s.label}</span>
            </label>
          ))}
        </div>
        {state.fields?.specializations ? <p className="field-error" style={{ marginTop: "0.75rem" }}>{state.fields.specializations}</p> : null}
      </fieldset>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Field
          label="Quantas peças por semana"
          name="weeklyCapacity"
          required
          hint="Seja realista. Passar do que dá conta derruba seu índice de pontualidade."
          {...err("weeklyCapacity")}
        >
          <input id="weeklyCapacity" name="weeklyCapacity" type="number" min={1} max={50} defaultValue={3} className="input" required disabled={pending} />
        </Field>
        <Field
          label="Complexidade máxima (1 a 5)"
          name="maxComplexity"
          required
          hint="1 = camiseta lisa. 5 = alfaiataria, couro, corset, construção elaborada."
          {...err("maxComplexity")}
        >
          <select id="maxComplexity" name="maxComplexity" className="select" defaultValue="3" required disabled={pending}>
            <option value="1">1 — peças simples</option>
            <option value="2">2 — peças básicas com detalhe</option>
            <option value="3">3 — peças estruturadas</option>
            <option value="4">4 — construção elaborada</option>
            <option value="5">5 — alfaiataria e materiais difíceis</option>
          </select>
        </Field>
      </div>

      <Notice tone="info" title="O que acontece depois">
        Seu cadastro entra em análise. Nossa equipe confere identidade e portfólio antes de liberar
        trabalhos — nenhum pedido de cliente chega a um ateliê não verificado. Enquanto isso você já
        vê o painel e a documentação de como a produção funciona aqui.
      </Notice>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Enviando cadastro…" : "Enviar cadastro"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function JobOfferActions({
  acceptAction,
  declineAction,
  csrfAccept,
  csrfDecline,
  jobId,
}: {
  acceptAction: AtelierAction;
  declineAction: AtelierAction;
  csrfAccept: string;
  csrfDecline: string;
  jobId: string;
}) {
  const [acceptState, acceptFormAction, acceptPending] = useActionState(acceptAction, INITIAL);
  const [declineState, declineFormAction, declinePending] = useActionState(declineAction, INITIAL);
  const [showDecline, setShowDecline] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <form action={acceptFormAction}>
          <input type="hidden" name="csrf" value={csrfAccept} />
          <input type="hidden" name="jobId" value={jobId} />
          <button type="submit" className="btn btn-primary" disabled={acceptPending || declinePending}>
            {acceptPending ? "Aceitando…" : "Aceitar este trabalho"}
          </button>
        </form>
        {!showDecline ? (
          <button type="button" className="btn btn-quiet" onClick={() => setShowDecline(true)} disabled={acceptPending}>
            Recusar
          </button>
        ) : null}
      </div>

      {showDecline ? (
        <form action={declineFormAction} style={{ marginTop: "1rem", display: "grid", gap: "0.85rem", maxWidth: "42rem" }}>
          <input type="hidden" name="csrf" value={csrfDecline} />
          <input type="hidden" name="jobId" value={jobId} />
          <Field
            label="Por que está recusando?"
            name="reason"
            required
            hint="Fica só entre você e a plataforma. Serve para não te oferecermos o mesmo tipo de peça de novo."
            {...(declineState.fields?.reason ? { error: declineState.fields.reason } : {})}
          >
            <textarea id="reason" name="reason" className="textarea" rows={3} maxLength={300} required disabled={declinePending} />
          </Field>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" className="btn btn-outline" disabled={declinePending}>
              {declinePending ? "Recusando…" : "Confirmar recusa"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setShowDecline(false)} disabled={declinePending}>
              Voltar
            </button>
          </div>
        </form>
      ) : null}

      <Result state={acceptState} />
      <Result state={declineState} />
    </div>
  );
}

export function StageControl({
  action,
  csrf,
  jobId,
  stages,
}: {
  action: AtelierAction;
  csrf: string;
  jobId: string;
  stages: { id: string; stage: string; status: string; note: string | null; blockedReason: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [selected, setSelected] = useState(stages.find((s) => s.status !== "DONE")?.stage ?? stages[0]?.stage ?? "");
  const [status, setStatus] = useState<"IN_PROGRESS" | "DONE" | "BLOCKED">("IN_PROGRESS");

  return (
    <form action={formAction} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "1.15rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="stage" value={selected} />
      <input type="hidden" name="status" value={status} />

      <div>
        <p className="t-label">Atualizar produção</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
          O cliente vê cada atualização no acompanhamento do pedido, em tempo real.
        </p>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Etapa</legend>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {stages.map((s) => (
            <label key={s.id} className="choice" style={{ padding: "0.5rem 0.75rem" }}>
              <input
                type="radio"
                name="stageChoice"
                value={s.stage}
                checked={selected === s.stage}
                onChange={() => setSelected(s.stage)}
                disabled={pending}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 550 }}>
                {STAGE_LABELS[s.stage as ProductionStageName] ?? s.stage}
                {s.status === "DONE" ? " ✓" : s.status === "BLOCKED" ? " ▲" : ""}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Situação</legend>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {([
            ["IN_PROGRESS", "Comecei esta etapa"],
            ["DONE", "Concluí esta etapa"],
            ["BLOCKED", "Estou travado — preciso de uma resposta do cliente"],
          ] as const).map(([value, label]) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="statusChoice"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
                disabled={pending}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 550 }}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {status === "BLOCKED" ? (
        <Field
          label="O que precisa ser decidido?"
          name="blockedReason"
          required
          hint="Este texto vai direto para o cliente. Seja específico: “o tecido da referência não existe em preto, aceita grafite?” resolve; “dúvida no tecido” não."
          {...(state.fields?.blockedReason ? { error: state.fields.blockedReason } : {})}
        >
          <textarea id="blockedReason" name="blockedReason" className="textarea" rows={3} maxLength={300} required disabled={pending} />
        </Field>
      ) : (
        <Field label="Observação (opcional)" name="note" hint="Fica registrada no histórico do trabalho.">
          <input id="note" name="note" className="input" maxLength={500} disabled={pending} />
        </Field>
      )}

      <button type="submit" className="btn btn-ink" disabled={pending || !selected}>
        {pending ? "Registrando…" : "Registrar atualização"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function PhotoUploadForm({
  action,
  csrf,
  jobId,
  stages,
}: {
  action: AtelierAction;
  csrf: string;
  jobId: string;
  stages: string[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "1.15rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="jobId" value={jobId} />

      <div>
        <p className="t-label">Foto de produção</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
          Uma foto por etapa importante reduz muito a chance de contestação depois. O cliente vê
          exatamente estas imagens.
        </p>
      </div>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Field label="Etapa" name="stage">
          <select id="stage" name="stage" className="select" disabled={pending}>
            <option value="">—</option>
            {stages.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s as ProductionStageName] ?? s}</option>
            ))}
          </select>
        </Field>
        <Field label="Tipo" name="kind">
          <select id="kind" name="kind" className="select" defaultValue="PROGRESS" disabled={pending}>
            <option value="PROGRESS">Progresso</option>
            <option value="QC">Controle de qualidade</option>
          </select>
        </Field>
      </div>

      <Field
        label="Arquivo"
        name="file"
        required
        hint="JPG, PNG, WebP ou AVIF, até 10 MB."
        {...(state.fields?.file ? { error: state.fields.file } : {})}
      >
        <input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="input"
          required
          disabled={pending}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          style={{ paddingBlock: "0.55rem" }}
        />
      </Field>

      <Field label="Legenda" name="caption" hint="Ex.: “peças cortadas, conferidas contra o molde”.">
        <input id="caption" name="caption" className="input" maxLength={200} disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-ink" disabled={pending || !fileName}>
        {pending ? "Enviando…" : "Enviar foto"}
      </button>

      <Result state={state} />
    </form>
  );
}

const QC_MEASUREMENTS = [
  ["chest", "Busto / peito"], ["waist", "Cintura"], ["hip", "Quadril"],
  ["shoulder", "Ombro a ombro"], ["sleeve", "Manga"], ["inseam", "Entrepernas"],
  ["outseam", "Lateral"], ["neck", "Pescoço"],
] as const;

export function QualityCheckForm({
  action,
  csrf,
  jobId,
  checklist,
  targetMm,
  toleranceMm,
}: {
  action: AtelierAction;
  csrf: string;
  jobId: string;
  checklist: readonly { key: string; label: string }[];
  targetMm: Record<string, number | undefined>;
  toleranceMm: number;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "1.5rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="jobId" value={jobId} />

      <div>
        <p className="t-label">Controle de qualidade</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", maxWidth: "60ch" }}>
          Meça a peça pronta e compare com a ficha aprovada. Tolerância acordada com o cliente:{" "}
          <strong>±{toleranceMm} mm</strong>. Os números ficam registrados — é isso que responde
          objetivamente uma contestação, para os dois lados.
        </p>
      </div>

      <fieldset style={{ border: "1px solid var(--color-rule)", padding: "1.15rem", borderRadius: 2 }}>
        <legend className="t-label" style={{ padding: "0 0.5rem" }}>Medidas da peça pronta (cm)</legend>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {QC_MEASUREMENTS.map(([key, label]) => {
            const target = targetMm[`${key}Mm`];
            return (
              <Field
                key={key}
                label={label}
                name={`measured.${key}`}
                hint={target ? `Aprovado: ${(target / 10).toFixed(1)} cm` : "Sem alvo na ficha"}
              >
                <input
                  id={`measured.${key}`}
                  name={`measured.${key}`}
                  className="input"
                  inputMode="decimal"
                  placeholder="cm"
                  disabled={pending}
                />
              </Field>
            );
          })}
        </div>
      </fieldset>

      <fieldset style={{ border: "1px solid var(--color-rule)", padding: "1.15rem", borderRadius: 2 }}>
        <legend className="t-label" style={{ padding: "0 0.5rem" }}>Checklist</legend>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {checklist.map((item) => (
            <label key={item.key} className="choice">
              <input type="checkbox" name={`check.${item.key}`} disabled={pending} />
              <span style={{ fontSize: "0.875rem" }}>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Registrando conferência…" : "Registrar controle de qualidade"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function ReadyToShipForm({ action, csrf, jobId }: { action: AtelierAction; csrf: string; jobId: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return (
    <form action={formAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Finalizando…" : "Marcar como pronto para envio"}
      </button>
      <Result state={state} />
    </form>
  );
}
