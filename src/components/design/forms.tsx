"use client";

import { useActionState, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionState } from "@/app/criar/actions";
import { ErrorState, Notice, Field } from "@/components/ui";
import { REFERENCE_ROLE_LABELS, type ReferenceRole } from "@/server/domain/enums";

/**
 * Client components for the design studio.
 *
 * They exist for one reason: an operation that takes 10–40 seconds (an image
 * upload, a model call) has to show progress, allow cancellation where possible,
 * and explain a failure. A plain server-rendered form gives a blank page and a
 * spinning tab, and that is where customers abandon a flow they have already
 * invested effort in.
 */

const INITIAL: ActionState = { ok: false };

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Shared result renderer, so no action can silently succeed or silently fail. */
function ActionResult({ state }: { state: ActionState }) {
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  if (!state.message && !state.code) return null;

  if (!state.ok) {
    return (
      <div style={{ marginTop: "1rem" }}>
        <ErrorState
          code={state.code}
          message={state.message ?? "Não foi possível concluir."}
          action={state.action ?? "Revise os dados e tente novamente."}
        />
      </div>
    );
  }
  return (
    <div style={{ marginTop: "1rem" }}>
      <Notice tone="good" title={state.message}>
        {state.action ?? "Pronto."}
      </Notice>
    </div>
  );
}

function fieldError(state: ActionState, name: string): string | undefined {
  return state.fields?.[name];
}

// ------------------------------------------------------------ create form ---

export function CreateDesignForm({ action, csrf }: { action: ServerAction; csrf: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrf} />

      <Field
        label="Como você chama esta peça?"
        name="title"
        required
        hint="Só para você reconhecer depois na sua lista. Ex.: “Jaqueta bomber do meu projeto”."
        {...(fieldError(state, "title") ? { error: fieldError(state, "title")! } : {})}
      >
        <input
          id="title"
          name="title"
          className="input"
          maxLength={120}
          required
          disabled={pending}
          aria-invalid={fieldError(state, "title") ? true : undefined}
          placeholder="Jaqueta bomber preta oversized"
        />
      </Field>

      <Field
        label="Descreva a peça com suas palavras"
        name="brief"
        hint="Quanto mais específico, melhor a ficha. Fale de caimento, tecido, cor, detalhes, e para que ocasião é. Não precisa de termos técnicos."
        {...(fieldError(state, "brief") ? { error: fieldError(state, "brief")! } : {})}
      >
        <textarea
          id="brief"
          name="brief"
          className="textarea"
          maxLength={4000}
          rows={7}
          disabled={pending}
          placeholder="Quero uma jaqueta bomber preta, bem oversized, em sarja pesada. Manga raglan, gola de ribana, zíper na frente e dois bolsos embutidos. Bordado pequeno no peito esquerdo."
        />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Criando…" : "Começar minha peça"}
      </button>

      <ActionResult state={state} />
    </form>
  );
}

// --------------------------------------------------------- reference form ---

const ROLE_ORDER: ReferenceRole[] = ["OVERALL", "SILHOUETTE", "SLEEVES", "COLOR", "DETAILS", "FABRIC", "PRINT", "FIT"];

