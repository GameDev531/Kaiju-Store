import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Label, SectionHead, Notice, ConfidenceLegend } from "@/components/ui";
import { REFERENCE_ROLE_LABELS, type ReferenceRole } from "@/server/domain/enums";
import { SITE, PRIMARY_FAQ } from "@/lib/site";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "O caminho completo de uma peça KAIJU: referência, ficha técnica com incerteza declarada, aprovação, ateliê verificado, controle de qualidade e entrega.",
  alternates: { canonical: "/como-funciona" },
};

const STEPS = [
  {
    n: "01",
    title: "Você descreve a peça",
    body: "Um nome, um texto com suas palavras, e até quatro imagens de referência. Não precisa de vocabulário técnico — “quero bem larguinho nos ombros” diz mais do que “modelagem oversize com ombro caído”.",
    detail: "Se você não tem foto nenhuma, dá para começar só com texto. A ficha sai com mais campos incertos, e nós dizemos isso na tela.",
  },
  {
    n: "02",
    title: "Você diz para que serve cada imagem",
    body: "Esta é a silhueta. Esta é a manga. Esta é a cor. Esta é o detalhe do bolso. É o passo que impede o ateliê de misturar a manga de uma foto com a cor de outra.",
    detail: "Sem essa marcação, quatro fotos viram quatro interpretações possíveis. Com ela, viram uma peça só.",
  },
  {
    n: "03",
    title: "O sistema monta a ficha técnica",
    body: "Tipo de peça, silhueta, caimento, manga, gola, fechamento, bolsos, material, cor, acabamento — e a complexidade de produção. Cada campo vem com uma etiqueta dizendo o quanto se pode confiar nele.",
    detail: "Isso leva de 10 a 40 segundos. Se falhar, suas referências continuam salvas e você tenta de novo sem perder nada.",
  },
  {
    n: "04",
    title: "Você corrige o que estiver errado",
    body: "Cada linha é editável. O que você escreve vale mais que o que o sistema deduziu — e a ficha registra isso, marcando o campo como definido por você.",
    detail: "Toda edição cria uma versão nova. A anterior fica no histórico. Nada é sobrescrito em silêncio.",
  },
  {
    n: "05",
    title: "Você aprova e recebe o orçamento",
    body: "A aprovação congela aquela versão exata da ficha e gera uma assinatura digital dela. O orçamento vem com a composição aberta: mão de obra, materiais, técnicas especiais, serviço e prazo.",
    detail: "Sem medidas, o pedido não avança. É um bloqueio explícito, não um esquecimento que aparece depois.",
  },
  {
    n: "06",
    title: "Um ateliê verificado aceita",
    body: "Direcionamos a ficha para ateliês compatíveis pela especialização, pela complexidade que executam e pela capacidade livre. Quem aceita já viu o valor e o prazo.",
    detail: "Nenhum pedido vai para ateliê não verificado. A verificação é feita por uma pessoa, sobre documentação real.",
  },
  {
    n: "07",
    title: "Você acompanha a produção",
    body: "Materiais, corte, costura, acabamento — com fotos reais da sua peça, tiradas pelo ateliê. Se ele travar em alguma decisão, a produção pausa oficialmente e a pergunta chega até você.",
    detail: "As fotos são da sua peça. Nunca imagens ilustrativas ou de outra produção.",
  },
  {
    n: "08",
    title: "Controle de qualidade com números",
    body: "Antes de embalar, o ateliê mede a peça pronta e compara com a ficha aprovada, dentro da tolerância combinada. Os números ficam registrados.",
    detail: "É isso que permite responder objetivamente “ficou diferente do combinado?” — para os dois lados.",
  },
  {
    n: "09",
    title: "Chega até você",
    body: "Com código de rastreio. Você tem 7 dias para conferir e relatar qualquer divergência em relação à ficha que aprovou.",
    detail: "Se a divergência existir e for de execução, o conserto é por nossa conta.",
  },
];

