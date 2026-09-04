import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { getJobForProducer } from "@/server/domain/production";
import { parseSpecJson, listSpecFields, renderProductionSheet } from "@/server/domain/spec";
import { signFileUrl } from "@/server/storage";
import {
  Breadcrumbs, Label, Badge, Notice, SectionHead, ConfidenceTag, ConfidenceLegend, MediaFrame, MoneyText,
} from "@/components/ui";
import {
  JobOfferActions, StageControl, PhotoUploadForm, QualityCheckForm, ReadyToShipForm,
} from "@/components/atelier/forms";
import {
  acceptJobAction, declineJobAction, advanceStageAction, uploadProgressPhotoAction,
  submitQualityCheckAction, markReadyToShipAction,
} from "@/app/atelie/actions";
import { QC_CHECKLIST } from "@/app/atelie/constants";
import { REFERENCE_ROLE_LABELS, STAGE_LABELS, type ReferenceRole, type ProductionStageName } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Trabalho", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(`/atelie/painel/trabalhos/${id}`)}`);

  const producer = await db.producer.findUnique({ where: { userId: auth.user.id }, select: { id: true } });
  if (!producer) redirect("/atelie/entrar");

  // Two paths: a job already assigned to this producer, or an open offer to them.
  const assigned = await getJobForProducer(id, producer.id).catch(() => null);

  const offered = assigned
    ? null
    : await db.jobOffer.findFirst({
        where: { jobId: id, producerId: producer.id, status: "OFFERED", expiresAt: { gt: new Date() } },
        include: {
          job: {
            include: {
              designVersion: true,
              orderItem: { select: { titleSnapshot: true, quantity: true } },
              order: { select: { currency: true } },
            },
          },
        },
      });

  if (!assigned && !offered) notFound();

  const job = assigned ?? offered!.job;
  const spec = job.designVersion ? parseSpecJson(job.designVersion.specJson) : null;
  const isOffer = !assigned;

  const [csrfAccept, csrfDecline, csrfStage, csrfPhoto, csrfQc, csrfReady] = await Promise.all([
    csrfToken("atelier.job.accept"),
    csrfToken("atelier.job.decline"),
    csrfToken("atelier.job.stage"),
    csrfToken("atelier.job.photo"),
    csrfToken("atelier.job.qc"),
    csrfToken("atelier.job.ready"),
  ]);

  // References are only loaded for an accepted job — an open offer shows the
  // written spec, not the customer's uploaded images.
  const references = assigned
    ? await db.designReference.findMany({
        where: { design: { versions: { some: { id: job.designVersionId ?? "" } } } },
        include: { referenceImage: { include: { file: true } } },
        orderBy: { position: "asc" },
      })
    : [];

  const measurements = assigned?.orderItem?.measurementProfile ?? null;
  const targetMm: Record<string, number | undefined> = spec?.measurements
    ? (spec.measurements as unknown as Record<string, number | undefined>)
    : {};

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[
          { href: "/atelie/painel", label: "Painel do ateliê" },
          { label: job.reference },
        ]}
      />

      <header style={{ marginTop: "1.5rem", display: "flex", gap: "1.5rem", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>{isOffer ? "Oferta aberta" : "Trabalho aceito"}</Label>
          <h1 className="t-display-sm t-mono" style={{ marginTop: "0.6rem" }}>{job.reference}</h1>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
            {spec?.garmentType.value ?? "Peça sob medida"}
            {job.role !== "PRIMARY" ? ` · ${job.role}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="t-label">Você recebe</p>
          <p style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            <MoneyText cents={job.payoutCents} currency={job.currency} />
          </p>
          {job.dueAt ? (
            <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
              Prazo: {job.dueAt.toLocaleDateString("pt-BR")}
            </p>
          ) : null}
        </div>
      </header>

      {isOffer ? (
        <div style={{ marginTop: "2rem" }}>
          <Notice tone="attention" title="Você ainda não aceitou este trabalho">
            As referências visuais do cliente e as medidas completas ficam disponíveis depois que
            você aceitar. A ficha técnica abaixo já mostra tudo o que define a peça — leia com atenção
            antes de decidir, porque depois de aceitar o prazo passa a correr.
          </Notice>
          <div style={{ marginTop: "1.5rem" }}>
            <JobOfferActions
              acceptAction={acceptJobAction}
              declineAction={declineJobAction}
              csrfAccept={csrfAccept}
              csrfDecline={csrfDecline}
              jobId={job.id}
            />
          </div>
        </div>
      ) : null}

      {/* ---- the spec ---- */}
      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Contrato de produção" title="Ficha técnica aprovada" />

        {job.designVersion?.specHash ? (
          <Notice tone="good" title="Esta ficha foi aprovada e congelada pelo cliente">
            Assinatura <span className="t-mono">{job.designVersion.specHash.slice(0, 20)}…</span>.
            Ela não muda. Qualquer divergência que você encontrar deve ser levantada{" "}
            <strong>antes do corte</strong>, pelo controle de etapas abaixo — não durante ou depois.
          </Notice>
        ) : null}

        {spec ? (
          <>
            <div style={{ marginTop: "1.5rem" }}>
              <ConfidenceLegend />
            </div>

            <div className="panel" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
              <Label>Resumo do cliente</Label>
              <p style={{ marginTop: "0.5rem", lineHeight: 1.65 }}>{spec.summary}</p>
            </div>

            <div className="table-scroll" style={{ marginTop: "1.5rem" }}>
              <table className="table">
                <caption className="sr-only">Ficha técnica da peça</caption>
                <thead>
                  <tr>
                    <th scope="col">Campo</th>
                    <th scope="col">Confiança</th>
                    <th scope="col">Especificação</th>
                  </tr>
                </thead>
                <tbody>
                  {listSpecFields(spec).map((entry) => (
                    <tr key={entry.key}>
                      <th scope="row" style={{ textAlign: "left", fontFamily: "inherit", textTransform: "none", letterSpacing: 0, color: "inherit", fontWeight: 600, fontSize: "0.875rem", borderBottom: "1px solid var(--color-rule)", whiteSpace: "normal" }}>
                        {entry.label}
                      </th>
                      <td><ConfidenceTag kind={entry.field.confidence} /></td>
                      <td>
                        {entry.field.value}
                        {entry.field.editedByCustomer ? (
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-shu)", fontWeight: 600, marginTop: "0.2rem" }}>
                            Definido pelo cliente — vale sobre qualquer leitura automática
                          </span>
                        ) : null}
                        {entry.field.rationale ? (
                          <span style={{ display: "block", fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                            {entry.field.rationale}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {spec.colorEstimate.length > 0 ? (
              <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "1.25rem" }}>
                <Label>Cores</Label>
                <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>
                  Cor lida de imagem não é cor calibrada. Confirme contra a cartela física antes de cortar.
                </p>
                <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {spec.colorEstimate.map((c, i) => (
                    <li key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      {c.approximateHex ? (
                        <span
                          aria-hidden="true"
                          style={{ width: 28, height: 28, background: c.approximateHex, border: "1px solid var(--color-rule-strong)", flexShrink: 0 }}
                        />
                      ) : null}
                      <span style={{ fontSize: "0.85rem" }}>
                        {c.name}
                        {c.approximateHex ? <span className="t-mono" style={{ color: "var(--color-ink-faint)" }}> ~{c.approximateHex}</span> : null}
                      </span>
                      <ConfidenceTag kind={c.confidence} showLabel={false} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {spec.constructionNotes.length > 0 ? (
              <div style={{ marginTop: "1.5rem", display: "grid", gap: "0.75rem" }}>
                {spec.constructionNotes.map((n, i) => (
                  <Notice key={i} tone={n.blocksProduction ? "blocking" : "info"} title={n.topic}>
                    {n.note}
                    {n.blocksProduction ? <strong> Confirme antes de cortar.</strong> : null}
                  </Notice>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <Notice tone="attention" title="Este trabalho não tem ficha técnica anexada">
            Não inicie a produção. Acione o suporte com a referência deste trabalho.
          </Notice>
        )}
      </section>

      {/* ---- references + measurements (accepted only) ---- */}
      {assigned ? (
        <>
          {references.length > 0 ? (
            <section style={{ marginTop: "3rem" }}>
              <SectionHead label="Do cliente" title="Referências visuais" />
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {references.map((r, i) => (
                  <figure key={r.id} className="panel" style={{ padding: "0.75rem", margin: 0 }}>
                    <MediaFrame
                      kind="CUSTOMER_PHOTO"
                      alt={r.referenceImage.caption ?? `Referência ${i + 1}`}
                      src={r.referenceImage.file.scanStatus === "CLEAN" || r.referenceImage.file.scanStatus === "PENDING"
                        ? signFileUrl(r.referenceImage.fileId, auth.user.id)
                        : null}
                      aspect="1 / 1"
                    />
                    <figcaption style={{ marginTop: "0.6rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "block" }}>
                        {REFERENCE_ROLE_LABELS[r.role as ReferenceRole].pt}
                      </span>
                      {r.referenceImage.caption ? (
                        <span style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)" }}>{r.referenceImage.caption}</span>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          {measurements ? (
            <section style={{ marginTop: "3rem" }}>
              <SectionHead label="Do cliente" title="Medidas" />
              <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginBottom: "1rem", maxWidth: "62ch" }}>
                Origem: <strong>{measurementSourceLabel(measurements.source)}</strong>.
                Você recebe medidas e ficha técnica — nunca o nome, o endereço ou o contato do cliente.
              </p>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr><th scope="col">Medida</th><th scope="col" className="num">mm</th><th scope="col" className="num">cm</th></tr>
                  </thead>
                  <tbody>
                    {([
                      ["Altura", measurements.heightMm], ["Busto/peito", measurements.chestMm],
                      ["Cintura", measurements.waistMm], ["Quadril", measurements.hipMm],
                      ["Ombro a ombro", measurements.shoulderMm], ["Manga", measurements.sleeveMm],
                      ["Entrepernas", measurements.inseamMm], ["Lateral", measurements.outseamMm],
                      ["Pescoço", measurements.neckMm], ["Coxa", measurements.thighMm],
                      ["Punho", measurements.wristMm], ["Tronco", measurements.torsoMm],
                    ] as const)
                      .filter(([, v]) => typeof v === "number")
                      .map(([label, v]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td className="num">{v}</td>
                          <td className="num">{((v as number) / 10).toFixed(1)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {measurements.notes ? (
                <div style={{ marginTop: "1rem" }}>
                  <Notice tone="attention" title="Observação do cliente sobre o corpo">{measurements.notes}</Notice>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ---- production controls ---- */}
          <section style={{ marginTop: "3rem" }}>
            <SectionHead label="Produção" title="Etapas e evidências" />
            <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
              <StageControl
                action={advanceStageAction}
                csrf={csrfStage}
                jobId={job.id}
                stages={assigned.stages.map((s) => ({
                  id: s.id, stage: s.stage, status: s.status, note: s.note, blockedReason: s.blockedReason,
                }))}
              />
              <PhotoUploadForm
                action={uploadProgressPhotoAction}
                csrf={csrfPhoto}
                jobId={job.id}
                stages={assigned.stages.map((s) => s.stage)}
              />
            </div>

            {assigned.assets.length > 0 ? (
              <div style={{ marginTop: "2rem" }}>
                <Label>Fotos enviadas</Label>
                <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", marginTop: "0.75rem" }}>
                  {assigned.assets.map((a) => (
                    <figure key={a.id} style={{ margin: 0 }}>
                      <MediaFrame kind="CUSTOMER_PHOTO" alt={a.caption ?? "Foto de produção"} src={signFileUrl(a.fileId, auth.user.id)} aspect="1 / 1" />
                      <figcaption style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.3rem" }}>
                        {a.stage ? `${STAGE_LABELS[a.stage as ProductionStageName] ?? a.stage} · ` : ""}
                        {a.caption ?? "sem legenda"}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* ---- quality control ---- */}
          <section style={{ marginTop: "3rem" }}>
            <SectionHead label="Antes de enviar" title="Controle de qualidade" />
            {assigned.checks.length > 0 ? (
              <div style={{ marginBottom: "1.5rem", display: "grid", gap: "0.75rem" }}>
                {assigned.checks.map((c) => (
                  <Notice
                    key={c.id}
                    tone={c.result === "PASS" ? "good" : c.result === "FAIL" ? "blocking" : "info"}
                    title={`Conferência de ${c.createdAt.toLocaleDateString("pt-BR")}: ${c.result}`}
                  >
                    {c.failures ? (
                      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
                        {(JSON.parse(c.failures) as string[]).map((f, i) => <li key={i} style={{ fontSize: "0.85rem" }}>{f}</li>)}
                      </ul>
                    ) : (
                      "Todos os pontos conferidos dentro da tolerância."
                    )}
                  </Notice>
                ))}
              </div>
            ) : null}

            <QualityCheckForm
              action={submitQualityCheckAction}
              csrf={csrfQc}
              jobId={job.id}
              checklist={QC_CHECKLIST}
              targetMm={targetMm}
              toleranceMm={spec?.measurements?.toleranceMm ?? 15}
            />

            {assigned.checks.some((c) => c.result === "PASS") && assigned.status !== "COMPLETED" ? (
              <div style={{ marginTop: "1.5rem" }}>
                <ReadyToShipForm action={markReadyToShipAction} csrf={csrfReady} jobId={job.id} />
              </div>
            ) : null}
          </section>

          {/* ---- printable sheet ---- */}
          {spec ? (
            <section style={{ marginTop: "3rem" }}>
              <SectionHead label="Para a mesa de corte" title="Ficha imprimível" />
              <pre
                className="panel-sunk t-mono"
                style={{ padding: "1.25rem", overflowX: "auto", fontSize: "0.72rem", lineHeight: 1.5, whiteSpace: "pre" }}
              >
                {renderProductionSheet(spec, {
                  reference: job.reference,
                  designTitle: assigned.orderItem?.titleSnapshot ?? "Peça sob medida",
                  version: 1,
                })}
              </pre>
            </section>
          ) : null}
        </>
      ) : null}

      <p style={{ marginTop: "3rem", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
        Dúvida sobre a plataforma? <Link href="/contato" className="link">Fale com o suporte</Link>.
      </p>
    </div>
  );
}

function measurementSourceLabel(source: string): string {
  const map: Record<string, string> = {
    SELF_REPORTED: "o próprio cliente mediu — trabalhe com a tolerância acordada",
    TAILOR_MEASURED: "medido por profissional — números confiáveis",
    FROM_GARMENT: "tirado de uma peça que serve — confira a folga",
  };
  return map[source] ?? source;
}
