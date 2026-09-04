import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { env } from "@/server/lib/env";
import { getAuth, csrfToken } from "@/server/auth/session";
import { resolveCart, getCartView } from "@/server/domain/cart";
import { quoteShipping } from "@/server/shipping";
import { CartCheckoutForm } from "@/components/checkout/cart-form";
import { checkoutCartAction } from "./actions";
import { Breadcrumbs, Label, Notice, SectionHead, MoneyText, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Peso estimado por peça, para a cotação de frete. Grosseiro de propósito. */
const GRAMS_OUTERWEAR = 1200;
const GRAMS_DEFAULT = 450;

export default async function CheckoutPage() {
  const auth = await getAuth();
  // Sem conta não há endereço, nem histórico, nem para onde mandar o pedido.
  if (!auth) redirect("/entrar?next=/checkout");

  const cartId = await resolveCart(auth.user.id);

  const seller = await db.sellerAccount.findFirst({
    where: { userId: auth.user.id, status: "APPROVED" },
    select: { discountBp: true },
  });

  const [cart, addresses, csrf] = await Promise.all([
    getCartView(cartId, seller?.discountBp ?? 0),
    db.address.findMany({ where: { userId: auth.user.id, deletedAt: null }, orderBy: { isDefault: "desc" } }),
    csrfToken("checkout.cart"),
  ]);

  if (cart.lines.length === 0) {
    return (
      <div className="wrap-narrow section">
        <Breadcrumbs trail={[{ href: "/", label: "Início" }, { href: "/sacola", label: "Sacola" }, { label: "Finalizar" }]} />
        <div style={{ marginTop: "2rem" }}>
          <EmptyState
            mark="◇"
            title="Não há nada para finalizar"
            description="Sua sacola está vazia. Ela também expira sozinha — se você tinha peças aqui há alguns dias, elas foram liberadas para outras pessoas comprarem."
            action={<Link href="/loja" className="btn btn-primary">Ver a loja</Link>}
          />
        </div>
      </div>
    );
  }

  const defaultAddress = addresses[0];
  const weightGrams = cart.lines.reduce(
    (sum, line) => sum + line.quantity * (line.category === "OUTERWEAR" ? GRAMS_OUTERWEAR : GRAMS_DEFAULT),
    0,
  );

  // Frete cotado ao vivo contra o endereço padrão, para que o total apareça
  // antes do compromisso e não depois dele.
  const shippingOptions = defaultAddress
    ? await quoteShipping({
        originPostalCode: env.SHIP_ORIGIN_POSTAL_CODE,
        destinationPostalCode: defaultAddress.postalCode,
        weightGrams: Math.max(300, weightGrams),
        lengthCm: 35,
        widthCm: 27,
        heightCm: cart.lines.length > 2 ? 16 : 8,
        declaredValueCents: cart.subtotalCents,
      }).catch(() => [])
    : [];

  // Uma linha indisponível trava a finalização aqui em vez de estourar um erro
  // no meio da transação, depois de a pessoa já ter escolhido pagamento.
  const unavailable = cart.lines.filter((l) => l.availabilityWarning !== undefined);
  const blocked =
    unavailable.length > 0
      ? `${unavailable.map((l) => `${l.name} (${l.size})`).join(", ")} — ajuste a quantidade na sacola.`
      : undefined;

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { href: "/sacola", label: "Sacola" }, { label: "Finalizar" }]} />

      <header style={{ marginTop: "1.5rem" }}>
        <Label>{cart.itemCount} peça{cart.itemCount === 1 ? "" : "s"}</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Finalizar pedido</h1>
      </header>

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 420px)", marginTop: "2rem" }}>
        {/* ---- resumo ---- */}
        <section>
          <SectionHead label="Confira" title="O que você está comprando" action={{ href: "/sacola", label: "Editar sacola" }} />
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
            {cart.lines.map((line) => (
              <li key={line.id} className="panel" style={{ padding: "1.1rem", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontWeight: 600 }}>
                    <Link href={`/loja/${line.slug}`} style={{ textDecoration: "none" }}>{line.name}</Link>
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                    {line.size} · {line.colorway} · {line.quantity} un.
                    {line.madeToOrder ? " · sob encomenda" : ""}
                  </p>
                  {line.availabilityWarning ? (
                    <p style={{ fontSize: "0.8125rem", color: "var(--color-shu)", marginTop: "0.35rem" }}>
                      {line.availabilityWarning}
                    </p>
                  ) : null}
                  {line.priceChangedFromCents !== undefined ? (
                    <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.35rem" }}>
                      O preço mudou desde que você adicionou. O valor abaixo é o de hoje.
                    </p>
                  ) : null}
                </div>
                <p style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                  <MoneyText cents={line.totalPriceCents} currency={line.currency} />
                </p>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: "1.75rem" }}>
            <Notice tone="info" title="A partir de agora as peças ficam separadas para você">
              Ao finalizar, as unidades saem do estoque disponível por uma janela curta ligada à
              forma de pagamento — 30 minutos no PIX, 3 dias no boleto. Se o pagamento não vier,
              elas voltam automaticamente para a loja. Nada fica preso indefinidamente.
            </Notice>
          </div>
        </section>

        {/* ---- pagamento ---- */}
        <aside>
          {addresses.length === 0 ? (
            <Notice tone="blocking" title="Você ainda não tem um endereço de entrega">
              Cadastre um endereço para calcularmos o frete e concluir o pedido.{" "}
              <Link href="/conta/enderecos" className="link">Cadastrar endereço</Link>
            </Notice>
          ) : (
            <CartCheckoutForm
              action={checkoutCartAction}
              csrf={csrf}
              addresses={addresses.map((a) => ({
                id: a.id,
                label: `${a.label} — ${a.line1}, ${a.city}/${a.state}`,
              }))}
              shippingOptions={shippingOptions.map((s) => ({
                service: s.service,
                label: s.serviceLabel,
                priceCents: s.priceCents,
                estimatedDays: s.estimatedDays,
              }))}
              itemTotalCents={cart.subtotalCents}
              currency={cart.currency}
              blocked={blocked}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
