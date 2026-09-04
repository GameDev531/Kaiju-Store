import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth, getOrCreateAnonId } from "@/server/auth/session";
import { recordInteraction } from "@/server/domain/recommender";
import { searchCatalog } from "@/server/domain/search";
import { STYLE_GROUPS, STYLE_GROUP_META, getStyle, styleDisplayLabel, stylesByGroup, type StyleGroup } from "@/server/domain/styles";
import { Breadcrumbs, SectionHead, MediaFrame, MoneyText, EmptyState, Label, Badge } from "@/components/ui";
import { CATEGORY_LABELS, type ProductCategory, type MediaKind } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Loja",
  description:
    "Peças originais do ateliê KAIJU em mais de 80 estilos — de quiet luxury a techwear, de cottagecore a anime dark. Pronta-entrega e sob encomenda.",
  alternates: { canonical: "/loja" },
  openGraph: { title: "Loja · KAIJU", description: "Peças originais do ateliê KAIJU." },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; estilo?: string | string[]; categoria?: string; p?: string }>;
}) {
  const params = await searchParams;
  const auth = await getAuth();
  const anonId = auth ? null : await getOrCreateAnonId();

  const query = params.busca?.trim().slice(0, 80);
  const styleIds = (Array.isArray(params.estilo) ? params.estilo : params.estilo ? [params.estilo] : [])
    .filter((id) => getStyle(id) !== undefined)
    .slice(0, 4);
  const category =
    params.categoria && params.categoria in CATEGORY_LABELS ? (params.categoria as ProductCategory) : undefined;
  const page = Math.max(1, Number(params.p ?? 1) || 1);

  // A busca é o sinal de gosto mais explícito que a plataforma recebe.
  if (query) {
    await recordInteraction({ kind: "SEARCH", userId: auth?.user.id ?? null, anonId, query });
  }

  const result = await searchCatalog({
    query,
    styleIds,
    category,
    userId: auth?.user.id ?? null,
    anonId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const products = result.items.length
    ? await db.product.findMany({
        where: { id: { in: result.items.map((i) => i.productId) } },
        include: {
          media: { orderBy: { position: "asc" }, take: 1 },
          styles: { orderBy: { position: "asc" } },
        },
      })
    : [];
  // Preserva a ordem de relevância — o `in` do banco não a garante.
  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered = result.items.map((i) => byId.get(i.productId)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const reasonById = new Map(result.items.map((i) => [i.productId, i.reason]));

  const activeStyles = styleIds.map((id) => getStyle(id)!).filter(Boolean);
  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  const buildHref = (overrides: Record<string, string | string[] | undefined>): string => {
    const next = new URLSearchParams();
    const merged = { busca: query, estilo: styleIds, categoria: category, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (Array.isArray(value)) for (const v of value) next.append(key, v);
      else if (value) next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/loja?${qs}` : "/loja";
  };

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Loja" }]} />

      <header style={{ marginTop: "1.5rem" }}>
        <Label>Catálogo do ateliê</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>
          {activeStyles.length === 1
            ? styleDisplayLabel(activeStyles[0]!)
            : category
              ? CATEGORY_LABELS[category]
              : query
                ? `Busca: “${query}”`
                : "Loja"}
        </h1>
        <p className="t-lede" style={{ marginTop: "0.85rem" }}>
          {activeStyles.length === 1
            ? activeStyles[0]!.description
            : "Busque por estilo, por peça, ou pelo termo que você usaria conversando. Entendemos sinônimo, gíria e as duas línguas."}
        </p>
      </header>

      {/* Busca em GET puro: funciona sem JS, é indexável e o link é compartilhável. */}
      <form method="get" action="/loja" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 280px" }}>
          <label className="field-label" htmlFor="busca">Buscar</label>
          <input
            id="busca"
            name="busca"
            className="input"
            defaultValue={query ?? ""}
            placeholder="techwear, coquette, jaqueta preta, stealth wealth…"
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div className="field" style={{ flex: "0 1 210px" }}>
          <label className="field-label" htmlFor="categoria">Categoria</label>
          <select id="categoria" name="categoria" className="select" defaultValue={category ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        {styleIds.map((id) => <input key={id} type="hidden" name="estilo" value={id} />)}
        <button type="submit" className="btn btn-ink">Buscar</button>
        {query || category || styleIds.length > 0 ? (
          <Link href="/loja" className="btn btn-quiet">Limpar</Link>
        ) : null}
      </form>

      {/* Estilos reconhecidos na frase digitada, como chips clicáveis. */}
      {result.detectedStyles.length > 0 && styleIds.length === 0 ? (
        <div style={{ marginTop: "1.25rem" }}>
          <Label>Entendemos que você procura</Label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            {result.detectedStyles.map((style) => (
              <Link key={style.id} href={buildHref({ estilo: [style.id], busca: undefined })} style={{ textDecoration: "none" }}>
                <Badge tone="shu">{styleDisplayLabel(style)}</Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filtros ativos, cada um removível. */}
      {activeStyles.length > 0 ? (
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="t-label">Filtrando por</span>
          {activeStyles.map((style) => (
            <Link
              key={style.id}
              href={buildHref({ estilo: styleIds.filter((id) => id !== style.id) })}
              style={{ textDecoration: "none" }}
            >
              <Badge tone="ink">{styleDisplayLabel(style)} ✕</Badge>
            </Link>
          ))}
        </div>
      ) : null}

      <p className="t-mono" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "1.25rem" }} role="status" aria-live="polite">
        {result.total} peça{result.total === 1 ? "" : "s"}
        {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
      </p>

      <div style={{ marginTop: "1.5rem" }}>
        {ordered.length === 0 ? (
          <div>
            <EmptyState
              mark="◇"
              title={query ? `Nada encontrado para “${query}”` : "Nenhuma peça neste recorte"}
              description={
                query
                  ? "Talvez a peça que você quer ainda não exista no catálogo. Descreva ela no estúdio — é literalmente para isso que ele serve."
                  : "Estamos montando este recorte. Enquanto isso, o caminho sob medida está aberto."
              }
              action={<Link href="/criar" className="btn btn-primary">Criar minha peça</Link>}
            />
            {/* Zero resultado nunca é um beco: sugere estilos vizinhos. */}
            {result.suggestions.length > 0 ? (
              <div style={{ marginTop: "2rem" }}>
                <Label>Talvez você goste destes estilos</Label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                  {result.suggestions.map((style) => (
                    <Link key={style.id} href={`/estilos/${style.id}`} className="panel" style={{ padding: "0.7rem 1rem", textDecoration: "none" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{styleDisplayLabel(style)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid-products">
            {ordered.map((product) => (
              <Link key={product.id} href={`/loja/${product.slug}`} className="product-card">
                <MediaFrame
                  kind={(product.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                  alt={product.media[0]?.alt ?? product.name}
                  src={product.media[0]?.url || null}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.35 }}>{product.name}</p>
                  {product.subtitle ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>{product.subtitle}</p>
                  ) : null}
                  <p style={{ marginTop: "0.4rem", fontSize: "0.95rem", fontWeight: 600 }}>
                    <MoneyText cents={product.basePriceCents} currency={product.currency} />
                  </p>
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <Badge>{product.fulfilment === "STOCKED" ? "Pronta-entrega" : "Sob encomenda"}</Badge>
                    {product.styles.slice(0, 1).map((link) => {
                      const style = getStyle(link.styleId);
                      return style ? <Badge key={link.id} tone="blueprint">{styleDisplayLabel(style)}</Badge> : null;
                    })}
                  </div>
                  {query || styleIds.length > 0 ? (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-shu)", marginTop: "0.35rem" }}>
                      {reasonById.get(product.id)}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <nav aria-label="Paginação" style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "3rem" }}>
          {page > 1 ? <Link href={buildHref({ p: String(page - 1) })} className="btn btn-outline">Anterior</Link> : null}
          {page < totalPages ? <Link href={buildHref({ p: String(page + 1) })} className="btn btn-outline">Próxima</Link> : null}
        </nav>
      ) : null}

      {/* Navegação por estilo, para quem não sabe o que digitar. */}
      <section style={{ marginTop: "4rem" }}>
        <SectionHead label="Mais de 80 estéticas" title="Navegar por estilo" action={{ href: "/estilos", label: "Ver todos" }} />
        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {STYLE_GROUPS.map((group: StyleGroup) => (
            <div key={group}>
              <Label>{STYLE_GROUP_META[group].label}</Label>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                {stylesByGroup(group).slice(0, 10).map((style) => (
                  <Link key={style.id} href={`/estilos/${style.id}`} style={{ textDecoration: "none" }}>
                    <Badge>{style.label}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
