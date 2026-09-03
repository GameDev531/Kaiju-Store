import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { Breadcrumbs, Label, Badge, MediaFrame, MoneyText, EmptyState, Notice } from "@/components/ui";
import { RIGHTS_LABELS, type MediaKind } from "@/server/domain/enums";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.collection.findFirst({
    where: { slug, published: true },
    include: {
      products: {
        where: { product: { published: true, deletedAt: null } },
        orderBy: { position: "asc" },
        include: { product: { include: { media: { orderBy: { position: "asc" }, take: 1 } } } },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) return { title: "Coleção não encontrada" };
  return {
    title: c.name,
    description: c.description ?? c.tagline ?? `Coleção ${c.name} do ateliê ${SITE.name}.`,
    alternates: { canonical: `/colecoes/${c.slug}` },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await load(slug);
  if (!collection) notFound();

  const rights = RIGHTS_LABELS[collection.rightsBasis as keyof typeof RIGHTS_LABELS];

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[{ href: "/", label: "Início" }, { href: "/colecoes", label: "Coleções" }, { label: collection.name }]}
      />
      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Linha do ateliê</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{collection.name}</h1>
        {collection.tagline ? <p className="t-lede" style={{ marginTop: "0.85rem" }}>{collection.tagline}</p> : null}
        {collection.description ? (
          <p style={{ marginTop: "1rem", color: "var(--color-ink-soft)", lineHeight: 1.7 }}>{collection.description}</p>
        ) : null}
        <div style={{ marginTop: "1.25rem" }}>
          <Badge tone="blueprint">{rights?.label ?? collection.rightsBasis}</Badge>
        </div>
      </header>

      <div style={{ marginTop: "2rem", maxWidth: "70ch" }}>
        <Notice tone="info" title="Origem dos direitos desta linha">
          {rights?.explanation}
          {collection.licensor ? ` Licenciante: ${collection.licensor}.` : ""}
        </Notice>
      </div>

      <div style={{ marginTop: "3rem" }}>
        {collection.products.length === 0 ? (
          <EmptyState mark="◇" title="Linha ainda sem peças publicadas" description="As peças desta coleção entram em breve." action={<Link href="/loja" className="btn btn-outline">Ver a loja</Link>} />
        ) : (
          <div className="grid-products">
            {collection.products.map(({ product }) => (
              <Link key={product.id} href={`/loja/${product.slug}`} className="product-card">
                <MediaFrame
                  kind={(product.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                  alt={product.media[0]?.alt ?? product.name}
                  src={product.media[0]?.url || null}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{product.name}</p>
                  <p style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    <MoneyText cents={product.basePriceCents} currency={product.currency} />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
