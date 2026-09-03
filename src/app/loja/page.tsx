import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth, getOrCreateAnonId } from "@/server/auth/session";
import { recordInteraction, recommend } from "@/server/domain/recommender";
import { Breadcrumbs, SectionHead, MediaFrame, MoneyText, EmptyState, Label, Badge } from "@/components/ui";
import { CATEGORY_LABELS, RIGHTS_LABELS, type ProductCategory, type MediaKind } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Loja",
  description:
    "Peças originais do ateliê KAIJU: pronta-entrega e sob encomenda. Anime, streetwear e vestuário técnico com ficha de produção aberta.",
  alternates: { canonical: "/loja" },
  openGraph: { title: "Loja · KAIJU", description: "Peças originais do ateliê KAIJU." },
};

export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; busca?: string }>;
}) {
  const { categoria, busca } = await searchParams;
  const auth = await getAuth();
  const anonId = auth ? null : await getOrCreateAnonId();

  const category = categoria && categoria in CATEGORY_LABELS ? (categoria as ProductCategory) : undefined;
  const query = busca?.trim().slice(0, 80);

  // A search is the strongest explicit taste signal the platform gets, so it is
  // recorded — pseudonymously for signed-out visitors — and feeds the recommender.
  if (query) {
    await recordInteraction({ kind: "SEARCH", userId: auth?.user.id ?? null, anonId, query });
  }

  const products = await db.product.findMany({
    where: {
      published: true,
      deletedAt: null,
      ...(category ? { category } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query } },
              { subtitle: { contains: query } },
              { description: { contains: query } },
              { garmentType: { contains: query } },
            ],
          }
        : {}),
    },
    include: { media: { orderBy: { position: "asc" }, take: 1 }, tags: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const suggestions = query || category ? [] : await recommend({ userId: auth?.user.id ?? null, anonId, limit: 4 });
  const suggestedIds = new Set(suggestions.map((s) => s.productId));
  const reasonById = new Map(suggestions.map((s) => [s.productId, s.reason]));

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Loja" }]} />

      <header style={{ marginTop: "1.5rem" }}>
        <Label>Catálogo do ateliê</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>
          {category ? CATEGORY_LABELS[category] : query ? `Busca: “${query}”` : "Loja"}
        </h1>
        <p className="t-lede" style={{ marginTop: "0.85rem" }}>
          Todas as peças são criação original do estúdio. As marcadas como sob encomenda são cortadas
          depois do seu pedido — por isso o prazo é maior e o desperdício, menor.
        </p>
      </header>

      {/* Search + filters as a plain GET form: works with JS off, indexable, shareable. */}
      <form method="get" action="/loja" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label className="field-label" htmlFor="busca">Buscar</label>
          <input id="busca" name="busca" className="input" defaultValue={query ?? ""} placeholder="jaqueta, kimono, techwear…" maxLength={80} />
        </div>
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label className="field-label" htmlFor="categoria">Categoria</label>
          <select id="categoria" name="categoria" className="select" defaultValue={category ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-ink">Filtrar</button>
        {(query || category) ? <Link href="/loja" className="btn btn-quiet">Limpar</Link> : null}
      </form>

      <p className="t-mono" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "1.25rem" }} role="status" aria-live="polite">
        {products.length} peça{products.length === 1 ? "" : "s"}
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        {products.length === 0 ? (
          <EmptyState
            mark="◇"
            title={query ? "Nada com esse termo" : "Nenhuma peça nesta categoria ainda"}
            description={
              query
                ? "Tente outra palavra, ou descreva a peça no estúdio de criação — talvez ela simplesmente ainda não exista."
                : "Estamos montando esta categoria. Enquanto isso, o caminho sob medida está aberto."
            }
            action={<Link href="/criar" className="btn btn-primary">Criar minha peça</Link>}
          />
        ) : (
          <div className="grid-products">
            {products.map((p) => (
              <Link key={p.id} href={`/loja/${p.slug}`} className="product-card">
                <MediaFrame
                  kind={(p.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                  alt={p.media[0]?.alt ?? p.name}
                  src={p.media[0]?.url || null}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.35 }}>{p.name}</p>
                  {p.subtitle ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>{p.subtitle}</p>
                  ) : null}
                  <p style={{ marginTop: "0.4rem", fontSize: "0.95rem", fontWeight: 600 }}>
                    <MoneyText cents={p.basePriceCents} currency={p.currency} />
                  </p>
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <Badge>{p.fulfilment === "STOCKED" ? "Pronta-entrega" : "Sob encomenda"}</Badge>
                    {suggestedIds.has(p.id) ? <Badge tone="shu">Para você</Badge> : null}
                  </div>
                  {reasonById.get(p.id) ? (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-shu)", marginTop: "0.35rem" }}>
                      {reasonById.get(p.id)}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <section style={{ marginTop: "4rem" }}>
        <SectionHead label="Não encontrou?" title="Então mande fazer" action={{ href: "/criar", label: "Ir para o estúdio" }} />
        <p className="t-lede">
          Todo catálogo é uma aposta sobre o que as pessoas querem. Este aqui erra tanto quanto qualquer
          outro. A diferença é que você pode simplesmente descrever a peça que faltou.
        </p>
      </section>
    </div>
  );
}
