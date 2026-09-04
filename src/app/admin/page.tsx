import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requirePermissionContext } from "@/server/auth/session";
import { Label, SectionHead, Badge, Notice, MoneyText } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Administração", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  // Server-side permission check. The layout's nav filtering is cosmetic.
  await requirePermissionContext("admin.system.read");

  const [
    ordersByStatus, needsAttention, pendingProducers, openModeration,
    openCopyright, fraudSignals, unassignedJobs, revenue,
  ] = await Promise.all([
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.findMany({
      where: { status: { in: ["ON_HOLD", "DISPUTED", "REQUIRES_PRODUCER_ACTION"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, reference: true, status: true, holdReason: true, updatedAt: true, totalCents: true, currency: true },
    }),
    db.producer.count({ where: { status: "PENDING" } }),
    db.moderationCase.count({ where: { status: "OPEN" } }),
    db.copyrightReport.count({ where: { status: { in: ["RECEIVED", "REVIEWING"] } } }),
    db.fraudSignal.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    db.productionJob.count({ where: { status: "UNASSIGNED" } }),
    db.payment.aggregate({ where: { status: "CAPTURED" }, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);

  const statusCounts = new Map(ordersByStatus.map((r) => [r.status, r._count._all]));
  const totalOrders = ordersByStatus.reduce((s, r) => s + r._count._all, 0);

  const queues = [
    { label: "Ateliês aguardando verificação", count: pendingProducers, href: "/admin/atelies", urgent: pendingProducers > 0 },
    { label: "Casos de moderação abertos", count: openModeration, href: "/admin/moderacao", urgent: openModeration > 0 },
    { label: "Denúncias de direitos autorais", count: openCopyright, href: "/admin/moderacao?tipo=direitos", urgent: openCopyright > 0 },
    { label: "Trabalhos sem ateliê", count: unassignedJobs, href: "/admin/pedidos?filtro=sem-atelie", urgent: unassignedJobs > 0 },
    { label: "Sinais de fraude (7 dias)", count: fraudSignals, href: "/admin/pedidos?filtro=fraude", urgent: fraudSignals > 5 },
  ];

  return (
    <div>
      <Label>Operação</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Visão geral</h1>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Filas" title="O que precisa de decisão humana" />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {queues.map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="panel"
              style={{ padding: "1.15rem", textDecoration: "none", borderColor: q.urgent ? "var(--color-shu)" : undefined }}
            >
              <p className="t-label">{q.label}</p>
              <p className="t-num" style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.35rem", color: q.urgent ? "var(--color-shu)" : "inherit" }}>
                {q.count}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Comercial" title="Números" />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            ["Pedidos totais", String(totalOrders)],
            ["Pagamentos capturados", String(revenue._count._all)],
            ["Valor capturado", null],
            ["Em produção", String(
              (["PRODUCER_ACCEPTED", "MATERIALS_PREPARATION", "CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL"] as OrderStatus[])
                .reduce((s, k) => s + (statusCounts.get(k) ?? 0), 0),
            )],
          ].map(([label, value]) => (
            <div key={label as string} className="panel-sunk" style={{ padding: "1.15rem" }}>
              <p className="t-label">{label as string}</p>
              <p className="t-num" style={{ fontSize: "1.65rem", fontWeight: 700, marginTop: "0.35rem" }}>
                {value ?? <MoneyText cents={revenue._sum.amountCents ?? 0} currency="BRL" />}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Distribuição" title="Pedidos por estado" />
        {totalOrders === 0 ? (
          <p style={{ color: "var(--color-ink-faint)" }}>Nenhum pedido ainda.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Estado</th><th scope="col" className="num">Pedidos</th></tr>
              </thead>
              <tbody>
                {ordersByStatus
                  .sort((a, b) => b._count._all - a._count._all)
                  .map((row) => (
                    <tr key={row.status}>
                      <td>{ORDER_STATUS_LABELS[row.status as OrderStatus]?.pt ?? row.status}</td>
                      <td className="num">{row._count._all}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Atenção" title="Pedidos travados" action={{ href: "/admin/pedidos", label: "Ver todos" }} />
        {needsAttention.length === 0 ? (
          <Notice tone="good" title="Nenhum pedido travado">
            Nada em espera, disputa ou aguardando ação do ateliê no momento.
          </Notice>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Motivo</th>
                  <th scope="col" className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {needsAttention.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/pedidos/${o.reference}`} className="t-mono link">{o.reference}</Link>
                    </td>
                    <td><Badge tone="shu">{ORDER_STATUS_LABELS[o.status as OrderStatus].pt}</Badge></td>
                    <td style={{ fontSize: "0.85rem" }}>{o.holdReason ?? "—"}</td>
                    <td className="num"><MoneyText cents={o.totalCents} currency={o.currency} /></td>
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
