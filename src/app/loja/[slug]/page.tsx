import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, getOrCreateAnonId, csrfToken } from "@/server/auth/session";
import { recordInteraction, similarTo } from "@/server/domain/recommender";
import { Breadcrumbs, MediaFrame, MoneyText, Badge, Notice, SectionHead, Label } from "@/components/ui";
import { CATEGORY_LABELS, RIGHTS_LABELS, type ProductCategory, type MediaKind } from "@/server/domain/enums";
import { AddToCartForm } from "@/components/cart/forms";
import { addToCartAction } from "@/app/sacola/actions";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function loadProduct(slug: string) {
  return db.product.findFirst({
    where: { slug, published: true, deletedAt: null },
    include: {
      media: { orderBy: { position: "asc" } },
      variants: { where: { active: true }, orderBy: { sku: "asc" } },
      collections: { include: { collection: true } },
      tags: true,
      creatorStore: { select: { slug: true, name: true } },
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { displayName: true } } },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Peça não encontrada" };
  return {
    title: product.name,
    description: product.subtitle ?? product.description.slice(0, 155),
    alternates: { canonical: `/loja/${product.slug}` },
    openGraph: {
      type: "website",
      title: `${product.name} · ${SITE.name}`,
      description: product.subtitle ?? product.description.slice(0, 155),
      url: `${SITE.url}/loja/${product.slug}`,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const auth = await getAuth();
  const anonId = auth ? null : await getOrCreateAnonId();
  await recordInteraction({ kind: "VIEW", userId: auth?.user.id ?? null, anonId, productId: product.id });

  const cartCsrf = await csrfToken("cart.add");
  const similar = await similarTo(product.id, 4);
  const similarProducts = similar.length
    ? await db.product.findMany({
        where: { id: { in: similar.map((s) => s.productId) } },
        include: { media: { orderBy: { position: "asc" }, take: 1 } },
      })
    : [];
  const similarReason = new Map(similar.map((s) => [s.productId, s.reason]));

  const rights = RIGHTS_LABELS[product.rightsBasis as keyof typeof RIGHTS_LABELS];
  const inStock = product.variants.some((v) => v.stockOnHand - v.stockReserved > 0);
  const madeToOrder = product.fulfilment === "MADE_TO_ORDER";

  /**
   * Structured data carries only facts we hold. `aggregateRating` is emitted
   * ONLY when real published reviews exist — fabricating one is both a lie to
   * customers and a search-spam violation.
   */
  const hasRealRatings = product.ratingCount > 0;
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: CATEGORY_LABELS[product.category as ProductCategory] ?? product.category,
    brand: { "@type": "Brand", name: SITE.name },
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency,
      price: (product.basePriceCents / 100).toFixed(2),
      availability: madeToOrder
        ? "https://schema.org/PreOrder"
        : inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `${SITE.url}/loja/${product.slug}`,
      ...(madeToOrder
        ? {
            deliveryLeadTime: {
              "@type": "QuantitativeValue",
              minValue: product.productionDaysMin,
              maxValue: product.productionDaysMax,
              unitCode: "DAY",
            },
          }
        : {}),
    },
  };
  if (hasRealRatings) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: (product.ratingSum / product.ratingCount).toFixed(1),
      reviewCount: product.ratingCount,
    };
  }

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[
          { href: "/", label: "Início" },
          { href: "/loja", label: "Loja" },
          { href: `/loja?categoria=${product.category}`, label: CATEGORY_LABELS[product.category as ProductCategory] ?? product.category },
          { label: product.name },
        ]}
      />

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)", marginTop: "1.5rem" }}>
        {/* ---- media: front, back, detail, fabric ---- */}
        <div>
          <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: product.media.length > 1 ? "repeat(2, 1fr)" : "1fr" }}>
            {(product.media.length > 0
              ? product.media
              : [{ id: "ph", url: "", alt: product.name, kind: "TECHNICAL_DRAWING", view: "FRONT" }]
            ).map((m) => (
              <figure key={m.id} style={{ margin: 0 }}>
                <MediaFrame kind={m.kind as MediaKind} alt={m.alt} src={m.url || null} />
                <figcaption className="t-label" style={{ marginTop: "0.4rem" }}>
                  {viewLabel(m.view)}
                </figcaption>
              </figure>
            ))}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <Notice tone="info" title="Sobre as imagens desta página">
              Cada imagem é rotulada pelo que ela é: foto de estúdio, desenho técnico ou conceito.
              Nunca apresentamos um render como foto de uma peça física — se a peça ainda não foi
              fotografada, você vê o desenho técnico, não uma simulação.
            </Notice>
          </div>
        </div>

        {/* ---- buy column ---- */}
        <div>
          {product.creatorStore ? (
            <Link href={`/criadores/${product.creatorStore.slug}`} className="link" style={{ fontSize: "0.875rem" }}>
              Loja de {product.creatorStore.name}
            </Link>
          ) : null}

          <h1 className="t-display-sm" style={{ marginTop: "0.5rem" }}>{product.name}</h1>
          {product.subtitle ? (
            <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem", fontSize: "1.02rem" }}>{product.subtitle}</p>
          ) : null}

          <p style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: "1.25rem" }}>
            <MoneyText cents={product.basePriceCents} currency={product.currency} />
          </p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.85rem" }}>
            <Badge tone="ink">{madeToOrder ? "Sob encomenda" : inStock ? "Pronta-entrega" : "Esgotado"}</Badge>
            <Badge tone="blueprint">{rights?.label ?? product.rightsBasis}</Badge>
            <Badge>Complexidade {product.complexity}/5</Badge>
          </div>

          {madeToOrder ? (
            <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>
              Produção de <strong>{product.productionDaysMin} a {product.productionDaysMax} dias</strong>, mais o
              envio. Cortada depois do pedido — nada fica parado em estoque.
            </p>
          ) : null}

          <div style={{ marginTop: "1.75rem" }}>
            <AddToCartForm
              action={addToCartAction}
              csrf={cartCsrf}
              productId={product.id}
              madeToOrder={madeToOrder}
              variants={product.variants.map((v) => ({
                id: v.id,
                size: v.size,
                colorway: v.colorway,
                // Disponibilidade lida agora. A sacola não vai segurar nada disto.
                available: Math.max(0, v.stockOnHand - v.stockReserved),
              }))}
            />
            <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
              A sacola não reserva estoque. As unidades só ficam separadas para você durante o
              pagamento, e por uma janela curta — é o que impede alguém de esvaziar o catálogo
              sem comprar nada.
            </p>
          </div>

          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
            <Link href={`/criar?base=${product.slug}`} className="btn btn-outline btn-block">
              Personalizar nas minhas medidas
            </Link>
            <Link href="/como-funciona" className="btn btn-quiet btn-block">
              Como a produção funciona
            </Link>
          </div>

          <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "1.75rem" }}>
            <Label>Direitos e origem</Label>
            <p style={{ fontSize: "0.875rem", marginTop: "0.5rem", lineHeight: 1.55 }}>
              {rights?.explanation ?? "Origem de direitos registrada na ficha desta peça."}
              {product.licensor ? ` Licenciante: ${product.licensor}.` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ---- description ---- */}
      <section style={{ marginTop: "4rem" }}>
        <SectionHead label="Ficha da peça" title="Descrição e construção" />
        <div style={{ display: "grid", gap: "2.5rem", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
          <p style={{ lineHeight: 1.7, fontSize: "1.02rem", color: "var(--color-ink-soft)" }}>{product.description}</p>
          <dl style={{ margin: 0 }}>
            {[
              ["Tipo", product.garmentType],
              ["Categoria", CATEGORY_LABELS[product.category as ProductCategory] ?? product.category],
              ["Modelagem", product.cutProfile === "UNISEX" ? "Unissex" : product.cutProfile === "FEM_CUT" ? "Corte feminino" : "Corte masculino"],
              ["Produção", madeToOrder ? `${product.productionDaysMin}–${product.productionDaysMax} dias` : "Pronta-entrega"],
              ["Complexidade", `${product.complexity}/5`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.6rem 0", borderBottom: "1px solid var(--color-rule)" }}>
                <dt className="t-label">{k}</dt>
                <dd style={{ margin: 0, fontSize: "0.9rem", fontWeight: 550, textAlign: "right" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- reviews: only real ones ---- */}
      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="Quem comprou" title="Avaliações" />
        {product.reviews.length === 0 ? (
          <div className="panel-sunk" style={{ padding: "1.5rem" }}>
            <p style={{ fontWeight: 600 }}>Esta peça ainda não tem avaliações.</p>
            <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem", fontSize: "0.9rem", maxWidth: "62ch" }}>
              Só publicamos avaliações de pedidos efetivamente entregues, ligadas a uma compra verificada.
              Enquanto não houver nenhuma, esta área fica vazia — não vamos preencher com texto inventado
              nem com estrelas de lugar nenhum.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
            {product.reviews.map((r) => (
              <li key={r.id} className="panel" style={{ padding: "1.15rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span className="t-mono" aria-label={`Nota ${r.rating} de 5`}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </span>
                  <Badge>Compra verificada</Badge>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
                    {r.user.displayName} · {r.createdAt.toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.title ? <p style={{ fontWeight: 650, marginTop: "0.6rem" }}>{r.title}</p> : null}
                {r.body ? <p style={{ marginTop: "0.35rem", color: "var(--color-ink-soft)" }}>{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- similar ---- */}
      {similarProducts.length > 0 ? (
        <section style={{ marginTop: "3.5rem" }}>
          <SectionHead label="Da mesma linha" title="Peças parecidas" />
          <div className="grid-products">
            {similarProducts.map((p) => (
              <Link key={p.id} href={`/loja/${p.slug}`} className="product-card">
                <MediaFrame kind={(p.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"} alt={p.media[0]?.alt ?? p.name} src={p.media[0]?.url || null} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{p.name}</p>
                  <p style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}><MoneyText cents={p.basePriceCents} /></p>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                    {similarReason.get(p.id)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mobile-cta">
        <Link href={`/criar?base=${product.slug}`} className="btn btn-primary btn-block">Personalizar nas minhas medidas</Link>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
    </div>
  );
}

function viewLabel(view: string): string {
  const map: Record<string, string> = {
    FRONT: "Frente", BACK: "Costas", SIDE: "Lateral", DETAIL: "Detalhe", FABRIC: "Tecido",
  };
  return map[view] ?? view;
}
