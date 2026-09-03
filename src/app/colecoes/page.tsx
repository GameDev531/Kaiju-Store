import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { Breadcrumbs, Label, Badge, EmptyState, MediaFrame } from "@/components/ui";
import { RIGHTS_LABELS, type MediaKind } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Coleções",
  description: "As linhas do ateliê KAIJU: criações originais, sem reprodução de obras de terceiros.",
  alternates: { canonical: "/colecoes" },
};
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await db.collection.findMany({
    where: { published: true },
    orderBy: { position: "asc" },
    include: {
      products: {
        where: { product: { published: true, deletedAt: null } },
        include: { product: { include: { media: { orderBy: { position: "asc" }, take: 1 } } } },
        take: 3,
      },
    },
  });

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Coleções" }]} />
      <Label>Linhas do ateliê</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Coleções</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Cada linha declara a origem dos seus direitos: criação original do estúdio, obra licenciada
        com contrato, ou arte de um criador parceiro. Essa informação é obrigatória em toda peça,
        não um selo decorativo.
      </p>

      {collections.length === 0 ? (
        <div style={{ marginTop: "2.5rem" }}>
          <EmptyState mark="◇" title="Nenhuma coleção publicada ainda" description="As primeiras linhas do ateliê entram em breve." />
        </div>
      ) : (
        <div style={{ display: "grid", gap: "2.5rem", marginTop: "3rem" }}>
          {collections.map((c) => (
            <article key={c.id} className="panel" style={{ padding: "1.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ maxWidth: "52ch" }}>
                  <Badge tone="blueprint">{RIGHTS_LABELS[c.rightsBasis as keyof typeof RIGHTS_LABELS]?.label ?? c.rightsBasis}</Badge>
                  <h2 className="t-title" style={{ marginTop: "0.85rem" }}>
                    <Link href={`/colecoes/${c.slug}`} style={{ textDecoration: "none" }}>{c.name}</Link>
                  </h2>
                  {c.tagline ? <p style={{ color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>{c.tagline}</p> : null}
                  {c.description ? (
                    <p style={{ fontSize: "0.9rem", color: "var(--color-ink-faint)", marginTop: "0.75rem", lineHeight: 1.6 }}>{c.description}</p>
                  ) : null}
                </div>
                <Link href={`/colecoes/${c.slug}`} className="btn btn-outline btn-sm">Ver a linha</Link>
              </div>

              {c.products.length > 0 ? (
                <div className="grid-products" style={{ marginTop: "1.75rem" }}>
                  {c.products.map(({ product }) => (
                    <Link key={product.id} href={`/loja/${product.slug}`} className="product-card">
                      <MediaFrame
                        kind={(product.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                        alt={product.media[0]?.alt ?? product.name}
                        src={product.media[0]?.url || null}
                      />
                      <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{product.name}</p>
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
