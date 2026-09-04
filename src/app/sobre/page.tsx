import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Label, SectionHead, Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Por que a KAIJU existe, o que ela é hoje, e o que ela ainda não é.",
  alternates: { canonical: "/sobre" },
};

export default function AboutPage() {
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Sobre" }]} />
      <Label>A marca</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Sobre a {SITE.name}</h1>

      <div style={{ marginTop: "2.5rem", display: "grid", gap: "1.5rem", lineHeight: 1.8, fontSize: "1.02rem" }}>
        <p>
          A KAIJU começou de uma frustração específica: você sabe exatamente a peça que quer, consegue
          descrevê-la em detalhe, e ela simplesmente não existe em lugar nenhum. Você percorre lojas,
          aceita um "parecido", ou tenta encomendar com uma costureira e descobre que explicar uma
          roupa por mensagem de texto é mais difícil do que parecia.
        </p>
        <p>
          Do outro lado dessa mesma frustração há um profissional que recebe áudios confusos, fotos
          sem contexto e medidas que aparecem no meio do processo — e que precisa adivinhar o que a
          pessoa quer, sem ferramenta nenhuma para isso.
        </p>
        <p>
          A plataforma existe para o pedaço do meio: transformar referência visual e linguagem comum em
          um documento técnico que a costureira consegue executar, e que o cliente consegue conferir.
          Não para substituir ninguém.
        </p>
      </div>

      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="Princípios" title="O que orienta as decisões daqui" />
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {[
            {
              t: "A IA traduz, não decide",
              d: "Nenhuma peça vai para produção por decisão de um modelo. A ficha é uma proposta que você edita e aprova. E quando o sistema não sabe algo, ele escreve que não sabe, em vez de inventar com confiança.",
            },
            {
              t: "Quem costura é profissional, e é pago como tal",
              d: "O valor do trabalho é acordado antes do aceite e não é renegociado depois. Ateliê recebe ficha completa e medidas conferidas — não um print e boa sorte.",
            },
            {
              t: "Original, não réplica",
              d: "Somos uma marca inspirada em cultura anime e geek. Isso é diferente de ser uma fábrica de cópias. As criações do estúdio são nossas; obra de terceiro só com licença.",
            },
            {
              t: "Sem número inventado",
              d: "Não temos avaliações falsas, contador de clientes fictício nem selo de prêmio que não ganhamos. Quando houver avaliação aqui, ela virá de um pedido entregue de verdade.",
            },
            {
              t: "Seus dados são seus",
              d: "Coletamos o mínimo, não vendemos nada, não treinamos modelo com suas imagens, e a exportação e a exclusão funcionam de verdade — com um clique, sem falar com ninguém.",
            },
          ].map((p) => (
            <div key={p.t} className="panel" style={{ padding: "1.35rem" }}>
              <p style={{ fontWeight: 650, fontSize: "1.02rem" }}>{p.t}</p>
              <p style={{ marginTop: "0.5rem", color: "var(--color-ink-soft)", lineHeight: 1.65 }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="Honestidade" title="O que ainda não somos" />
        <Notice tone="info" title="Estamos começando">
          <p style={{ marginBottom: "0.75rem" }}>
            A KAIJU é uma operação nova. Isso significa, concretamente:
          </p>
          <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
            <li>A rede de ateliês é pequena e concentrada. Peças muito complexas podem demorar a encontrar quem execute.</li>
            <li>O catálogo é curto. Ele vai crescer com o que as pessoas efetivamente pedirem.</li>
            <li>Não temos histórico de entregas para mostrar. Ele se constrói com pedido real.</li>
            <li>Ainda não enviamos para fora do Brasil.</li>
          </ul>
          <p style={{ marginTop: "0.75rem" }}>
            Preferimos dizer isso na página "sobre" do que deixar você descobrir no checkout.
          </p>
        </Notice>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="O nome" title="Por que KAIJU" />
        <p style={{ lineHeight: 1.8, color: "var(--color-ink-soft)" }}>
          怪獣 — "besta estranha". A palavra vem do cinema japonês e descreve criaturas grandes demais
          para caber em qualquer categoria existente. Pareceu adequado para uma marca feita para
          pessoas que não encontram o que querem nas prateleiras. As criaturas do nosso catálogo são
          desenhadas e esculpidas por nós, e nenhuma delas é de outra franquia.
        </p>
      </section>

      <div style={{ marginTop: "3rem", display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
        <Link href="/criar" className="btn btn-primary">Criar minha peça</Link>
        <Link href="/atelie/entrar" className="btn btn-outline">Trabalhar como ateliê</Link>
      </div>
    </div>
  );
}
