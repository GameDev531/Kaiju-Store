import type { Metadata } from "next";
import { db } from "@/server/db";
import { requirePermissionContext } from "@/server/auth/session";
import { Label, SectionHead, Badge, EmptyState, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Auditoria", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ acao?: string; alvo?: string }>;
}) {
  await requirePermissionContext("admin.audit.read");
  const { acao, alvo } = await searchParams;

  const entries = await db.auditLog.findMany({
    where: {
      ...(acao ? { action: { contains: acao } } : {}),
      ...(alvo ? { targetType: alvo } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true, displayName: true } } },
  });

  const [securityEvents, targetTypes] = await Promise.all([
    db.fraudSignal.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.auditLog.groupBy({ by: ["targetType"], _count: { _all: true } }),
  ]);

  return (
    <div>
      <Label>Registro imutável</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Auditoria</h1>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="info" title="Este registro não pode ser editado nem apagado">
          A aplicação só escreve nesta tabela — não há caminho de código que atualize ou remova uma
          linha, e esta tela é somente leitura. Instantâneos de estado excluem senhas, segredos de MFA,
          tokens e documentos de identificação.
        </Notice>
      </div>

      <form method="get" action="/admin/auditoria" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label className="field-label" htmlFor="acao">Ação contém</label>
          <input id="acao" name="acao" className="input" defaultValue={acao ?? ""} placeholder="order.status, refund, role" />
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label className="field-label" htmlFor="alvo">Tipo de alvo</label>
          <select id="alvo" name="alvo" className="select" defaultValue={alvo ?? ""}>
            <option value="">Todos</option>
            {targetTypes.map((t) => (
              <option key={t.targetType} value={t.targetType}>
                {t.targetType} ({t._count._all})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-ink">Filtrar</button>
      </form>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label={`${entries.length} registro(s)`} title="Trilha de auditoria" />
        {entries.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum registro com este filtro" description="Ajuste os filtros acima." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Registro de ações sensíveis</caption>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                  <th scope="col">O quê</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">Mudança</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="t-mono" style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {e.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>
                      {e.actor ? e.actor.displayName : e.actorRole ?? "sistema"}
                      {e.actorRole ? (
                        <span style={{ display: "block", color: "var(--color-ink-faint)", fontSize: "0.72rem" }}>{e.actorRole}</span>
                      ) : null}
                    </td>
                    <td className="t-mono" style={{ fontSize: "0.78rem" }}>{e.action}</td>
                    <td style={{ fontSize: "0.78rem" }}>
                      {e.targetType}
                      <span style={{ display: "block", color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
                        {e.targetId.slice(0, 12)}…
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", maxWidth: "22rem" }}>
                      {e.oldStateJson ? (
                        <span style={{ display: "block", color: "var(--color-ink-faint)" }}>
                          antes: {e.oldStateJson.slice(0, 90)}
                        </span>
                      ) : null}
                      {e.newStateJson ? (
                        <span style={{ display: "block" }}>depois: {e.newStateJson.slice(0, 90)}</span>
                      ) : null}
                      {e.reason ? (
                        <span style={{ display: "block", color: "var(--color-shu)", marginTop: "0.2rem" }}>
                          motivo: {e.reason}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Antifraude" title="Sinais recentes" />
        {securityEvents.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum sinal registrado" description="Sinais de velocidade, abuso de cupom, farm de recompensa e afins aparecem aqui." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {securityEvents.map((s) => (
                  <tr key={s.id}>
                    <td className="t-mono" style={{ fontSize: "0.75rem" }}>{s.createdAt.toLocaleDateString("pt-BR")}</td>
                    <td><Badge tone={s.score >= 70 ? "shu" : "default"}>{s.kind}</Badge></td>
                    <td className="num">{s.score}</td>
                    <td>{s.action}</td>
                    <td style={{ fontSize: "0.8rem" }}>{s.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