export default function HowItWorksPage() {
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
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Como funciona" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "64ch" }}>
        <Label>O processo inteiro, sem omissão</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Como funciona</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Nove passos entre a ideia na sua cabeça e a peça na sua mão. Nenhum deles acontece sem você
          ver o que está sendo decidido.
        </p>
      </header>

      <section style={{ marginTop: "3.5rem" }}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0" }}>
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              style={{
                display: "grid",
                gridTemplateColumns: "4rem 1fr",
                gap: "1.5rem",
                paddingBlock: "1.75rem",
                borderBottom: i === STEPS.length - 1 ? "none" : "1px solid var(--color-rule)",
              }}
            >
              <span className="t-mono" style={{ color: "var(--color-shu)", fontWeight: 700, fontSize: "1.1rem" }}>
                {step.n}
              </span>
              <div style={{ maxWidth: "62ch" }}>
                <h2 className="t-title">{step.title}</h2>
                <p style={{ marginTop: "0.6rem", lineHeight: 1.7 }}>{step.body}</p>
                <p style={{ marginTop: "0.6rem", fontSize: "0.875rem", color: "var(--color-ink-faint)", lineHeight: 1.6 }}>
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="O ponto central" title="O que a análise consegue — e o que não consegue" />
        <p className="t-lede" style={{ marginBottom: "1.75rem" }}>
          Uma imagem carrega muito menos informação do que parece. Em vez de esconder isso, a ficha
          etiqueta cada campo:
        </p>
        <ConfidenceLegend />

        <div style={{ marginTop: "2rem", display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="panel" style={{ padding: "1.35rem" }}>
            <p className="t-label" style={{ color: "var(--color-observed)" }}>Dá para determinar</p>
            <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
              {["Tipo de peça e silhueta geral", "Tipo de manga, gola e decote", "Presença de bolsos, zíperes e aviamentos", "Proporções relativas entre as partes", "Existência de estampa ou bordado"].map((x) => (
                <li key={x} style={{ display: "flex", gap: "0.5rem" }}>
                  <span aria-hidden="true" style={{ color: "var(--color-observed)" }}>●</span>{x}
                </li>
              ))}
            </ul>
          </div>
          <div className="panel" style={{ padding: "1.35rem" }}>
            <p className="t-label" style={{ color: "var(--color-uncertain)" }}>Não dá para determinar por imagem</p>
            <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
              {["Composição e gramatura do tecido", "Cor calibrada — luz e tela mudam tudo", "Medidas em centímetros", "Método de construção interno e entretela", "Toque, peso e comportamento do caimento"].map((x) => (
                <li key={x} style={{ display: "flex", gap: "0.5rem" }}>
                  <span aria-hidden="true" style={{ color: "var(--color-uncertain)" }}>?</span>{x}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="info" title="Por que insistimos nisso">
            Quase toda frustração com roupa sob medida nasce de uma expectativa que ninguém corrigiu a
            tempo. Marcar a incerteza no momento em que ela existe custa uma linha de texto. Descobri-la
            quando a peça chega custa uma peça.
          </Notice>
        </div>
      </section>

      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="Multi-referência" title="Os papéis que você pode atribuir" />
        <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {(Object.keys(REFERENCE_ROLE_LABELS) as ReferenceRole[]).map((role) => (
            <div key={role} className="panel-sunk" style={{ padding: "1.1rem" }}>
              <p style={{ fontWeight: 650, fontSize: "0.95rem" }}>{REFERENCE_ROLE_LABELS[role].pt}</p>
              <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.35rem", lineHeight: 1.5 }}>
                {REFERENCE_ROLE_LABELS[role].hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap-narrow" style={{ marginTop: "3.5rem", paddingInline: 0 }}>
        <SectionHead label="Perguntas" title="As cinco que mais importam" action={{ href: "/faq", label: "Ver todas" }} />
        {PRIMARY_FAQ.map((item, i) => (
          <details key={item.q} style={{ borderBottom: "1px solid var(--color-rule)", paddingBlock: "1.1rem" }} {...(i === 0 ? { open: true } : {})}>
            <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: "1rem" }}>{item.q}</summary>
            <p style={{ marginTop: "0.85rem", color: "var(--color-ink-soft)", lineHeight: 1.7 }}>{item.a}</p>
          </details>
        ))}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <div className="panel corner-ticks" style={{ padding: "clamp(1.75rem, 4vw, 2.75rem)", textAlign: "center" }}>
          <h2 className="t-title">Pronto para começar?</h2>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.75rem", maxWidth: "48ch", marginInline: "auto" }}>
            Você não paga nada até aprovar a ficha e ver o orçamento completo.
          </p>
          <Link href="/criar" className="btn btn-primary" style={{ marginTop: "1.5rem" }}>Criar minha peça</Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </div>
  );
}
