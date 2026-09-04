import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { Breadcrumbs, Label, SectionHead, Badge, Notice, MoneyText } from "@/components/ui";

export const metadata: Metadata = {
  title: "Planos e ferramentas",
  description: "Ferramentas de design e visibilidade para profissionais da moda no ecossistema KAIJU.",
  alternates: { canonical: "/planos" },
};
export const dynamic = "force-dynamic";

const ENTITLEMENT_LABELS: Record<string, string> = {
  aiAnalysesPerMonth: "Análises de referência por mês",
  savedDesigns: "Designs salvos",
  jobBoardApply: "Candidatura a vagas",
  jobBoardPost: "Publicação de vagas",
  aiConceptGenerator: "Gerador de conceito visual",
  jobBoardRankingBoost: "Destaque no quadro de vagas",
  productionAnalytics: "Relatórios de produção",
  prioritySupport: "Suporte prioritário",
};

export default async function PlansPage() {
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } });

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Planos" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Ferramentas profissionais</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Planos</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Comprar e vender roupa aqui é gratuito. Os planos existem para quem usa a plataforma como
          ferramenta de trabalho — mais análises, geração de conceito e visibilidade no quadro de vagas.
        </p>
      </header>

      <section style={{ marginTop: "3rem" }}>
        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {plans.map((plan) => {
            const entitlements = JSON.parse(plan.entitlementsJson) as Record<string, unknown>;
            const highlighted = plan.code === "DESIGNER";
            return (
              <article
                key={plan.id}
                className={highlighted ? "panel corner-ticks" : "panel"}
                style={{ padding: "1.75rem", display: "flex", flexDirection: "column" }}
              >
                {highlighted ? <Badge tone="shu">Mais escolhido por freelancers</Badge> : null}
                <h2 className="t-title" style={{ marginTop: highlighted ? "0.85rem" : 0 }}>{plan.name}</h2>
                <p style={{ marginTop: "0.75rem" }}>
                  <span style={{ fontSize: "2rem", fontWeight: 700 }}>
                    {plan.priceCents === 0 ? "Grátis" : <MoneyText cents={plan.priceCents} currency={plan.currency} />}
                  </span>
                  {plan.priceCents > 0 ? (
                    <span style={{ color: "var(--color-ink-faint)", fontSize: "0.9rem" }}> / mês</span>
                  ) : null}
                </p>

                <ul style={{ listStyle: "none", margin: "1.5rem 0 0", padding: 0, display: "grid", gap: "0.6rem", flex: 1 }}>
                  {Object.entries(entitlements).map(([key, value]) => {
                    const label = ENTITLEMENT_LABELS[key];
                    if (!label) return null;
                    const enabled = typeof value === "boolean" ? value : true;
                    return (
                      <li key={key} style={{ display: "flex", gap: "0.6rem", fontSize: "0.9rem", opacity: enabled ? 1 : 0.4 }}>
                        <span aria-hidden="true" className="t-mono" style={{ color: enabled ? "var(--color-observed)" : "var(--color-ink-faint)" }}>
                          {enabled ? "✓" : "—"}
                        </span>
                        <span>
                          {label}
                          {typeof value === "number" ? <strong>: {value.toLocaleString("pt-BR")}</strong> : null}
                          <span className="sr-only">{enabled ? " incluído" : " não incluído"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <Link
                  href={plan.priceCents === 0 ? "/cadastrar" : `/planos/assinar?plano=${plan.code}`}
                  className={highlighted ? "btn btn-primary btn-block" : "btn btn-outline btn-block"}
                  style={{ marginTop: "1.75rem" }}
                >
                  {plan.priceCents === 0 ? "Começar grátis" : `Assinar ${plan.name}`}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: "3rem", maxWidth: "72ch" }}>
        <SectionHead label="Sobre o gerador de conceito" title="O que ele faz, e o que não faz" />
        <Notice tone="info" title="Ele compõe. Ele não copia.">
          O gerador do plano Designer produz composições visuais originais a partir de uma direção
          estética que você descreve — silhueta, paleta, materialidade, clima. Ele não reproduz
          personagens, logotipos ou peças de marcas existentes, e recusa pedidos nesse sentido.
          <br /><br />
          Uma imagem gerada é <strong>um conceito</strong>, não uma promessa de produto. Se ela virar
          uma peça, passa pelo mesmo caminho de qualquer outra: ficha técnica revisável, sua aprovação,
          ateliê verificado. E aparece sempre rotulada como conceito, nunca como foto de peça física.
        </Notice>
      </section>

      <section style={{ marginTop: "2.5rem", maxWidth: "72ch" }}>
        <SectionHead label="Transparência" title="O que a assinatura não compra" />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
          {[
            "Prioridade na fila de produção. Peça de assinante e de não assinante entram na mesma ordem.",
            "Aprovação automática como contratante no quadro de vagas — isso continua exigindo comprovação de empresa.",
            "Verificação de ateliê. O nível de verificação vem de documentação e histórico, não de plano pago.",
            "Melhor posição na loja para produtos de criador. O catálogo não é leiloado.",
          ].map((item) => (
            <li key={item} style={{ display: "flex", gap: "0.6rem", fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>
              <span aria-hidden="true" className="t-mono" style={{ color: "var(--color-uncertain)" }}>×</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
