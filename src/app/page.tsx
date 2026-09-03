import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { SITE, PRIMARY_FAQ } from "@/lib/site";
import { getAuth, readAnonId } from "@/server/auth/session";
import { recommend } from "@/server/domain/recommender";
import { SectionHead, MediaFrame, Notice, MoneyText, Label, Badge } from "@/components/ui";
import { REFERENCE_ROLE_LABELS, RIGHTS_LABELS, type MediaKind } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await getAuth();
  const anonId = auth ? null : await readAnonId();

  const [featured, collections, recommendations] = await Promise.all([
    db.product.findMany({
      where: { published: true, deletedAt: null },
      include: { media: { orderBy: { position: "asc" }, take: 1 }, variants: { take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    db.collection.findMany({ where: { published: true }, orderBy: { position: "asc" }, take: 3 }),
    recommend({ userId: auth?.user.id ?? null, anonId, limit: 4 }),
  ]);

  // Recommendations are resolved to products here rather than joined in the
  // recommender, keeping the scorer free of presentation concerns.
  const recommendedProducts = recommendations.length
    ? await db.product.findMany({
        where: { id: { in: recommendations.map((r) => r.productId) } },
        include: { media: { orderBy: { position: "asc" }, take: 1 } },
      })
    : [];
  const reasonById = new Map(recommendations.map((r) => [r.productId, r.reason]));

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRIMARY_FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="wrap" style={{ paddingBlock: "clamp(3rem, 7vw, 5.5rem)" }}>
        <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.85fr)", alignItems: "start" }}>
          <div>
            <Label>Ateliê digital · Sob medida · Brasil</Label>
            <h1 className="t-display" style={{ marginTop: "1.25rem" }}>
              Achou a peça
              <br />
              perfeita na sua
              <br />
              cabeça?
              <span style={{ color: "var(--color-shu)" }}> Faça ela existir.</span>
            </h1>

            <p className="t-lede" style={{ marginTop: "1.75rem" }}>
              Você manda as referências. A gente transforma em <strong>ficha técnica de produção</strong> —
              com o que dá para saber e o que não dá, escrito na cara. Você aprova linha por linha.
              Um ateliê verificado costura. Chega pelo correio.
            </p>

            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "2rem" }}>
              <Link href="/criar" className="btn btn-primary">Criar minha peça</Link>
              <Link href="/loja" className="btn btn-outline">Ver a loja</Link>
              <Link href="/como-funciona" className="btn btn-quiet">Como funciona</Link>
            </div>

            {/* Honest positioning instead of invented social proof. A new platform
                with no customers should say what it is, not fabricate a wall of
                five-star reviews. */}
            <div className="panel-sunk" style={{ marginTop: "2.5rem", padding: "1.1rem 1.25rem" }}>
              <Label>Onde estamos</Label>
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>
                A KAIJU está começando. Não temos milhares de avaliações para mostrar, e não vamos
                inventar nenhuma. O que temos é o processo inteiro aberto: você vê a ficha técnica
                antes de pagar, o ateliê que vai costurar, e fotos reais da sua peça em produção.
                Quando houver avaliações, elas virão de pedidos entregues de verdade.
              </p>
            </div>
          </div>

          {/* Right rail: the mechanism, stated as a diagram rather than a promise. */}
          <aside className="panel corner-ticks" style={{ padding: "1.5rem" }} aria-labelledby="fluxo-titulo">
            <p className="t-label" id="fluxo-titulo">O caminho da peça</p>
            <ol style={{ listStyle: "none", margin: "1.25rem 0 0", padding: 0, display: "grid", gap: "0" }}>
              {[
                ["01", "Você imagina", "Referências, texto, ou os dois."],
                ["02", "A IA traduz", "Ficha técnica com incerteza declarada."],
                ["03", "Você aprova", "Edita cada linha. Nada passa sem o seu aval."],
                ["04", "O ateliê costura", "Costureiro verificado, com a ficha na mão."],
                ["05", "Controle de qualidade", "Medida conferida contra o que você aprovou."],
                ["06", "Chega até você", "Rastreio, e 7 dias para relatar qualquer problema."],
              ].map(([num, title, sub], i, arr) => (
                <li
                  key={num}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.4rem 1fr",
                    gap: "0.9rem",
                    paddingBlock: "0.85rem",
                    borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--color-rule)",
                  }}
                >
                  <span className="t-mono" style={{ color: "var(--color-shu)", fontWeight: 700, fontSize: "0.8rem" }}>{num}</span>
                  <span>
                    <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem" }}>{title}</span>
                    <span style={{ display: "block", fontSize: "0.82rem", color: "var(--color-ink-faint)", lineHeight: 1.45 }}>{sub}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <hr className="rule" />

      {/* ============ MULTI-REFERENCE EXPLAINER ============ */}
      <section className="wrap section">
        <SectionHead
          label="O que torna isto diferente"
          title="Uma peça, várias referências"
          action={{ href: "/criar", label: "Montar a minha" }}
        />
        <p className="t-lede" style={{ marginBottom: "2rem" }}>
          Ninguém encontra a peça perfeita numa foto só. Você manda quatro, e diz para que serve cada uma —
          o ateliê recebe uma ficha única, com a origem de cada decisão registrada.
        </p>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {(["SILHOUETTE", "SLEEVES", "COLOR", "DETAILS"] as const).map((role, i) => (
            <div key={role} className="panel" style={{ padding: "1.15rem" }}>
              <p className="t-mono" style={{ fontSize: "0.7rem", color: "var(--color-shu)", fontWeight: 700 }}>
                REF {String(i + 1).padStart(2, "0")}
              </p>
              <p style={{ fontWeight: 650, marginTop: "0.5rem" }}>{REFERENCE_ROLE_LABELS[role].pt}</p>
              <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.35rem", lineHeight: 1.5 }}>
                {REFERENCE_ROLE_LABELS[role].hint}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="info" title="A IA é assistente, não autoridade">
            Cada campo da ficha vem marcado como <strong>Observado</strong>, <strong>Deduzido</strong>,{" "}
            <strong>Incerto</strong> ou <strong>Sugerido</strong>. Tecido, gramatura e cor calibrada não
            são determináveis por foto — e a ficha diz isso, em vez de chutar com confiança.
          </Notice>
        </div>
      </section>

      {/* ============ RECOMMENDATIONS ============ */}
      {recommendedProducts.length > 0 ? (
        <section className="wrap section-tight">
          <SectionHead
            label={auth ? "Com base no que você olhou" : "Com base na sua navegação"}
            title="Selecionado para você"
            action={{ href: "/conta/privacidade", label: "Ver e apagar meu perfil de gosto" }}
          />
          <div className="grid-products">
            {recommendedProducts.map((product) => (
              <ProductCard
                key={product.id}
                slug={product.slug}
                name={product.name}
                priceCents={product.basePriceCents}
                rightsBasis={product.rightsBasis}
                mediaKind={(product.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                mediaUrl={product.media[0]?.url}
                mediaAlt={product.media[0]?.alt ?? product.name}
                footnote={reasonById.get(product.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ============ CATALOGUE ============ */}
      <section className="wrap section">
        <SectionHead label="Pronta-entrega e sob encomenda" title="Da loja" action={{ href: "/loja", label: "Ver tudo" }} />
        {featured.length > 0 ? (
          <div className="grid-products">
            {featured.map((product) => (
              <ProductCard
                key={product.id}
                slug={product.slug}
                name={product.name}
                priceCents={product.basePriceCents}
                rightsBasis={product.rightsBasis}
                mediaKind={(product.media[0]?.kind as MediaKind) ?? "TECHNICAL_DRAWING"}
                mediaUrl={product.media[0]?.url}
                mediaAlt={product.media[0]?.alt ?? product.name}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">◇</span>
            <p className="t-title">A loja ainda está sendo montada</p>
            <p style={{ color: "var(--color-ink-soft)", maxWidth: "48ch" }}>
              As primeiras peças do ateliê entram em breve. Enquanto isso, o caminho sob medida já está aberto —
              é o mesmo processo, começando pela sua referência.
            </p>
            <Link href="/criar" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>Criar minha peça</Link>
          </div>
        )}
      </section>

      {/* ============ ECOSYSTEM ============ */}
      <section style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}>
        <div className="wrap section">
          <p className="t-label" style={{ color: "color-mix(in srgb, var(--color-paper) 60%, transparent)" }}>
            Não é só uma loja
          </p>
          <h2 className="t-display-sm" style={{ marginTop: "0.75rem", maxWidth: "20ch" }}>
            Um ecossistema de moda, produção e trabalho
          </h2>

          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: "2.5rem" }}>
            {[
              {
                href: "/atelie/entrar",
                label: "Para costureiros",
                title: "Receba trabalho com ficha pronta",
                body: "Fichas técnicas completas, medidas conferidas e pagamento acordado antes de você aceitar. Sem negociar por mensagem de áudio.",
              },
              {
                href: "/criadores/abrir",
                label: "Para criadores",
                title: "Sua loja, nossa produção",
                body: "Você desenha e vende para o seu público. Nós cuidamos de produção, pagamento e envio. Comissão transparente por venda.",
              },
              {
                href: "/revenda",
                label: "Para lojistas",
                title: "Compre para revender",
                body: "Comprove que você tem loja e ganhe condição de atacado no estoque pronta-entrega.",
              },
              {
                href: "/trabalhos",
                label: "Para profissionais",
                title: "Vagas de verdade, empresas verificadas",
                body: "Gratuito dos dois lados. Só quem comprova empresa pode publicar vaga — é assim que se evita golpe de recrutamento.",
              },
            ].map((card) => (
              <Link
                key={card.href}
                href={card.href}
                style={{
                  textDecoration: "none",
                  border: "1px solid color-mix(in srgb, var(--color-paper) 22%, transparent)",
                  padding: "1.35rem",
                  display: "block",
                }}
              >
                <p className="t-label" style={{ color: "var(--color-shu)" }}>{card.label}</p>
                <p style={{ fontWeight: 650, fontSize: "1.05rem", marginTop: "0.6rem" }}>{card.title}</p>
                <p style={{ fontSize: "0.875rem", marginTop: "0.5rem", opacity: 0.75, lineHeight: 1.5 }}>{card.body}</p>
                <p style={{ marginTop: "0.9rem", fontSize: "0.85rem", fontWeight: 600 }}>Saiba mais →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ COLLECTIONS ============ */}
      {collections.length > 0 ? (
        <section className="wrap section">
          <SectionHead label="Linhas do ateliê" title="Coleções" action={{ href: "/colecoes", label: "Todas as coleções" }} />
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {collections.map((c) => (
              <Link key={c.id} href={`/colecoes/${c.slug}`} className="panel" style={{ padding: "1.5rem", textDecoration: "none" }}>
                <Badge tone="blueprint">{RIGHTS_LABELS[c.rightsBasis as keyof typeof RIGHTS_LABELS]?.label ?? c.rightsBasis}</Badge>
                <p className="t-title" style={{ marginTop: "0.9rem" }}>{c.name}</p>
                {c.tagline ? <p style={{ color: "var(--color-ink-soft)", fontSize: "0.9rem", marginTop: "0.4rem" }}>{c.tagline}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ============ FAQ ============ */}
      <section className="wrap-narrow section">
        <SectionHead label="Antes de você gastar dinheiro" title="Cinco perguntas honestas" action={{ href: "/faq", label: "Mais perguntas" }} />
        <div style={{ display: "grid", gap: "0" }}>
          {PRIMARY_FAQ.map((item, i) => (
            <details
              key={item.q}
              style={{ borderBottom: "1px solid var(--color-rule)", paddingBlock: "1.1rem" }}
              {...(i === 0 ? { open: true } : {})}
            >
              <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: "1.02rem", listStyle: "none", display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
                <span className="t-mono" aria-hidden="true" style={{ color: "var(--color-shu)", fontSize: "0.75rem", paddingTop: "0.25rem" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item.q}</span>
              </summary>
              <p style={{ marginTop: "0.85rem", paddingLeft: "2rem", color: "var(--color-ink-soft)", lineHeight: 1.65 }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ============ CLOSING CTA ============ */}
      <section className="wrap section-tight">
        <div className="panel corner-ticks" style={{ padding: "clamp(2rem, 5vw, 3.5rem)", textAlign: "center" }}>
          <h2 className="t-display-sm" style={{ maxWidth: "18ch", marginInline: "auto" }}>
            A peça já existe na sua cabeça
          </h2>
          <p className="t-lede" style={{ marginInline: "auto", marginTop: "1rem" }}>
            O resto é ficha técnica, tesoura e linha. Comece com uma foto.
          </p>
          <Link href="/criar" className="btn btn-primary" style={{ marginTop: "1.75rem" }}>
            Criar minha peça
          </Link>
        </div>
      </section>

      <div className="mobile-cta">
        <Link href="/criar" className="btn btn-primary btn-block">Criar minha peça</Link>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </>
  );
}

function ProductCard({
  slug, name, priceCents, rightsBasis, mediaKind, mediaUrl, mediaAlt, footnote,
}: {
  slug: string;
  name: string;
  priceCents: number;
  rightsBasis: string;
  mediaKind: MediaKind;
  mediaUrl?: string | undefined;
  mediaAlt: string;
  footnote?: string | undefined;
}) {
  return (
    <Link href={`/loja/${slug}`} className="product-card">
      <MediaFrame kind={mediaKind} alt={mediaAlt} src={mediaUrl ?? null} />
      <div>
        <p style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.35 }}>{name}</p>
        <p style={{ marginTop: "0.3rem", fontSize: "0.9rem" }}>
          <MoneyText cents={priceCents} />
        </p>
        {footnote ? (
          <p style={{ marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--color-shu)" }}>{footnote}</p>
        ) : (
          <p style={{ marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--color-ink-faint)" }}>
            {RIGHTS_LABELS[rightsBasis as keyof typeof RIGHTS_LABELS]?.label ?? rightsBasis}
          </p>
        )}
      </div>
    </Link>
  );
}
