import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { env } from "@/server/lib/env";
import { getAuth } from "@/server/auth/session";
import { Breadcrumbs, Label, Notice, MoneyText } from "@/components/ui";

export const metadata: Metadata = { title: "Simulação de pagamento", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Development-only payment simulator.
 *
 * The mock provider redirects here instead of to a real gateway. It exists so
 * the post-payment half of the flow — webhook, producer dispatch, production —
 * can be exercised locally without a gateway contract.
 *
 * It renders the command to send a *properly signed* webhook rather than
 * offering a button that marks the order paid. A button would bypass the exact
 * mechanism this page exists to test, and would be a catastrophic thing to
 * accidentally ship enabled.
 */
export default async function PaymentSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; order?: string }>;
}) {
  // Hard gate: never reachable in a deployed environment.
  if (env.APP_ENV === "production" || env.APP_ENV === "staging") notFound();

  const { ref, order: orderRef } = await searchParams;
  const auth = await getAuth();
  if (!auth || !ref) notFound();

  const payment = await db.payment.findFirst({
    where: { providerRef: ref, order: { userId: auth.user.id } },
    include: { order: { select: { reference: true, totalCents: true, currency: true, status: true } } },
  });
  if (!payment) notFound();

  const body = JSON.stringify({
    id: `evt_sim_${Date.now()}`,
    type: "payment.captured",
    data: { payment_ref: payment.providerRef, amount_cents: payment.amountCents, brand: "visa", last4: "4242" },
  });

  const command = [
    `BODY='${body}'`,
    `TS=$(date +%s)`,
    `SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$PAYMENT_WEBHOOK_SECRET" -r | cut -d' ' -f1)`,
    `curl -s -X POST http://localhost:3000/api/webhooks/payments \\`,
    `  -H "content-type: application/json" \\`,
    `  -H "x-kaiju-timestamp: $TS" \\`,
    `  -H "x-kaiju-signature: $SIG" \\`,
    `  -d "$BODY"`,
  ].join("\n");

  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Simulação de pagamento" }]} />
      <Label>Ambiente de desenvolvimento</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Simulação de pagamento</h1>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="attention" title="Esta página não existe em produção">
          Ela é servida apenas quando <span className="t-mono">APP_ENV</span> é
          {" "}<span className="t-mono">development</span> ou <span className="t-mono">test</span>.
          Nenhum dinheiro se move aqui.
        </Notice>
      </div>

      <div className="panel" style={{ padding: "1.5rem", marginTop: "1.75rem" }}>
        <Label>Pedido</Label>
        <p className="t-mono" style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: "0.4rem" }}>
          {payment.order.reference}
        </p>
        <p style={{ marginTop: "0.5rem" }}>
          <MoneyText cents={payment.amountCents} currency={payment.currency} /> · {payment.method} ·{" "}
          estado atual: {payment.order.status}
        </p>
        <p className="t-mono" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.5rem" }}>
          {payment.providerRef}
        </p>
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <Label>Confirmar o pagamento</Label>
        <p style={{ marginTop: "0.6rem", color: "var(--color-ink-soft)", lineHeight: 1.7 }}>
          Não há botão aqui de propósito. Um botão que marcasse o pedido como pago passaria por cima
          da verificação de assinatura — exatamente o mecanismo que esta simulação existe para
          exercitar. Em vez disso, envie um webhook assinado de verdade:
        </p>
        <pre
          className="panel-sunk t-mono"
          style={{ padding: "1.15rem", marginTop: "1rem", overflowX: "auto", fontSize: "0.72rem", lineHeight: 1.6, whiteSpace: "pre" }}
        >
          {command}
        </pre>
        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.85rem", lineHeight: 1.6 }}>
          Rode no terminal do projeto, com <span className="t-mono">PAYMENT_WEBHOOK_SECRET</span> exportado
          a partir do seu <span className="t-mono">.env</span>. Depois recarregue o pedido: ele passa a
          PAGO e o despacho para ateliês entra na fila. Lembre de rodar{" "}
          <span className="t-mono">npm run worker</span> para processá-la.
        </p>
      </section>

      <div style={{ display: "flex", gap: "0.85rem", marginTop: "2.5rem", flexWrap: "wrap" }}>
        <Link href={`/pedido/${payment.order.reference}`} className="btn btn-primary">Ver o pedido</Link>
        <Link href="/conta/pedidos" className="btn btn-quiet">Meus pedidos</Link>
      </div>
    </div>
  );
}
