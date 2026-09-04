import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { resolveCart, getCartView, MAX_LINE_QUANTITY } from "@/server/domain/cart";
import { CartLineControls, ClearCartForm } from "@/components/cart/forms";
import { updateCartLineAction, removeCartLineAction, clearCartAction } from "./actions";
import { Breadcrumbs, Label, SectionHead, Badge, Notice, EmptyState, MoneyText, MediaFrame } from "@/components/ui";

export const metadata: Metadata = {
  title: "Minha sacola",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const auth = await getAuth();
  const cartId = await resolveCart(auth?.user.id ?? null);

  const seller = auth
    ? await db.sellerAccount.findFirst({
        where: { userId: auth.user.id, status: "APPROVED" },
        select: { discountBp: true },
      })
    : null;

  const [cart, csrfUpdate, csrfRemove, csrfClear] = await Promise.all([
    getCartView(cartId, seller?.discountBp ?? 0),
    csrfToken("cart.update"),
    csrfToken("cart.remove"),
    csrfToken("cart.clear"),
  ]);

  // Imagens buscadas à parte para manter a leitura da sacola barata.
  const media = cart.lines.length
    ? await db.productMedia.findMany({
        where: { productId: { in: cart.lines.map((l) => l.productId) } },
        orderBy: { position: "asc" },
      })
    : [];
  const mediaByProduct = new Map<string, (typeof media)[number]>();
  for (const item of media) if (!mediaByProduct.has(item.productId)) mediaByProduct.set(item.productId, item);

  const blocked = cart.lines.filter((l) => l.availabilityWarning !== undefined);

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Sacola" }]} />

      <header style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>{cart.itemCount === 0 ? "Vazia" : `${cart.itemCount} peça(s)`}</Label>
          <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Minha sacola</h1>
        </div>
        {cart.lines.length > 0 ? <ClearCartForm action={clearCartAction} csrf={csrfClear} /> : null}
      </header>

      {/*
        A promessa central, dita onde importa: a sacola não segura estoque.
        Isso é honestidade e é também a explicação de por que ela expira.
      */}
      {cart.lines.length > 0 ? (
        <div style={{ marginTop: "1.75rem", maxWidth: "72ch" }}>
          <Notice tone="info" title="Sua sacola não reserva estoque">
            Nada aqui está separado para você. Reservamos as peças só quando você finaliza o pedido,
            e por uma janela curta. É o que impede alguém de travar o catálogo inteiro enchendo uma
            sacola e sumindo — e é por isso que esta sacola tem prazo de validade.
          </Notice>
        </div>
      ) : null}

      {cart.notices.map((notice) => (
        <div key={notice.code} style={{ marginTop: "1rem", maxWidth: "72ch" }}>
          <Notice tone={notice.code === "ITEM_UNAVAILABLE" ? "attention" : "info"} title={notice.message}>
            {notice.action}
          </Notice>
        </div>
      ))}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 0.7fr)", marginTop: "2.5rem" }}>
        <section>
          {cart.lines.length === 0 ? (
            <EmptyState
              mark="◇"
              title="Sua sacola está vazia"
              description="Nada guardado aqui, e nada reservado no estoque. Comece pela loja, ou descreva a peça que você não encontrou em lugar nenhum."
              action={
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
                  <Link href="/loja" className="btn btn-primary">Ver a loja</Link>
                  <Link href="/criar" className="btn btn-outline">Criar minha peça</Link>
                </div>
              }
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1.25rem" }}>
              {cart.lines.map((line) => {
                const image = mediaByProduct.get(line.productId);
                return (
                  <li key={line.id} className="panel" style={{ padding: "1.15rem", display: "grid", gridTemplateColumns: "88px 1fr", gap: "1.15rem" }}>
                    <Link href={`/loja/${line.slug}`} style={{ display: "block" }}>
                      <MediaFrame
                        kind={(image?.kind as "TECHNICAL_DRAWING") ?? "TECHNICAL_DRAWING"}
                        alt={image?.alt ?? line.name}
                        src={image?.url || null}
                        aspect="3 / 4"
                      />
                    </Link>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <Link href={`/loja/${line.slug}`} style={{ fontWeight: 650, textDecoration: "none", fontSize: "1rem" }}>
                            {line.name}
                          </Link>
                          <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>
                            {line.size} · {line.colorway}
                          </p>
                          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                            <Badge>{line.madeToOrder ? "Sob encomenda" : "Pronta-entrega"}</Badge>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontWeight: 700 }}>
                            <MoneyText cents={line.totalPriceCents} currency={line.currency} />
                          </p>
                          {line.quantity > 1 ? (
                            <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)" }}>
                              <MoneyText cents={line.unitPriceCents} currency={line.currency} /> cada
                            </p>
                          ) : null}
                          {line.priceChangedFromCents !== undefined ? (
                            <p style={{ fontSize: "0.78rem", color: "var(--color-shu)", marginTop: "0.25rem" }}>
                              Antes: <MoneyText cents={line.priceChangedFromCents} currency={line.currency} />
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {line.availabilityWarning ? (
                        <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--color-uncertain)", fontWeight: 600, display: "flex", gap: "0.4rem" }}>
                          <span aria-hidden="true">▲</span>
                          {line.availabilityWarning}
                        </p>
                      ) : null}

                      <div style={{ marginTop: "0.9rem" }}>
                        <CartLineControls
                          updateAction={updateCartLineAction}
                          removeAction={removeCartLineAction}
                          csrfUpdate={csrfUpdate}
                          csrfRemove={csrfRemove}
                          lineId={line.id}
                          quantity={line.quantity}
                          maxQuantity={line.madeToOrder ? MAX_LINE_QUANTITY : Math.min(MAX_LINE_QUANTITY, line.availableNow)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {cart.lines.length > 0 ? (
          <aside>
            <SectionHead label="Resumo" title="Total" />
            <div className="panel corner-ticks" style={{ padding: "1.35rem" }}>
              <dl style={{ margin: 0, display: "grid", gap: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
                  <dt style={{ color: "var(--color-ink-soft)" }}>Subtotal</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    <MoneyText cents={cart.subtotalCents} currency={cart.currency} />
                  </dd>
                </div>
                {seller ? (
                  <p style={{ fontSize: "0.8rem", color: "var(--color-observed)", fontWeight: 600 }}>
                    Preço de revenda aplicado.
                  </p>
                ) : null}
                <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.55 }}>
                  Frete e prazo são calculados no próximo passo, a partir do seu CEP. Sem taxa
                  escondida depois disso.
                </p>
              </dl>

              {blocked.length > 0 ? (
                <div style={{ marginTop: "1.15rem" }}>
                  <Notice tone="blocking" title="Ajuste a quantidade para continuar">
                    {blocked.length === 1
                      ? "Uma peça tem menos unidades disponíveis do que a quantidade na sua sacola."
                      : `${blocked.length} peças têm menos unidades disponíveis do que a quantidade na sua sacola.`}
                  </Notice>
                </div>
              ) : (
                <Link href="/checkout" className="btn btn-primary btn-block" style={{ marginTop: "1.25rem" }}>
                  Finalizar pedido
                </Link>
              )}

              <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.85rem", lineHeight: 1.5 }}>
                Esta sacola expira em{" "}
                {Math.max(1, Math.ceil((cart.expiresAt.getTime() - Date.now()) / 86_400_000))} dia(s).
                Como nada está reservado, você não perde nenhuma peça por isso — só a lista.
              </p>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <Link href="/loja" className="btn btn-quiet btn-block">Continuar comprando</Link>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
