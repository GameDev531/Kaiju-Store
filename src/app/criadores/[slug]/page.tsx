import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { Breadcrumbs, Label, SectionHead, Badge, MediaFrame, MoneyText, EmptyState, Notice } from "@/components/ui";
import { RIGHTS_LABELS, type MediaKind } from "@/server/domain/enums";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.creatorStore.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      products: {
        where: { published: true, deletedAt: null },
        include: { media: { orderBy: { position: "asc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = await load(slug);
  if (!store) return { title: "Loja não encontrada" };
  return {
    title: store.name,
    description: store.bio ?? `Loja de ${store.name} no ateliê ${SITE.name}.`,
    alternates: { canonical: `/criadores/${store.slug}` },
    openGraph: { title: `${store.name} · ${SITE.name}`, description: store.bio ?? undefined },
  };
}

export default async function CreatorStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await load(slug);
  if (!store) notFound();

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[{ href: "/", label: "Início" }, { href: "/criadores", label: "Criadores" }, { label: store.name }]}
      />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {store.verifiedAt ? <Badge tone="ink">Criador verificado</Badge> : null}
          {store.primaryPlatform ? <Badge tone="blueprint">{store.primaryPlatform}</Badge> : null}
        </div>
        <h1 className="t-display-sm" style={{ marginTop: "1rem" }}>{store.name}</h1>
        {store.bio ? <p className="t-lede" style={{ marginTop: "1rem" }}>{store.bio}</p> : null}
        {store.primaryHandle ? (
          <p className="t-mono" style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
            {store.primaryHandle}
          </p>
        ) : null}
      </header>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label={`${store.products.length} peça(s)`} title="A linha" />
        {store.products.length === 0 ? (
          <EmptyState
            mark="◇"
            title="Esta loja ainda não publicou peças"
            description="As primeiras peças aparecem aqui assim que forem publicadas."
            action={<Link href="/loja" className="btn btn-outline">Ver o catálogo do ateliê</Link>}
          />
        ) : (
          <div className="grid-products">
            {store.products.map((p) => (
              <Link key={p.id} href={`/loja/${p.slug}`} className="product-card">
                <MediaFrame
                  kind={(p.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                  alt={p.media[0]?.alt ?? p.name}
                  src={p.media[0]?.url || null}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{p.name}</p>
                  <p style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    <MoneyText cents={p.basePriceCents} currency={p.currency} />
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                    {RIGHTS_LABELS[p.rightsBasis as keyof typeof RIGHTS_LABELS]?.label ?? p.rightsBasis}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem", maxWidth: "72ch" }}>
        <Notice tone="info" title="Como funciona comprar de um criador">
          A arte é do criador; a produção, o pagamento, o controle de qualidade e o envio são nossos.
          Você compra pela KAIJU, com a mesma política de trocas e o mesmo acompanhamento de produção
          de qualquer peça do ateliê. O criador declara ser titular da arte que publica.
        </Notice>
      </section>
    </div>
  );
}
