import type { Metadata } from "next";
import { db } from "@/server/db";
import { requirePermissionContext } from "@/server/auth/session";
import { Label, SectionHead, Badge, EmptyState, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Moderação", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  await requirePermissionContext("content.moderate");

  const [cases, reports] = await Promise.all([
    db.moderationCase.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      take: 100,
    }),
    db.copyrightReport.findMany({
      where: { status: { in: ["RECEIVED", "REVIEWING"] } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);

  return (
    <div>
      <Label>Confiança e segurança</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Moderação</h1>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="info" title="Toda decisão aqui é registrada e reversível">
          Um caso decidido guarda quem decidiu, quando e por quê. Não apagamos conteúdo de cliente sem
          um caso aberto e uma decisão registrada — inclusive porque uma remoção sem trilha é
          indefensável se for contestada depois.
        </Notice>
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label={`${cases.length} caso(s) aberto(s)`} title="Fila de moderação" />
        {cases.length === 0 ? (
          <EmptyState mark="✓" title="Nenhum caso aberto" description="Detecções automáticas, denúncias de usuários e sinalizações da equipe aparecem aqui." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Gravidade</th>
                  <th scope="col">Motivo</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Detalhe</th>
                  <th scope="col">Aberto em</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Badge tone={c.severity === "CRITICAL" || c.severity === "HIGH" ? "shu" : "default"}>
                        {c.severity}
                      </Badge>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.reason}</td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {c.targetType}
                      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-ink-faint)" }}>
                        {c.targetId.slice(0, 14)}…
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>{c.source}</td>
                    <td style={{ fontSize: "0.8rem", maxWidth: "24rem" }}>{c.detail ?? "—"}</td>
                    <td className="t-mono" style={{ fontSize: "0.75rem" }}>{c.createdAt.toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label={`${reports.length} denúncia(s)`} title="Direitos autorais" />
        {reports.length === 0 ? (
          <EmptyState mark="✓" title="Nenhuma denúncia pendente" description="Denúncias de titulares de direitos entram nesta fila com prazo de 2 dias úteis para acuse e 10 para decisão." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Recebida</th>
                  <th scope="col">Denunciante</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">Obra reivindicada</th>
                  <th scope="col">Boa-fé</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const ageDays = Math.floor((Date.now() - r.createdAt.getTime()) / 86_400_000);
                  return (
                    <tr key={r.id}>
                      <td className="t-mono" style={{ fontSize: "0.75rem" }}>
                        {r.createdAt.toLocaleDateString("pt-BR")}
                        {ageDays > 8 ? (
                          <span style={{ display: "block", color: "var(--color-shu)", fontWeight: 700 }}>
                            {ageDays}d — prazo
                          </span>
                        ) : null}
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>{r.reporterOrg ?? r.reporterEmail}</td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {r.targetType}
                        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-ink-faint)" }}>
                          {r.targetId.slice(0, 14)}…
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem", maxWidth: "20rem" }}>{r.claimedWork}</td>
                      <td>
                        <Badge tone={r.goodFaithStatement ? "default" : "shu"}>
                          {r.goodFaithStatement ? "declarada" : "ausente"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
