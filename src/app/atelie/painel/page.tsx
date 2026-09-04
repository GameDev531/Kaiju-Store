import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { Label, SectionHead, Badge, EmptyState, Notice, MoneyText } from "@/components/ui";
import { VERIFICATION_META, JOB_STATUSES, type VerificationLevel } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Painel do ateliê", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AtelierDashboardPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/atelie/painel");

  const producer = await db.producer.findUnique({
    where: { userId: auth.user.id },
    include: { specializations: true },
  });
  if (!producer) redirect("/atelie/entrar");

  const [offers, activeJobs, completedJobs, payouts] = await Promise.all([
    db.jobOffer.findMany({
      where: { producerId: producer.id, status: "OFFERED", expiresAt: { gt: new Date() } },
      include: {
        job: {
          include: {
            designVersion: { select: { specJson: true } },
            order: { select: { currency: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.productionJob.findMany({
      where: { producerId: producer.id, status: { in: ["ACCEPTED", "IN_PRODUCTION", "AWAITING_CLARIFICATION", "QC_PENDING", "QC_FAILED"] } },
      include: { stages: { orderBy: { position: "asc" } }, order: { select: { reference: true, currency: true } } },
      orderBy: { dueAt: "asc" },
    }),
    db.productionJob.count({ where: { producerId: producer.id, status: "COMPLETED" } }),
    db.payout.findMany({ where: { producerId: producer.id }, orderBy: { periodEnd: "desc" }, take: 3 }),
  ]);

  const pendingVerification = producer.status === "PENDING" || producer.verificationLevel === "UNVERIFIED";

  return (
    <div className="wrap section">
      <header style={{ display: "flex", gap: "1.5rem", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>Painel do ateliê</Label>
          <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{producer.studioName}</h1>
          <p style={{ color: "var(--color-ink-faint)", fontSize: "0.9rem", marginTop: "0.35rem" }}>
            {producer.city}/{producer.state}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Badge tone={producer.verificationLevel === "UNVERIFIED" ? "default" : "ink"}>
            {VERIFICATION_META[producer.verificationLevel as VerificationLevel].label}
          </Badge>
          <Badge>{producer.activeJobCount}/{producer.weeklyCapacity} em produção</Badge>
          <Badge>Complexidade até {producer.maxComplexity}</Badge>
        </div>
      </header>

      {pendingVerification ? (
        <div style={{ marginTop: "2rem" }}>
          <Notice tone="attention" title="Seu cadastro está em análise">
            Enquanto a verificação não conclui, você não recebe ofertas de trabalho — nenhum pedido de
            cliente vai para um ateliê não verificado, e é isso que dá segurança às duas pontas.
            Nossa equipe entra em contato para pedir a documentação. Nesse meio tempo, vale ler a{" "}
            <Link href="/como-funciona" className="link">documentação de produção</Link>.
          </Notice>
        </div>
      ) : null}

      {/* ---- offers ---- */}
      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Ofertas abertas" title="Trabalhos disponíveis para você" />
        {offers.length === 0 ? (
          <EmptyState
            mark="◇"
            title={pendingVerification ? "Ofertas liberadas após a verificação" : "Nenhuma oferta no momento"}
            description={
              pendingVerification
                ? "Assim que sua documentação for aprovada, trabalhos compatíveis com suas especializações aparecem aqui."
                : "Os trabalhos são direcionados pelas suas especializações, complexidade máxima e capacidade livre. Ajuste esses limites se quiser receber mais."
            }
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
            {offers.map((offer) => {
              const spec = offer.job.designVersion ? safeSpec(offer.job.designVersion.specJson) : null;
              const hoursLeft = Math.max(0, Math.round((offer.expiresAt.getTime() - Date.now()) / 3_600_000));
              return (
                <li key={offer.id} className="panel corner-ticks" style={{ padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ maxWidth: "48ch" }}>
                      <p className="t-mono" style={{ fontSize: "0.72rem", color: "var(--color-ink-faint)" }}>
                        {offer.job.reference}
                      </p>
                      <p style={{ fontWeight: 650, fontSize: "1.05rem", marginTop: "0.3rem" }}>
                        {spec?.garmentType?.value ?? "Peça sob medida"}
                      </p>
                      {spec?.summary ? (
                        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.5rem", lineHeight: 1.55 }}>
                          {spec.summary.slice(0, 220)}
                        </p>
                      ) : null}
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
                        {spec ? <Badge>Complexidade {spec.productionComplexity}/5</Badge> : null}
                        <Badge>{offer.job.role === "PRIMARY" ? "Costura completa" : offer.job.role}</Badge>
                        <Badge tone={hoursLeft < 6 ? "shu" : "default"}>Expira em {hoursLeft}h</Badge>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="t-label">Você recebe</p>
                      <p style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
                        <MoneyText cents={offer.job.payoutCents} currency={offer.job.currency} />
                      </p>
                      {offer.job.dueAt ? (
                        <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)", marginTop: "0.35rem" }}>
                          Prazo: {offer.job.dueAt.toLocaleDateString("pt-BR")}
                        </p>
                      ) : null}
                      <Link href={`/atelie/painel/trabalhos/${offer.job.id}`} className="btn btn-primary btn-sm" style={{ marginTop: "0.85rem" }}>
                        Ver ficha completa
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- active ---- */}
      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Em produção" title="Trabalhos aceitos" />
        {activeJobs.length === 0 ? (
          <EmptyState mark="◇" title="Nada em produção" description="Trabalhos que você aceitar aparecem aqui com o checklist de etapas." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
            {activeJobs.map((job) => {
              const done = job.stages.filter((s) => s.status === "DONE").length;
              const blocked = job.stages.some((s) => s.status === "BLOCKED");
              const late = job.dueAt !== null && job.dueAt < new Date();
              return (
                <li key={job.id}>
                  <Link href={`/atelie/painel/trabalhos/${job.id}`} className="panel" style={{ display: "block", padding: "1.25rem", textDecoration: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <div>
                        <p className="t-mono" style={{ fontSize: "0.72rem", color: "var(--color-ink-faint)" }}>
                          {job.reference} · pedido {job.order.reference}
                        </p>
                        <p style={{ fontWeight: 650, marginTop: "0.3rem" }}>
                          {done}/{job.stages.length} etapas concluídas
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                        {blocked ? <Badge tone="shu">Aguardando cliente</Badge> : null}
                        {late ? <Badge tone="shu">Prazo vencido</Badge> : null}
                        <Badge>{jobStatusLabel(job.status)}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", marginTop: "1rem", flexWrap: "wrap" }}>
                      {job.stages.map((s) => (
                        <span
                          key={s.id}
                          className="badge"
                          style={{
                            opacity: s.status === "PENDING" ? 0.4 : 1,
                            borderColor: s.status === "DONE" ? "var(--color-observed)" : s.status === "BLOCKED" ? "var(--color-uncertain)" : undefined,
                          }}
                        >
                          {s.status === "DONE" ? "✓" : s.status === "IN_PROGRESS" ? "◐" : s.status === "BLOCKED" ? "▲" : "○"} {s.stage}
                        </span>
                      ))}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- performance ---- */}
      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Seu histórico" title="Desempenho" action={{ href: "/atelie/painel/ganhos", label: "Ver ganhos" }} />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            ["Peças entregues", String(completedJobs)],
            ["No prazo", producer.completedJobs > 0 ? `${(producer.onTimeRateBp / 100).toFixed(0)}%` : "—"],
            ["Índice de defeitos", producer.completedJobs > 0 ? `${(producer.defectRateBp / 100).toFixed(1)}%` : "—"],
            ["Índice de qualidade", producer.completedJobs > 0 ? `${producer.qualityScore}/1000` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="panel-sunk" style={{ padding: "1.15rem" }}>
              <p className="t-label">{label}</p>
              <p className="t-num" style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: "0.35rem" }}>{value}</p>
            </div>
          ))}
        </div>
        {producer.completedJobs === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
            Os índices aparecem depois da primeira entrega. Até lá você não é penalizado por falta de
            histórico — a distribuição de trabalho considera isso.
          </p>
        ) : null}
      </section>

      {payouts.length > 0 ? (
        <section style={{ marginTop: "3rem" }}>
          <SectionHead label="Financeiro" title="Últimos repasses" action={{ href: "/atelie/painel/ganhos", label: "Ver tudo" }} />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.periodStart.toLocaleDateString("pt-BR")} — {p.periodEnd.toLocaleDateString("pt-BR")}</td>
                    <td><Badge>{p.status}</Badge></td>
                    <td className="num"><MoneyText cents={p.netCents} currency={p.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function safeSpec(json: string): { garmentType?: { value: string }; summary?: string; productionComplexity: number } | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function jobStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ACCEPTED: "Aceito",
    IN_PRODUCTION: "Em produção",
    AWAITING_CLARIFICATION: "Aguardando resposta",
    QC_PENDING: "Qualidade pendente",
    QC_FAILED: "Reprovado na qualidade",
    COMPLETED: "Concluído",
  };
  return map[status] ?? status;
}