export function ReferenceUploadForm({
  action,
  csrf,
  designId,
  disabled,
  remainingSlots,
}: {
  action: ServerAction;
  csrf: string;
  designId: string;
  disabled: boolean;
  remainingSlots: number;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [role, setRole] = useState<ReferenceRole>("OVERALL");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Client-side pre-checks are a courtesy, not a control: the same limits are
  // enforced on the server against the actual bytes.
  const MAX_MB = 10;
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLocalError(null);
    if (!file) {
      setFileName(null);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`Esta imagem tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite é ${MAX_MB} MB — comprima ou reduza antes de enviar.`);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFileName(file.name);
  };

  if (disabled) {
    return (
      <Notice tone="attention" title="Limite de referências atingido">
        Um design combina até 4 referências. Remova uma para adicionar outra — ou crie um segundo
        design se as ideias forem realmente diferentes.
      </Notice>
    );
  }

  return (
    <form action={formAction} className="panel" style={{ padding: "1.25rem", display: "grid", gap: "1.1rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="designId" value={designId} />
      <input type="hidden" name="role" value={role} />

      <div>
        <p className="t-label">Nova referência · restam {remainingSlots}</p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
          Diga <strong>para que serve</strong> esta imagem. É isso que evita o ateliê misturar a manga
          de uma foto com a cor de outra.
        </p>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Papel desta referência</legend>
        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {ROLE_ORDER.map((r) => (
            <label key={r} className="choice" style={{ padding: "0.6rem 0.7rem" }}>
              <input
                type="radio"
                name="roleChoice"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                disabled={pending}
              />
              <span>
                <span style={{ display: "block", fontWeight: 600, fontSize: "0.85rem" }}>
                  {REFERENCE_ROLE_LABELS[r].pt}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.6rem" }}>
          {REFERENCE_ROLE_LABELS[role].hint}
        </p>
      </fieldset>

      <Field
        label="Imagem"
        name="file"
        required
        hint="JPG, PNG, WebP ou AVIF. Até 10 MB. Mínimo 200×200px — quanto maior, mais detalhe o ateliê consegue ler."
        {...(localError ?? fieldError(state, "file") ? { error: (localError ?? fieldError(state, "file"))! } : {})}
      >
        <input
          ref={inputRef}
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="input"
          required
          disabled={pending}
          onChange={onPick}
          style={{ paddingBlock: "0.55rem" }}
          aria-invalid={localError ? true : undefined}
        />
      </Field>

      {fileName ? (
        <p className="t-mono" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
          Selecionado: {fileName}
        </p>
      ) : null}

      <Field label="Legenda (opcional)" name="caption" hint="O que exatamente nesta imagem você quer? Ex.: “só o formato do capuz”.">
        <input id="caption" name="caption" className="input" maxLength={200} disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-ink" disabled={pending || !fileName}>
        {pending ? "Enviando e verificando…" : "Adicionar referência"}
      </button>

      {pending ? (
        <p role="status" aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
          Verificando o arquivo: tipo real, dimensões e integridade. Leva alguns segundos.
        </p>
      ) : null}

      <ActionResult state={state} />
    </form>
  );
}

// ---------------------------------------------------------- analyse button ---

export function AnalyseForm({
  action,
  csrf,
  designId,
  hasReferences,
  hasBrief,
  isReanalysis,
}: {
  action: ServerAction;
  csrf: string;
  designId: string;
  hasReferences: boolean;
  hasBrief: boolean;
  isReanalysis: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (!hasReferences && !hasBrief) {
    return (
      <Notice tone="attention" title="Falta matéria-prima para a análise">
        Envie ao menos uma referência ou escreva a descrição da peça. Sem nenhum dos dois não há o que ler.
      </Notice>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="designId" value={designId} />

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Analisando…" : isReanalysis ? "Analisar novamente" : "Gerar ficha técnica"}
      </button>

      {pending ? (
        <div className="panel-sunk" style={{ marginTop: "1rem", padding: "1rem" }} role="status" aria-live="polite">
          <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>Lendo suas referências…</p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.35rem" }}>
            Isso costuma levar de 10 a 40 segundos. Não feche a página. Se falhar, suas referências e seu
            texto continuam salvos e você pode tentar de novo sem perder nada.
          </p>
          <div className="skeleton" style={{ height: 8, marginTop: "0.85rem" }} />
        </div>
      ) : null}

      {!hasReferences && hasBrief && !pending ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
          Sem imagem, a ficha sai só do seu texto — e vem com mais campos incertos. Uma foto muda muito o resultado.
        </p>
      ) : null}

      <ActionResult state={state} />
    </form>
  );
}

// ------------------------------------------------------------- spec editor ---

export interface EditableField {
  key: string;
  label: string;
  value: string;
  confidence: string;
  editedByCustomer: boolean;
  rationale?: string | undefined;
}

export function SpecEditor({
  action,
  csrf,
  designId,
  versionId,
  fields,
  summary,
  readOnly,
}: {
  action: ServerAction;
  csrf: string;
  designId: string;
  versionId: string;
  fields: EditableField[];
  summary: string;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [dirty, setDirty] = useState(false);

  return (
    <form action={formAction} onChange={() => setDirty(true)}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="designId" value={designId} />
      <input type="hidden" name="versionId" value={versionId} />

      <div className="table-scroll">
        <table className="table">
          <caption className="sr-only">
            Ficha técnica editável. Cada linha mostra o valor, a confiabilidade e um campo para você corrigir.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: "22%" }}>Campo</th>
              <th scope="col" style={{ width: "14%" }}>Confiança</th>
              <th scope="col">Valor — edite se estiver errado</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key}>
                <th scope="row" style={{ fontWeight: 600, fontSize: "0.875rem", borderBottom: "1px solid var(--color-rule)", textAlign: "left", textTransform: "none", letterSpacing: 0, fontFamily: "inherit", color: "inherit", whiteSpace: "normal" }}>
                  {field.label}
                  {field.editedByCustomer ? (
                    <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-shu)", fontWeight: 500 }}>
                      editado por você
                    </span>
                  ) : null}
                </th>
                <td>
                  <span className={`conf conf-${field.confidence.toLowerCase()}`}>{confLabel(field.confidence)}</span>
                </td>
                <td>
                  <input
                    name={`field.${field.key}`}
                    className="input"
                    defaultValue={field.value}
                    maxLength={400}
                    disabled={pending || readOnly}
                    aria-label={`${field.label}: valor`}
                  />
                  {field.rationale ? (
                    <p style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.35rem", lineHeight: 1.45 }}>
                      {field.rationale}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <Field
          label="Resumo que vai para o ateliê"
          name="summary"
          hint="Esta é a primeira coisa que a costureira lê. Ajuste se quiser deixar alguma prioridade explícita."
        >
          <textarea
            id="summary"
            name="summary"
            className="textarea"
            defaultValue={summary}
            maxLength={1200}
            rows={4}
            disabled={pending || readOnly}
          />
        </Field>
      </div>

      {!readOnly ? (
        <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", flexWrap: "wrap", marginTop: "1.25rem" }}>
          <button type="submit" className="btn btn-ink" disabled={pending || !dirty}>
            {pending ? "Salvando nova versão…" : "Salvar como nova versão"}
          </button>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", maxWidth: "44ch" }}>
            Editar nunca sobrescreve. Cada alteração cria uma versão nova, e a anterior fica no histórico.
          </p>
        </div>
      ) : (
        <Notice tone="info" title="Esta versão está aprovada e congelada">
          Uma versão aprovada não muda mais — é ela que o ateliê vai executar. Para ajustar algo,
          volte à ficha e salve uma nova versão; ela precisará de uma nova aprovação e de um novo orçamento.
        </Notice>
      )}

      <ActionResult state={state} />
    </form>
  );
}

function confLabel(kind: string): string {
  switch (kind) {
    case "OBSERVED": return "Observado";
    case "INFERRED": return "Deduzido";
    case "UNCERTAIN": return "Incerto";
    default: return "Sugerido";
  }
}

// --------------------------------------------------------- approve + quote ---

export function ApproveForm({
  action,
  csrf,
  designId,
  versionId,
  measurementProfiles,
  blocked,
}: {
  action: ServerAction;
  csrf: string;
  designId: string;
  versionId: string;
  measurementProfiles: { id: string; name: string; complete: boolean }[];
  blocked: { message: string; resolution: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [confirmed, setConfirmed] = useState(false);

  if (blocked.length > 0) {
    return (
      <div className="stack">
        {blocked.map((b, i) => (
          <Notice key={i} tone="blocking" title={b.message}>
            {b.resolution}
          </Notice>
        ))}
      </div>
    );
  }

  return (
    <form action={formAction} className="panel corner-ticks" style={{ padding: "1.5rem", display: "grid", gap: "1.25rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="designId" value={designId} />
      <input type="hidden" name="versionId" value={versionId} />

      <div>
        <p className="t-label">Etapa final antes do orçamento</p>
        <p className="t-title" style={{ marginTop: "0.5rem" }}>Aprovar esta versão da ficha</p>
      </div>

      <Field
        label="Perfil de medidas"
        name="measurementProfileId"
        required
        hint="Sem medidas, a peça não entra em produção. Você pode criar um perfil em Conta → Medidas."
      >
        <select id="measurementProfileId" name="measurementProfileId" className="select" required disabled={pending}>
          <option value="">Selecione…</option>
          {measurementProfiles.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.complete}>
              {p.name}{p.complete ? "" : " — incompleto"}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Field label="Quantidade" name="quantity" hint="Cada peça é feita individualmente.">
          <input id="quantity" name="quantity" type="number" min={1} max={20} defaultValue={1} className="input" disabled={pending} />
        </Field>
        <label className="choice">
          <input type="checkbox" name="rush" disabled={pending} />
          <span>
            <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem" }}>Prazo reduzido</span>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
              O ateliê reorganiza a fila. Custa mais e o valor aparece no orçamento.
            </span>
          </span>
        </label>
      </div>

      <label className="choice">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} />
        <span style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
          Li a ficha inteira e ela descreve a peça que eu quero. Entendo que{" "}
          <strong>o ateliê vai executar exatamente esta versão</strong>, e que campos marcados como
          Deduzido ou Sugerido são leituras, não garantias.
        </span>
      </label>

      <button type="submit" className="btn btn-primary" disabled={pending || !confirmed}>
        {pending ? "Aprovando e calculando…" : "Aprovar e ver o orçamento"}
      </button>

      <ActionResult state={state} />
    </form>
  );
}
