"use client";

import { useActionState, useState } from "react";
import type { AccountState } from "@/app/conta/actions";
import { Field, ErrorState, Notice } from "@/components/ui";

const INITIAL: AccountState = { ok: false };
type AccountAction = (prev: AccountState, formData: FormData) => Promise<AccountState>;

function Result({ state }: { state: AccountState }) {
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

/**
 * Each measurement carries its own how-to. A tape in the wrong place is the most
 * common cause of a garment that does not fit, and a form without guidance
 * invites exactly that — then blames the customer for it later.
 */
const MEASUREMENTS: { name: string; label: string; how: string }[] = [
  { name: "height", label: "Altura", how: "De pé, descalço, do chão ao topo da cabeça." },
  { name: "chest", label: "Busto / peito", how: "Na parte mais larga, fita horizontal, sem apertar." },
  { name: "waist", label: "Cintura", how: "Na parte mais estreita do tronco, geralmente na altura do umbigo." },
  { name: "hip", label: "Quadril", how: "Na parte mais larga do quadril, com os pés juntos." },
  { name: "shoulder", label: "Ombro a ombro", how: "Pelas costas, de uma ponta do ombro à outra." },
  { name: "sleeve", label: "Comprimento de manga", how: "Da ponta do ombro ao punho, com o braço levemente dobrado." },
  { name: "inseam", label: "Entrepernas", how: "Da virilha até o chão, pela parte interna da perna." },
  { name: "outseam", label: "Lateral da perna", how: "Da cintura até o chão, pela lateral." },
  { name: "neck", label: "Pescoço", how: "Na base do pescoço, com um dedo de folga." },
  { name: "thigh", label: "Coxa", how: "Na parte mais larga da coxa." },
  { name: "wrist", label: "Punho", how: "Ao redor do osso do punho." },
  { name: "torso", label: "Tronco (ombro ao quadril)", how: "Do topo do ombro até a linha do quadril, pela frente." },
];

export function MeasurementForm({
  action,
  csrf,
  profile,
}: {
  action: AccountAction;
  csrf: string;
  profile?: {
    id: string;
    name: string;
    source: string;
    values: Record<string, number | null>;
    notes: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  // Millimetres in the database, centimetres in the form — one decimal place is
  // the precision a tape measure actually gives.
  const cm = (key: string): string => {
    const value = profile?.values[`${key}Mm`];
    return typeof value === "number" ? (value / 10).toFixed(1) : "";
  };

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.5rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      {profile ? <input type="hidden" name="profileId" value={profile.id} /> : null}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Field label="Nome do perfil" name="name" hint="Ex.: “Meu corpo”, “Presente para a Ana”.">
          <input id="name" name="name" className="input" maxLength={60} defaultValue={profile?.name ?? "Meu corpo"} disabled={pending} />
        </Field>
        <Field label="Como foram medidas?" name="source" hint="Isso muda a tolerância com que o ateliê trabalha.">
          <select id="source" name="source" className="select" defaultValue={profile?.source ?? "SELF_REPORTED"} disabled={pending}>
            <option value="SELF_REPORTED">Eu mesmo(a) medi</option>
            <option value="TAILOR_MEASURED">Um(a) profissional mediu</option>
            <option value="FROM_GARMENT">Tirei de uma peça que serve bem</option>
          </select>
        </Field>
      </div>

      <fieldset style={{ border: "1px solid var(--color-rule)", padding: "1.25rem", borderRadius: 2 }}>
        <legend className="t-label" style={{ padding: "0 0.5rem" }}>Medidas em centímetros</legend>
        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginBottom: "1.25rem", maxWidth: "62ch" }}>
          Peça ajuda para medir as costas e os ombros — sozinho é onde mais se erra. Use uma fita flexível,
          rente ao corpo mas sem apertar, por cima de roupa fina. Preencha o que conseguir: altura,
          busto/peito e cintura são o mínimo para produzir.
        </p>
        <div style={{ display: "grid", gap: "1.15rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {MEASUREMENTS.map((m) => (
            <Field
              key={m.name}
              label={m.label}
              name={m.name}
              hint={m.how}
              {...(state.fields?.[`${m.name}Mm`] ? { error: state.fields[`${m.name}Mm`]! } : {})}
            >
              <input
                id={m.name}
                name={m.name}
                className="input"
                inputMode="decimal"
                placeholder="cm"
                defaultValue={cm(m.name)}
                disabled={pending}
                aria-invalid={state.fields?.[`${m.name}Mm`] ? true : undefined}
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <Field label="Observações para o ateliê" name="notes" hint="Ex.: “um ombro é mais baixo”, “prefiro manga um pouco mais longa”.">
        <textarea id="notes" name="notes" className="textarea" maxLength={500} rows={3} defaultValue={profile?.notes ?? ""} disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando…" : profile ? "Salvar alterações" : "Salvar perfil de medidas"}
      </button>

      <Result state={state} />
    </form>
  );
}

export function AddressForm({ action, csrf }: { action: AccountAction; csrf: string }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k]! } : {});

  return (
    <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.15rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Field label="Apelido do endereço" name="label" {...err("label")}>
          <input id="label" name="label" className="input" defaultValue="Casa" maxLength={40} disabled={pending} />
        </Field>
        <Field label="Quem recebe" name="recipient" required {...err("recipient")}>
          <input id="recipient" name="recipient" className="input" autoComplete="name" maxLength={120} required disabled={pending} />
        </Field>
      </div>
      <Field label="Rua e número" name="line1" required {...err("line1")}>
        <input id="line1" name="line1" className="input" autoComplete="address-line1" maxLength={200} required disabled={pending} />
      </Field>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Field label="Complemento" name="line2" {...err("line2")}>
          <input id="line2" name="line2" className="input" autoComplete="address-line2" maxLength={120} disabled={pending} />
        </Field>
        <Field label="Bairro" name="district" {...err("district")}>
          <input id="district" name="district" className="input" maxLength={100} disabled={pending} />
        </Field>
        <Field label="CEP" name="postalCode" required {...err("postalCode")}>
          <input id="postalCode" name="postalCode" className="input t-mono" autoComplete="postal-code" placeholder="00000-000" maxLength={9} required disabled={pending} />
        </Field>
      </div>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "2fr 1fr" }}>
        <Field label="Cidade" name="city" required {...err("city")}>
          <input id="city" name="city" className="input" autoComplete="address-level2" maxLength={100} required disabled={pending} />
        </Field>
        <Field label="UF" name="state" required {...err("state")}>
          <input id="state" name="state" className="input" maxLength={2} required disabled={pending} style={{ textTransform: "uppercase" }} />
        </Field>
      </div>
      <Field label="Telefone" name="phone" hint="A transportadora usa em caso de problema na entrega." {...err("phone")}>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" maxLength={30} disabled={pending} />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Salvando…" : "Salvar endereço"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function PrivacyControls({
  exportAction,
  forgetAction,
  deleteAction,
  csrfExport,
  csrfForget,
  csrfDelete,
}: {
  exportAction: AccountAction;
  forgetAction: AccountAction;
  deleteAction: AccountAction;
  csrfExport: string;
  csrfForget: string;
  csrfDelete: string;
}) {
  const [exportState, exportFormAction, exportPending] = useActionState(exportAction, INITIAL);
  const [forgetState, forgetFormAction, forgetPending] = useActionState(forgetAction, INITIAL);
  const [deleteState, deleteFormAction, deletePending] = useActionState(deleteAction, INITIAL);
  const [showDelete, setShowDelete] = useState(false);

  // The export is produced server-side and turned into a download here, so the
  // JSON never travels through a URL or a temporary public file.
  const download = () => {
    if (!exportState.exportJson) return;
    const blob = new Blob([exportState.exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaiju-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack" style={{ ["--stack-gap" as string]: "2rem" }}>
      <section className="panel" style={{ padding: "1.5rem" }}>
        <h2 className="t-title">Exportar meus dados</h2>
        <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Baixa um arquivo JSON com tudo que guardamos sobre você: conta, endereços, medidas, designs
          e todas as versões das fichas, pedidos, referências enviadas e seu perfil de gosto.
        </p>
        <form action={exportFormAction} style={{ marginTop: "1.15rem" }}>
          <input type="hidden" name="csrf" value={csrfExport} />
          <button type="submit" className="btn btn-outline" disabled={exportPending}>
            {exportPending ? "Reunindo seus dados…" : "Gerar exportação"}
          </button>
        </form>
        {exportState.exportJson ? (
          <div style={{ marginTop: "1rem" }}>
            <Notice tone="good" title="Exportação pronta">
              <button type="button" onClick={download} className="btn btn-ink btn-sm" style={{ marginTop: "0.5rem" }}>
                Baixar arquivo JSON
              </button>
            </Notice>
          </div>
        ) : null}
        <Result state={exportState} />
      </section>

      <section className="panel" style={{ padding: "1.5rem" }}>
        <h2 className="t-title">Apagar meu histórico de navegação</h2>
        <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Remove tudo que usamos para recomendar peças: o que você viu, buscou e salvou, além do perfil
          de gosto calculado a partir disso. Seus pedidos, designs e medidas continuam intactos.
          As recomendações voltam ao ponto de partida.
        </p>
        <form action={forgetFormAction} style={{ marginTop: "1.15rem" }}>
          <input type="hidden" name="csrf" value={csrfForget} />
          <button type="submit" className="btn btn-outline" disabled={forgetPending}>
            {forgetPending ? "Apagando…" : "Apagar histórico e perfil de gosto"}
          </button>
        </form>
        <Result state={forgetState} />
      </section>

      <section className="panel" style={{ padding: "1.5rem", borderColor: "var(--color-uncertain)" }}>
        <h2 className="t-title">Excluir minha conta</h2>
        <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
          Encerra seu acesso imediatamente e agenda a exclusão dos seus dados. Pedidos em produção são
          concluídos antes — um ateliê no meio de uma peça precisa das medidas para terminá-la. Registros
          fiscais são mantidos pelo prazo legal e não são usados para nada além disso.
        </p>

        {!showDelete ? (
          <button type="button" className="btn btn-quiet" style={{ marginTop: "1.15rem" }} onClick={() => setShowDelete(true)}>
            Quero excluir minha conta
          </button>
        ) : (
          <form action={deleteFormAction} style={{ marginTop: "1.15rem", display: "grid", gap: "1rem" }}>
            <input type="hidden" name="csrf" value={csrfDelete} />
            <Field
              label="Digite APAGAR para confirmar"
              name="confirmation"
              required
              {...(deleteState.fields?.confirmation ? { error: deleteState.fields.confirmation } : {})}
            >
              <input id="confirmation" name="confirmation" className="input" required disabled={deletePending} autoComplete="off" />
            </Field>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={deletePending}>
                {deletePending ? "Registrando…" : "Confirmar exclusão"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setShowDelete(false)} disabled={deletePending}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        <Result state={deleteState} />
      </section>
    </div>
  );
}
