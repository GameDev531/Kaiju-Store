import type { Metadata } from "next";
import { db } from "@/server/db";
import { requirePermissionContext, csrfToken } from "@/server/auth/session";
import { VerificationForm } from "@/components/admin/forms";
import { setProducerVerificationAction } from "../actions";
import { Label, SectionHead, Badge, EmptyState, Notice } from "@/components/ui";
import { VERIFICATION_META, type VerificationLevel } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Ateliês", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminProducersPage() {
  await requirePermissionContext("admin.producer.verify");
  const csrf = await csrfToken("admin.producer.verify");

  const [pending, active, others] = await Promise.all([
    db.producer.findMany({
      where: { status: "PENDING" },
      include: {
        specializations: true,
        user: { select: { email: true, displayName: true, createdAt: true } },
        verificationDocs: { select: { id: true, kind: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.producer.findMany({
      where: { status: "ACTIVE" },
      include: { specializations: true, _count: { select: { jobs: true } } },
      orderBy: { qualityScore: "desc" },
    }),
    db.producer.findMany({
      where: { status: { in: ["PAUSED", "SUSPENDED"] } },
      include: { user: { select: { email: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div>
      <Label>Rede de produção</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Ateliês</h1>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="attention" title="Esta é a porta de entrada da rede">
          Nenhuma peça de cliente chega a um ateliê que não passou por aqui. Um cadastro aprovado sem
          conferência real de documentação transfere o risco para quem comprou. Registre o que você
          efetivamente verificou no motivo — é o que resta se algo der errado depois.
        </Notice>
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label={`${pending.length} aguardando`} title="Fila de verificação" />
        {pending.length === 0 ? (
          <EmptyState mark="✓" title="Nenhum cadastro aguardando" description="Novos cadastros de ateliê aparecem aqui assim que são enviados." />
        ) : (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            {pending.map((p) => (
              <article key={p.id} className="panel corner-ticks" style={{ padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
                  <div style={{ maxWidth: "48ch" }}>
                    <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{p.studioName}</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                      {p.city}/{p.state} · cadastro de {p.user.createdAt.toLocaleDateString("pt-BR")}
                    </p>
                    <p className="t-mono" style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>
                      {p.user.email}
                    </p>
                    {p.bio ? (
                      <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.75rem", lineHeight: 1.6 }}>
                        {p.bio}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="t-label">Declara</p>
                    <p style={{ fontSize: "0.9rem", marginTop: "0.35rem" }}>
                      {p.weeklyCapacity} peças/semana
                      <br />
                      complexidade até {p.maxComplexity}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  {p.specializations.map((s) => (
                    <Badge key={s.id}>{s.kind}: {s.value}</Badge>
                  ))}
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <p className="t-label">Documentos</p>
                  {p.verificationDocs.length === 0 ? (
                    <p style={{ fontSize: "0.85rem", color: "var(--color-uncertain)", marginTop: "0.35rem", fontWeight: 600 }}>
                      ▲ Nenhum documento enviado. Solicite antes de aprovar.
                    </p>
                  ) : (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                      {p.verificationDocs.map((d) => (
                        <Badge key={d.id}>{d.kind} · {d.status}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <VerificationForm
                  action={setProducerVerificationAction}
                  csrf={csrf}
                  producerId={p.id}
                  currentLevel={p.verificationLevel}
                  currentStatus={p.status}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label={`${active.length} ativo(s)`} title="Rede ativa" />
        {active.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum ateliê ativo" description="Sem ateliê ativo, pedidos sob medida ficam em espera após o pagamento." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Ateliê</th>
                  <th scope="col">Nível</th>
                  <th scope="col">Especializações</th>
                  <th scope="col" className="num">Carga</th>
                  <th scope="col" className="num">Qualidade</th>
                  <th scope="col" className="num">No prazo</th>
                </tr>
              </thead>
              <tbody>
                {active.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{p.studioName}</span>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--color-ink-faint)" }}>
                        {p.city}/{p.state}
                      </span>
                    </td>
                    <td><Badge tone="ink">{VERIFICATION_META[p.verificationLevel as VerificationLevel].label}</Badge></td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {p.specializations.map((s) => s.value).join(", ") || "—"}
                    </td>
                    <td className="num">{p.activeJobCount}/{p.weeklyCapacity}</td>
                    <td className="num">{p.completedJobs > 0 ? p.qualityScore : "—"}</td>
                    <td className="num">{p.completedJobs > 0 ? `${(p.onTimeRateBp / 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {others.length > 0 ? (
        <section style={{ marginTop: "3rem" }}>
          <SectionHead label={`${others.length}`} title="Pausados e suspensos" />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Ateliê</th><th scope="col">Situação</th><th scope="col">Contato</th></tr>
              </thead>
              <tbody>
                {others.map((p) => (
                  <tr key={p.id}>
                    <td>{p.studioName}</td>
                    <td><Badge tone={p.status === "SUSPENDED" ? "shu" : "default"}>{p.status}</Badge></td>
                    <td className="t-mono" style={{ fontSize: "0.78rem" }}>{p.user.email}</td>
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
