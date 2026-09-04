import type { Metadata } from "next";
import { ApplicationShell } from "@/components/apply-form";
import { Notice, SectionHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Abrir minha loja de criador",
  description: "Requisitos para abrir uma loja de criador na KAIJU: identidade, público e titularidade da arte.",
  alternates: { canonical: "/criadores/abrir" },
};

export default function CreatorApplicationPage() {
  return (
    <ApplicationShell
      breadcrumbHref="/criadores"
      breadcrumbLabel="Criadores"
      label="Para criadores"
      title="Abrir minha loja"
      intro="Você desenha e vende para o seu público. Nós cuidamos de produção sob demanda, pagamento, controle de qualidade e envio. Sem estoque parado e sem capital travado."
      requirements={[
        { title: "Identidade", body: "Documento com foto, para que exista uma pessoa responsável pela loja." },
        { title: "Canal e público", body: "Onde está a sua audiência — YouTube, Twitch, TikTok, Instagram ou outro. Não exigimos número mínimo de seguidores." },
        { title: "Titularidade da arte", body: "Declaração de que você é titular do que vai vender. Isso não é formalidade: revenda de arte de terceiro é problema seu e nosso." },
        { title: "Direção da linha", body: "Alguma referência do que você pretende lançar, para avaliarmos viabilidade de produção antes de você desenhar." },
      ]}
      documentNote="O documento de identidade é usado apenas para a decisão de aprovação e apagado em até 90 dias. O que fica é o resultado da análise. Sua arte continua sua — a plataforma recebe apenas a licença de produzir e vender as peças que você publicar."
    >
      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Como funciona a conta" title="Comissão e pagamento" />
        <div style={{ display: "grid", gap: "1rem" }}>
          {[
            { t: "Você vê o percentual antes de vender", b: "A comissão da plataforma aparece no seu painel antes de qualquer venda, e não muda sem aviso prévio." },
            { t: "Cada venda paga a produção primeiro", b: "O ateliê que costura recebe pelo trabalho, a plataforma recebe a taxa, e o restante é sua comissão." },
            { t: "Repasse por ciclo de fechamento", b: "Sobre vendas entregues, fora do prazo de devolução. Valores em disputa ficam retidos até a análise concluir." },
          ].map((x) => (
            <div key={x.t} className="panel-sunk" style={{ padding: "1.15rem" }}>
              <p style={{ fontWeight: 650 }}>{x.t}</p>
              <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.4rem" }}>{x.b}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <Notice tone="attention" title="Sobre arte de franquias">
          Não aprovamos lojas construídas sobre personagens, logotipos ou arte de franquias que você não
          licenciou — mesmo que o público peça, mesmo que "todo mundo faz". Não é preciosismo: é o que
          separa uma marca que dura de uma que recebe notificação extrajudicial e fecha, levando junto
          o dinheiro de quem já tinha comprado.
        </Notice>
      </section>
    </ApplicationShell>
  );
}
