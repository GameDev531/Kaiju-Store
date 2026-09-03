import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { getDesignForUser } from "@/server/domain/designs";
import { parseSpecJson, listSpecFields, countByConfidence, blockingWarnings, renderProductionSheet } from "@/server/domain/spec";
import { signFileUrl } from "@/server/storage";
import {
  Breadcrumbs, Label, Notice, ConfidenceLegend, ConfidenceTag, MediaFrame, Badge, SectionHead,
} from "@/components/ui";
import {
  ReferenceUploadForm, AnalyseForm, SpecEditor, ApproveForm, type EditableField,
} from "@/components/design/forms";
import {
  uploadReferenceAction, analyseDesignAction, reviseSpecAction, approveAndQuoteAction, removeReferenceAction,
} from "../actions";
import { REFERENCE_ROLE_LABELS, type ReferenceRole, type ConfidenceKind } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Estúdio de design", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MAX_REFERENCES = 4;

export default async function DesignStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(`/criar/${id}`)}`);

  const design = await getDesignForUser(id, auth.user.id).catch(() => null);
  if (!design) notFound();

  const [csrfUpload, csrfRemove, csrfAnalyse, csrfRevise, csrfApprove, profiles] = await Promise.all([
    csrfToken("design.reference"),
    csrfToken("design.reference.remove"),
    csrfToken("design.analyse"),
    csrfToken("design.revise"),
    csrfToken("design.approve"),
    db.measurementProfile.findMany({
      where: { userId: auth.user.id, deletedAt: null },
      orderBy: { isDefault: "desc" },
    }),
  ]);

  const current = design.versions[0] ?? null;
  const spec = current ? parseSpecJson(current.specJson) : null;
  const confidence = spec ? countByConfidence(spec) : null;
  const blocking = spec ? blockingWarnings(spec) : [];
  const latestAnalysis = design.analyses[0] ?? null;

  const editableFields: EditableField[] = spec
    ? listSpecFields(spec).map((entry) => ({
        key: entry.key,
        label: entry.label,
        value: entry.field.value,
        confidence: entry.field.confidence,
        editedByCustomer: entry.field.editedByCustomer,
        rationale: entry.field.rationale,
      }))
    : [];

  const step = !spec ? 2 : current?.approvedAt ? 5 : 3;

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[
          { href: "/", label: "Início" },
          { href: "/criar", label: "Criar minha peça" },
          { label: design.title },
        ]}
      />

      <header style={{ marginTop: "1.5rem", display: "flex", gap: "1.5rem", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>Passo {step} de 6 · Estúdio</Label>
          <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{design.title}</h1>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Badge tone={design.status === "APPROVED" ? "ink" : "default"}>{design.status}</Badge>
          {current ? <Badge>versão {current.version}</Badge> : null}
          {latestAnalysis?.provider ? <Badge tone="blueprint">análise: {latestAnalysis.provider}</Badge> : null}
        </div>
      </header>

      {design.briefText ? (
        <div className="panel-sunk" style={{ padding: "1rem 1.15rem", marginTop: "1.5rem" }}>
          <Label>Sua descrição</Label>
          <p style={{ marginTop: "0.5rem", fontSize: "0.925rem", color: "var(--color-ink-soft)", whiteSpace: "pre-wrap" }}>
            {design.briefText}
          </p>
        </div>
      ) : null}

      {/* ============ REFERENCES ============ */}
      <section style={{ marginTop: "3rem" }} aria-labelledby="refs-title">
        <SectionHead label={`Passo 2 · ${design.references.length}/${MAX_REFERENCES} referências`} title="Referências e seus papéis" />
        <p id="refs-title" className="sr-only">Referências</p>

        {design.references.length > 0 ? (
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))", marginBottom: "2rem" }}>
            {design.references.map((link, index) => {
              const file = link.referenceImage.file;
              const url = file.scanStatus === "REJECTED" ? null : signFileUrl(file.id, auth.user.id);
              return (
                <div key={link.id} className="panel" style={{ padding: "0.75rem" }}>
                  <div style={{ position: "relative" }}>
                    <MediaFrame
                      kind="CUSTOMER_PHOTO"
                      alt={link.referenceImage.caption ?? `Referência ${index + 1}: ${REFERENCE_ROLE_LABELS[link.role as ReferenceRole].pt}`}
                      src={url}
                      aspect="1 / 1"
                    />
                  </div>
                  <p className="t-mono" style={{ fontSize: "0.7rem", color: "var(--color-shu)", fontWeight: 700, marginTop: "0.6rem" }}>
                    REF {String(index + 1).padStart(2, "0")}
                  </p>
                  <p style={{ fontWeight: 600, fontSize: "0.875rem", marginTop: "0.2rem" }}>
                    {REFERENCE_ROLE_LABELS[link.role as ReferenceRole].pt}
                  </p>
                  {link.referenceImage.caption ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                      {link.referenceImage.caption}
                    </p>
                  ) : null}
                  {file.scanStatus === "PENDING" ? (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-inferred)", marginTop: "0.4rem" }}>
                      ◐ Verificação de segurança em andamento
                    </p>
                  ) : null}

                  <form action={removeReferenceAction as unknown as (fd: FormData) => void} style={{ marginTop: "0.75rem" }}>
                    <input type="hidden" name="csrf" value={csrfRemove} />
                    <input type="hidden" name="designId" value={design.id} />
                    <input type="hidden" name="linkId" value={link.id} />
                    <button type="submit" className="btn btn-quiet btn-sm btn-block">Remover</button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : null}

        <ReferenceUploadForm
          action={uploadReferenceAction}
          csrf={csrfUpload}
          designId={design.id}
          disabled={design.references.length >= MAX_REFERENCES}
          remainingSlots={MAX_REFERENCES - design.references.length}
        />
      </section>

      {/* ============ ANALYSIS ============ */}
      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Passo 3" title={spec ? "Ficha técnica" : "Gerar a ficha técnica"} />

        {!spec ? (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            <ConfidenceLegend />
            <AnalyseForm
              action={analyseDesignAction}
              csrf={csrfAnalyse}
              designId={design.id}
              hasReferences={design.references.length > 0}
              hasBrief={Boolean(design.briefText)}
              isReanalysis={false}
            />
          </div>
        ) : (
          <>
            {/* Confidence summary: the honest headline about this sheet. */}
            <div className="panel-blueprint" style={{ padding: "1.15rem", marginBottom: "1.5rem" }}>
              <Label>O que sabemos sobre esta peça</Label>
              <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                {(["OBSERVED", "INFERRED", "UNCERTAIN", "RECOMMENDED"] as ConfidenceKind[]).map((kind) => (
                  <div key={kind} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <ConfidenceTag kind={kind} />
                    <span className="t-mono" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                      {confidence?.[kind] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.85rem", lineHeight: 1.55 }}>
                Campos <strong>Incertos</strong> e <strong>Sugeridos</strong> são onde a sua decisão vale
                mais que a nossa leitura. Comece por eles.
              </p>
            </div>

            {spec.summary ? (
              <div className="panel" style={{ padding: "1.15rem", marginBottom: "1.5rem" }}>
                <Label>Resumo para o ateliê</Label>
                <p style={{ marginTop: "0.5rem", lineHeight: 1.6 }}>{spec.summary}</p>
              </div>
            ) : null}

            {spec.warnings.length > 0 ? (
              <div style={{ display: "grid", gap: "0.85rem", marginBottom: "1.75rem" }}>
                {spec.warnings.map((w, i) => (
                  <Notice
                    key={`${w.code}-${i}`}
                    tone={w.severity === "BLOCKING" ? "blocking" : w.severity === "ATTENTION" ? "attention" : "info"}
                    title={w.message}
                  >
                    {w.resolution}
                  </Notice>
                ))}
              </div>
            ) : null}

            <SpecEditor
              action={reviseSpecAction}
              csrf={csrfRevise}
              designId={design.id}
              versionId={current!.id}
              fields={editableFields}
              summary={spec.summary}
              readOnly={Boolean(current!.approvedAt)}
            />

            {/* Reference usage — closing the loop on "what did you do with my photos". */}
            {spec.referenceUsage.length > 0 ? (
              <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "2rem" }}>
                <Label>O que usamos de cada referência</Label>
                <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.6rem" }}>
                  {spec.referenceUsage.map((u, i) => (
                    <li key={i} style={{ fontSize: "0.875rem" }}>
                      <strong>{REFERENCE_ROLE_LABELS[u.role].pt}</strong>{" "}
                      <span style={{ color: "var(--color-ink-soft)" }}>— {u.usedFor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!current!.approvedAt ? (
              <div style={{ marginTop: "2rem" }}>
                <AnalyseForm
                  action={analyseDesignAction}
                  csrf={csrfAnalyse}
                  designId={design.id}
                  hasReferences={design.references.length > 0}
                  hasBrief={Boolean(design.briefText)}
                  isReanalysis
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* ============ VERSION HISTORY ============ */}
      {design.versions.length > 1 ? (
        <section style={{ marginTop: "3rem" }}>
          <SectionHead label="Passo 4" title="Histórico de versões" />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Versão</th>
                  <th scope="col">Autor</th>
                  <th scope="col">O que mudou</th>
                  <th scope="col">Aprovada</th>
                </tr>
              </thead>
              <tbody>
                {design.versions.map((v) => (
                  <tr key={v.id}>
                    <td className="t-mono">v{v.version}</td>
                    <td>{v.authoredBy === "AI" ? "Análise" : v.authoredBy === "CUSTOMER" ? "Você" : v.authoredBy}</td>
                    <td>{v.changeSummary ?? "—"}</td>
                    <td>
                      {v.approvedAt ? (
                        <span className="t-mono" style={{ fontSize: "0.75rem" }}>
                          {v.approvedAt.toLocaleDateString("pt-BR")}
                          <br />
                          <span style={{ color: "var(--color-ink-faint)" }}>{v.specHash?.slice(0, 12)}…</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
            A assinatura ao lado de uma versão aprovada é o hash da ficha exata. É por ela que o controle
            de qualidade confere se a peça produzida corresponde ao que você aprovou.
          </p>
        </section>
      ) : null}

      {/* ============ APPROVE ============ */}
      {spec && current && !current.approvedAt ? (
        <section style={{ marginTop: "3rem" }}>
          <SectionHead label="Passo 5" title="Aprovar e orçar" />
          {profiles.length === 0 ? (
            <Notice tone="blocking" title="Você ainda não tem um perfil de medidas">
              Uma peça sob medida precisa das suas medidas. Leva cerca de cinco minutos com uma fita métrica —
              temos um guia com cada ponto ilustrado.{" "}
              <Link href="/conta/medidas" className="link">Criar meu perfil de medidas</Link>
            </Notice>
          ) : (
            <ApproveForm
              action={approveAndQuoteAction}
              csrf={csrfApprove}
              designId={design.id}
              versionId={current.id}
              measurementProfiles={profiles.map((p) => ({
                id: p.id,
                name: p.name,
                complete: [p.chestMm, p.waistMm, p.heightMm].filter(Boolean).length >= 3,
              }))}
              blocked={blocking.map((b) => ({ message: b.message, resolution: b.resolution }))}
            />
          )}
        </section>
      ) : null}

      {/* ============ APPROVED: production sheet ============ */}
      {spec && current?.approvedAt ? (
        <section style={{ marginTop: "3rem" }}>
          <SectionHead label="Aprovado" title="Ficha de produção" />
          <Notice tone="good" title="Esta é a ficha que vai para o ateliê">
            Ela está congelada com a assinatura <span className="t-mono">{current.specHash?.slice(0, 16)}…</span>.
            Qualquer divergência entre a peça entregue e esta ficha é responsabilidade nossa e do ateliê.
          </Notice>
          <pre
            className="panel-sunk t-mono"
            style={{ padding: "1.25rem", marginTop: "1.25rem", overflowX: "auto", fontSize: "0.75rem", lineHeight: 1.55, whiteSpace: "pre" }}
          >
            {renderProductionSheet(spec, {
              reference: design.id.slice(0, 8).toUpperCase(),
              designTitle: design.title,
              version: current.version,
            })}
          </pre>

          {design.quotations[0] ? (
            <Link href={`/criar/${design.id}/orcamento/${design.quotations[0].id}`} className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
              Ver o orçamento
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
