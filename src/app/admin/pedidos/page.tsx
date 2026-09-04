import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { requirePermissionContext } from "@/server/auth/session";
import { Label, SectionHead, Badge, EmptyState, MoneyText } from "@/components/ui";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Pedidos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; filtro?: string; busca?: string }>;
}) {
  await requirePermissionContext("admin.order.read");
  const { estado, filtro, busca } = await searchParams;

  const status = estado && (ORDER_STATUSES as readonly string[]).includes(estado) ? (estado as OrderStatus) : undefined;
  const reference = busca?.trim().toUpperCase();

  const orders = await db.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(reference ? { reference: { contains: reference } } : {}),
      ...(filtro === "sem-atelie" ? { jobs: { some: { status: "UNASSIGNED" } } } : {}),
      ...(filtro === "fraude" ? { status: { in: ["ON_HOLD", "DISPUTED"] } } : {}),
    },
    include: {
      user: { select: { email: true, displayName: true } },
      items: { select: { titleSnapshot: true, quantity: true } },
      jobs: { select: { status: true, producerId: true } },
      _count: { select: { disputes: true, refunds: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <Label>Operação</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Pedidos</h1>

      <form method="get" action="/admin/pedidos" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label className="field-label" htmlFor="busca">Referência</label>
          <input id="busca" name="busca" className="input t-mono" defaultValue={busca ?? ""} placeholder="KJ-XXXX-XXXX" />
        </div>
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label className="field-label" htmlFor="estado">Estado</label>
          <select id="estado" name="estado" className="select" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s].pt}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-ink">Filtrar</button>
        {status || busca || filtro ? <Link href="/admin/pedidos" className="btn btn-quiet">Limpar</Link> : null}
      </form>

      <section style={{ marginTop: "2rem" }}>
        <SectionHead label={`${orders.length} pedido(s)`} title="Resultados" />
        {orders.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum pedido com este filtro" description="Ajuste os critérios acima." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Itens</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Produção</th>
                  <th scope="col" className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const unassigned = o.jobs.filter((j) => !j.producerId).length;
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/pedidos/${o.reference}`} className="t-mono link" style={{ fontWeight: 700 }}>
                          {o.reference}
                        </Link>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
                          {o.createdAt.toLocaleDateString("pt-BR")}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {o.user.displayName}
                        <span style={{ display: "block", color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                          {o.user.email}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {o.items.map((i, idx) => <span key={idx} style={{ display: "block" }}>{i.quantity}× {i.titleSnapshot}</span>)}
                      </td>
                      <td><Badge tone={["ON_HOLD", "DISPUTED"].includes(o.status) ? "shu" : "default"}>{ORDER_STATUS_LABELS[o.status as OrderStatus].pt}</Badge></td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {o.jobs.length === 0 ? "—" : `${o.jobs.length - unassigned}/${o.jobs.length} atribuídos`}
                        {unassigned > 0 ? (
                          <span style={{ display: "block", color: "var(--color-shu)", fontWeight: 600 }}>
                            {unassigned} sem ateliê
                          </span>
                        ) : null}
                        {o._count.disputes > 0 ? <Badge tone="shu">disputa</Badge> : null}
                        {o._count.refunds > 0 ? <Badge>reembolso</Badge> : null}
                      </td>
                      <td className="num"><MoneyText cents={o.totalCents} currency={o.currency} /></td>
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
