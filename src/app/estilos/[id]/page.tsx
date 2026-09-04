import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, getOrCreateAnonId } from "@/server/auth/session";
import { recordInteraction } from "@/server/domain/recommender";
import { searchCatalog } from "@/server/domain/search";
import { getStyle, STYLE_GROUP_META, styleDisplayLabel, facetLabel } from "@/server/domain/styles";
import { Breadcrumbs, Label, Badge, SectionHead, MediaFrame, MoneyText, EmptyState } from "@/components/ui";
import { type MediaKind } from "@/server/domain/enums";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

/** O grupo de facetas em que se separa a ficha do estilo, na ordem em que se lê. */
const FACET_SECTIONS: { kind: string; label: string }[] = [
  { kind: "FIT", label: "Modelagem" },
  { kind: "PALETTE", label: "Paleta" },
  { kind: "FABRIC", label: "Tecidos" },
  { kind: "MOTIF", label: "Motivos" },
  { kind: "FORMALITY", label: "Ocasião" },
  { kind: "ERA", label: "Época" },
  { kind: "FANDOM_GENRE", label: "Universo" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const style = getStyle(id);
  if (!style) return { title: "Estilo não encontrado" };
  return {
    title: style.label,
    description: style.description,
    alternates: { canonical: `/estilos/${style.id}` },
    openGraph: {
      type: "website",
      title: `${style.label} · ${SITE.name}`,
      description: style.description,
      url: `${SITE.url}/estilos/${style.id}`,
    },
  };
}

export default async function StylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const style = getStyle(id);
  if (!style) notFound();

  const auth = await getAuth();
  const anonId = auth ? null : await getOrCreateAnonId();
  // Abrir a página de um estilo é um sinal de gosto tão explícito quanto buscar por ele.
  await recordInteraction({ kind: "SEARCH", userId: auth?.user.id ?? null, anonId, query: style.label });

  const result = await searchCatalog({
    styleIds: [style.id],
    userId: auth?.user.id ?? null,
    anonId,
    limit: PAGE_SIZE,
  });

  const products = result.items.length
    ? await db.product.findMany({
        where: { id: { in: result.items.map((i) => i.productId) } },
        include: { media: { orderBy: { position: "asc" }, take: 1 } },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered = result.items.map((i) => byId.get(i.productId)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  const related = style.related.map((rid) => getStyle(rid)).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const sections = FACET_SECTIONS.map((section) => ({
    ...section,
    values: style.facets.filter((f) => f.startsWith(`${section.kind}:`)).map((f) => facetLabel(f)),
  })).filter((s) => s.values.length > 0);

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[{ href: "/", label: "Início" }, { href: "/estilos", label: "Estilos" }, { label: style.label }]}
      />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>
          {STYLE_GROUP_META[style.group].label} · {style.family}
        </Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{style.label}</h1>
        <p className="t-lede" style={{ marginTop: "0.85rem" }}>{style.description}</p>
        {/* O grupo classifica a modelagem habitual da peça, não quem pode vesti-la. */}
        <p style={{ marginTop: "0.85rem", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
          {STYLE_GROUP_META[style.group].blurb}
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <Link href={`/loja?estilo=${style.id}`} className="btn btn-ink">Ver peças deste estilo</Link>
          <Link href={`/criar?estilo=${style.id}`} className="btn btn-outline">Criar uma peça assim</Link>
        </div>
      </header>

      {sections.length > 0 ? (
        <section style={{ marginTop: "3rem" }} aria-labelledby="ficha">
          <h2 id="ficha" className="t-title">O que define</h2>
          <div style={{ display: "grid", gap: "1.25rem", marginTop: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {sections.map((section) => (
              <div key={section.kind} className="panel" style={{ padding: "1.1rem" }}>
                <Label>{section.label}</Label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.7rem" }}>
                  {section.values.map((value) => (
                    <Badge key={value}>{value}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "var(--color-ink-faint)", maxWidth: "62ch" }}>
            Estas são as dimensões que o algoritmo usa para relacionar estilos. Duas estéticas
            podem dividir a paleta sem dividir a modelagem — é essa sobreposição parcial que
            define o que aparece em “costuma andar junto”.
          </p>
        </section>
      ) : null}

      <section style={{ marginTop: "3.5rem" }} aria-labelledby="pecas">
        <h2 id="pecas" className="t-title">
          {result.total > 0 ? `${result.total} peça${result.total === 1 ? "" : "s"} em ${style.label}` : `Peças em ${style.label}`}
        </h2>

        {ordered.length === 0 ? (
          <div style={{ marginTop: "1.5rem" }}>
            <EmptyState
              mark="◇"
              title="Ainda não há peça pronta neste estilo"
              description="O catálogo do ateliê cresce peça a peça, e este recorte ainda não entrou. O caminho sob medida, porém, já entende este estilo inteiro."
              action={<Link href={`/criar?estilo=${style.id}`} className="btn btn-primary">Criar em {style.label}</Link>}
            />
          </div>
        ) : (
          <>
            <div className="grid-products" style={{ marginTop: "1.75rem" }}>
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
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {result.total > ordered.length ? (
              <div style={{ marginTop: "2rem" }}>
                <Link href={`/loja?estilo=${style.id}`} className="btn btn-outline">
                  Ver todas as {result.total} peças
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>

      {related.length > 0 ? (
        <section style={{ marginTop: "4rem" }}>
          <SectionHead label="Vizinhança" title="Costuma andar junto" action={{ href: "/estilos", label: "Todos os estilos" }} />
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {related.map((other) => (
              <Link key={other.id} href={`/estilos/${other.id}`} className="panel" style={{ padding: "1.1rem", textDecoration: "none" }}>
                <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{styleDisplayLabel(other)}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--color-ink-faint)", marginTop: "0.35rem", lineHeight: 1.5 }}>
                  {other.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: "3.5rem" }}>
        <Label>Como a busca entende este estilo</Label>
        {/* Mostrar os sinônimos é honesto e útil: a pessoa descobre que pode
            digitar do jeito dela, e a página ganha um texto real para indexar. */}
        <p style={{ marginTop: "0.6rem", maxWidth: "62ch", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
          Qualquer um destes termos leva ao mesmo lugar — a busca normaliza acento, plural e
          mistura de idiomas antes de comparar.
        </p>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.9rem" }}>
          {style.aliases.map((alias) => (
            <Link key={alias} href={`/loja?busca=${encodeURIComponent(alias)}`} style={{ textDecoration: "none" }}>
              <Badge tone="blueprint">{alias}</Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
