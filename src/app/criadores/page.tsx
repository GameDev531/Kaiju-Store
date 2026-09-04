import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { Breadcrumbs, Label, SectionHead, Badge, EmptyState, Notice, MediaFrame } from "@/components/ui";
import type { MediaKind } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Criadores",
  description:
    "Lojas de criadores no ecossistema KAIJU: você desenha e vende para o seu público, nós cuidamos de produção, pagamento e envio.",
  alternates: { canonical: "/criadores" },
};
export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const stores = await db.creatorStore.findMany({
    where: { status: "ACTIVE" },
    include: {
      products: {
        where: { published: true, deletedAt: null },
        include: { media: { orderBy: { position: "asc" }, take: 1 } },
        take: 3,
      },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Criadores" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Creator economy</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Sua loja, nossa produção</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Você desenha e vende para o seu público. Nós cuidamos de fabricação sob demanda, pagamento,
          controle de qualidade e envio. Sem estoque parado, sem capital travado.
        </p>
      </header>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Como funciona" title="O que cada lado faz" />
        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {[
            { title: "Você traz", body: "A arte, a direção da peça e o público. Você decide o que entra na sua loja e como ela se apresenta." },
            { title: "Nós trazemos", body: "Ateliês verificados, ficha técnica de produção, meio de pagamento, controle de qualidade e logística." },
            { title: "A conta", body: "Cada venda paga a produção, a taxa da plataforma e a sua comissão. O percentual fica visível no seu painel antes de qualquer venda — sem letra miúda." },
            { title: "Os direitos", body: "A arte continua sua. Você declara ser titular do que envia, e nós exigimos isso porque revenda de arte de terceiro é problema seu e nosso." },
          ].map((card) => (
            <div key={card.title} className="panel" style={{ padding: "1.25rem" }}>
              <p style={{ fontWeight: 650 }}>{card.title}</p>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.5rem", lineHeight: 1.55 }}>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Lojas ativas" title="Criadores na plataforma" />
        {stores.length === 0 ? (
          <EmptyState
            mark="◇"
            title="Nenhuma loja de criador ainda"
            description="O programa está abrindo agora. Se você tem público e quer vender peça própria sem montar uma operação de fabricação, é uma boa hora para entrar."
            action={<Link href="/criadores/abrir" className="btn btn-primary">Quero abrir minha loja</Link>}
          />
        ) : (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            {stores.map((store) => (
              <article key={store.id} className="panel" style={{ padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
                  <div style={{ maxWidth: "48ch" }}>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                      {store.verifiedAt ? <Badge tone="ink">Criador verificado</Badge> : null}
                      <Badge>{store._count.products} peça(s)</Badge>
                    </div>
                    <h2 className="t-title">
                      <Link href={`/criadores/${store.slug}`} style={{ textDecoration: "none" }}>{store.name}</Link>
                    </h2>
                    {store.bio ? (
                      <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>{store.bio}</p>
                    ) : null}
                  </div>
                  <Link href={`/criadores/${store.slug}`} className="btn btn-outline btn-sm">Ver a loja</Link>
                </div>
                {store.products.length > 0 ? (
                  <div className="grid-products" style={{ marginTop: "1.5rem" }}>
                    {store.products.map((p) => (
                      <Link key={p.id} href={`/loja/${p.slug}`} className="product-card">
                        <MediaFrame
                          kind={(p.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                          alt={p.media[0]?.alt ?? p.name}
                          src={p.media[0]?.url || null}
                        />
                        <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{p.name}</p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "3.5rem" }}>
        <div className="panel corner-ticks" style={{ padding: "clamp(1.75rem, 4vw, 2.75rem)", maxWidth: "72ch" }}>
          <h2 className="t-title">Abrir minha loja</h2>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.75rem", lineHeight: 1.65 }}>
            O cadastro pede sua identidade, o canal onde está o seu público e uma declaração de
            titularidade sobre a arte que você vai vender. Uma pessoa analisa antes de liberar.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Notice tone="attention" title="Sobre arte de terceiros">
              Não aceitamos lojas construídas sobre personagens, logotipos ou arte de franquias que
              você não licenciou. Não é uma questão de política interna: é o que separa uma marca que
              dura de uma que recebe notificação e fecha.
            </Notice>
          </div>
          <Link href="/criadores/abrir" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>
            Solicitar minha loja
          </Link>
        </div>
      </section>
    </div>
  );
}
