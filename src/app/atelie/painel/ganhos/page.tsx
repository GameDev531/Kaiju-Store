import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { Breadcrumbs, Label, SectionHead, EmptyState, Badge, MoneyText, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Ganhos do ateliê", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EarningsPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/atelie/painel/ganhos");

  const producer = await db.producer.findUnique({ where: { userId: auth.user.id } });
  if (!producer) redirect("/atelie/entrar");

  const [payouts, completed, pending] = await Promise.all([
    db.payout.findMany({
      where: { producerId: producer.id },
      include: { items: true },
      orderBy: { periodEnd: "desc" },
    }),
    db.productionJob.findMany({
      where: { producerId: producer.id, status: "COMPLETED" },
      select: { id: true, reference: true, payoutCents: true, currency: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    db.productionJob.aggregate({
      where: { producerId: producer.id, status: { in: ["ACCEPTED", "IN_PRODUCTION", "QC_PENDING"] } },
      _sum: { payoutCents: true },
    }),
  ]);

  const settled = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.netCents, 0);
  const awaiting = completed.reduce((s, j) => s + j.payoutCents, 0) - settled;

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/atelie/painel", label: "Painel do ateliê" }, { label: "Ganhos" }]} />
      <Label>Financeiro</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Ganhos e repasses</h1>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: "2rem" }}>
        {[
          ["Já recebido", settled],
          ["A receber (entregue)", Math.max(0, awaiting)],
          ["Em produção", pending._sum.payoutCents ?? 0],
        ].map(([label, cents]) => (
          <div key={label as string} className="panel-sunk" style={{ padding: "1.25rem" }}>
            <p className="t-label">{label as string}</p>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.35rem" }}>
              <MoneyText cents={cents as number} currency="BRL" />
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "1.5rem", maxWidth: "70ch" }}>
        <Notice tone="info" title="Como o repasse funciona">
          O valor de cada trabalho é fixado antes de você aceitar e não muda depois. Ele entra no
          fechamento seguinte à aprovação no controle de qualidade. Valores em disputa aberta ficam
          retidos até a análise concluir — e, se a análise apontar erro de execução, a política de
          refação define o que acontece.
        </Notice>
      </div>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Fechamentos" title="Repasses" />
        {payouts.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum repasse ainda" description="O primeiro fechamento acontece após a sua primeira entrega aprovada." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="num">Bruto</th>
                  <th scope="col" className="num">Taxa</th>
                  <th scope="col" className="num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.periodStart.toLocaleDateString("pt-BR")} — {p.periodEnd.toLocaleDateString("pt-BR")}</td>
                    <td><Badge>{p.status}</Badge></td>
                    <td className="num"><MoneyText cents={p.grossCents} currency={p.currency} /></td>
                    <td className="num"><MoneyText cents={p.feeCents} currency={p.currency} /></td>
                    <td className="num"><MoneyText cents={p.netCents} currency={p.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Histórico" title="Trabalhos concluídos" />
        {completed.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum trabalho concluído ainda" description="Seus trabalhos entregues aparecem aqui com o valor de cada um." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Trabalho</th>
                  <th scope="col">Concluído em</th>
                  <th scope="col" className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((j) => (
                  <tr key={j.id}>
                    <td className="t-mono">{j.reference}</td>
                    <td>{j.completedAt?.toLocaleDateString("pt-BR") ?? "—"}</td>
                    <td className="num"><MoneyText cents={j.payoutCents} currency={j.currency} /></td>
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
