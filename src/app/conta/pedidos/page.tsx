import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { Label, SectionHead, EmptyState, Badge, MoneyText } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Meus pedidos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/pedidos");

  const orders = await db.order.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { titleSnapshot: true, quantity: true } } },
  });

  return (
    <div>
      <Label>Histórico</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Meus pedidos</h1>

      <div style={{ marginTop: "2rem" }}>
        {orders.length === 0 ? (
          <EmptyState
            mark="◇"
            title="Nenhum pedido ainda"
            description="Quando você fizer o primeiro, ele aparece aqui com todo o acompanhamento da produção — inclusive as fotos do ateliê."
            action={<Link href="/loja" className="btn btn-primary">Ver a loja</Link>}
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Seus pedidos, do mais recente ao mais antigo</caption>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Itens</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/pedido/${o.reference}`} className="t-mono link" style={{ fontWeight: 700 }}>
                        {o.reference}
                      </Link>
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--color-ink-faint)" }}>
                        {o.createdAt.toLocaleDateString("pt-BR")}
                      </span>
                    </td>
                    <td>
                      {o.items.map((i, idx) => (
                        <span key={idx} style={{ display: "block", fontSize: "0.85rem" }}>
                          {i.quantity}× {i.titleSnapshot}
                        </span>
                      ))}
                    </td>
                    <td><Badge>{ORDER_STATUS_LABELS[o.status as OrderStatus].pt}</Badge></td>
                    <td className="num"><MoneyText cents={o.totalCents} currency={o.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
