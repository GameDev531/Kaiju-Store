import type { Metadata } from "next";
import Link from "next/link";
import { getPublicTracking } from "@/server/domain/orders";
import { Breadcrumbs, Label, Badge, Notice, EmptyState } from "@/components/ui";
import { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS, type OrderStatus, type ShipmentStatus } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Rastrear pedido",
  description: "Acompanhe a produção e o envio do seu pedido KAIJU pelo código de referência.",
  alternates: { canonical: "/rastrear" },
};
export const dynamic = "force-dynamic";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const code = codigo?.trim().toUpperCase().slice(0, 20);

  /**
   * Public tracking returns production and shipping status only — never a name,
   * address, price, or the design itself. The reference is unguessable, but it
   * is still shared over messaging apps, so it must not be a key to personal data.
   */
  const order = code ? await getPublicTracking(code) : null;

  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Rastrear pedido" }]} />
      <Label>Acompanhamento público</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Rastrear pedido</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Informe o código que começa com <span className="t-mono">KJ-</span>. Esta página mostra o
        andamento da produção e do envio — nada de dados pessoais.
      </p>

      <form method="get" action="/rastrear" style={{ display: "flex", gap: "0.75rem", marginTop: "2rem", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 240px" }}>
          <label className="field-label" htmlFor="codigo">Código do pedido</label>
          <input
            id="codigo"
            name="codigo"
            className="input t-mono"
            placeholder="KJ-XXXX-XXXX"
            defaultValue={code ?? ""}
            maxLength={20}
            style={{ textTransform: "uppercase" }}
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }}>Rastrear</button>
      </form>

      <div style={{ marginTop: "2.5rem" }}>
        {code && !order ? (
          <EmptyState
            mark="?"
            title="Nenhum pedido com este código"
            description="Confira se digitou certo — o código tem o formato KJ-XXXX-XXXX e vem no seu e-mail de confirmação. Se você tem conta, seus pedidos também estão listados lá."
            action={<Link href="/conta/pedidos" className="btn btn-outline">Ver meus pedidos</Link>}
          />
        ) : null}

        {order ? (
          <div className="panel" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <p className="t-mono" style={{ fontWeight: 700, fontSize: "1.05rem" }}>{order.reference}</p>
              <Badge tone="ink">{ORDER_STATUS_LABELS[order.status as OrderStatus].pt}</Badge>
            </div>
            <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem" }}>
              {ORDER_STATUS_LABELS[order.status as OrderStatus].customerHint}
            </p>

            {order.shipments.map((s, i) => (
              <div key={i} style={{ marginTop: "1.5rem", borderTop: "1px solid var(--color-rule)", paddingTop: "1.25rem" }}>
                <Label>Envio</Label>
                <p style={{ fontWeight: 600, marginTop: "0.4rem" }}>
                  {SHIPMENT_STATUS_LABELS[s.status as ShipmentStatus]}
                </p>
                {s.trackingCode ? (
                  <p className="t-mono" style={{ fontSize: "0.9rem", marginTop: "0.3rem" }}>{s.trackingCode}</p>
                ) : null}
                {s.events.length > 0 ? (
                  <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.5rem" }}>
                    {s.events.map((e, j) => (
                      <li key={j} style={{ fontSize: "0.85rem" }}>
                        <span className="t-mono" style={{ color: "var(--color-ink-faint)" }}>
                          {e.occurredAt.toLocaleDateString("pt-BR")}
                        </span>{" "}
                        {e.description}
                        {e.location ? <span style={{ color: "var(--color-ink-faint)" }}> · {e.location}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}

            <div style={{ marginTop: "1.5rem" }}>
              <Notice tone="info" title="Precisa de mais detalhe?">
                Fotos da produção, ficha técnica aprovada e valores ficam na sua conta, protegidos por login.{" "}
                <Link href={`/pedido/${order.reference}`} className="link">Abrir o pedido completo</Link>
              </Notice>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
