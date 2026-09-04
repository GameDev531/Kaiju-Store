import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Label, SectionHead, Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contato",
  description: "Canais de atendimento da KAIJU e prazos reais de resposta.",
  alternates: { canonical: "/contato" },
};

const CHANNELS = [
  {
    title: "Suporte e pedidos",
    email: SITE.contact.support,
    body: "Dúvidas sobre um pedido, prazo, medida ou algo que chegou diferente do esperado.",
    hint: "Se for sobre um pedido específico, abrir o chamado pela página do pedido é mais rápido — o histórico e as fotos da produção já vão junto.",
  },
  {
    title: "Propriedade intelectual",
    email: SITE.contact.copyright,
    body: "Denúncia de violação de direitos, contra-notificação, ou proposta de licenciamento.",
    hint: "Acusamos recebimento em até 2 dias úteis e concluímos a análise em até 10.",
  },
  {
    title: "Privacidade e dados",
    email: SITE.contact.privacy,
    body: "Exercício de direitos sobre seus dados que não esteja disponível na sua conta.",
    hint: "Exportação e exclusão você faz sozinho, na hora, em Conta → Privacidade.",
  },
  {
    title: "Ateliês e parcerias",
    email: SITE.contact.partners,
    body: "Dúvidas sobre trabalhar conosco, verificação, repasse ou capacidade.",
    hint: "Para se cadastrar, use a página de ateliê — é mais rápido que o e-mail.",
  },
];

export default function ContactPage() {
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Contato" }]} />
      <Label>Fale com a gente</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Contato</h1>
      <p className="t-lede" style={{ marginTop: "1rem" }}>
        Somos uma equipe pequena e respondemos tudo. O prazo abaixo é o real, não o desejável.
      </p>

      <div style={{ marginTop: "2rem" }}>
        <Notice tone="info" title={`Prazo de resposta: até ${SITE.contact.responseHours} horas úteis`}>
          Se o seu caso envolve um pedido parado ou uma peça já entregue, marque isso no assunto —
          esses vão para o topo da fila.
        </Notice>
      </div>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Canais" title="Para onde escrever" />
        <div style={{ display: "grid", gap: "1rem" }}>
          {CHANNELS.map((c) => (
            <div key={c.email} className="panel" style={{ padding: "1.35rem" }}>
              <p style={{ fontWeight: 650, fontSize: "1.02rem" }}>{c.title}</p>
              <p style={{ color: "var(--color-ink-soft)", marginTop: "0.4rem", fontSize: "0.9rem" }}>{c.body}</p>
              <p style={{ marginTop: "0.75rem" }}>
                <a href={`mailto:${c.email}`} className="link t-mono" style={{ fontSize: "0.9rem" }}>{c.email}</a>
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.5rem", lineHeight: 1.55 }}>
                {c.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Segurança" title="Nunca pedimos" />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.6rem" }}>
          {[
            "Sua senha, por nenhum canal, em nenhuma hipótese.",
            "Pagamento por fora da plataforma, por PIX direto para uma pessoa.",
            "Dados de cartão por e-mail, telefone ou mensagem.",
            "Taxa para se candidatar a uma vaga ou para se cadastrar como ateliê.",
          ].map((item) => (
            <li key={item} style={{ display: "flex", gap: "0.6rem", fontSize: "0.9rem" }}>
              <span aria-hidden="true" className="t-mono" style={{ color: "var(--color-uncertain)" }}>×</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--color-ink-soft)" }}>
          Se alguém se apresentar como KAIJU e pedir qualquer uma dessas coisas, é golpe. Avise em{" "}
          <a href={`mailto:${SITE.contact.support}`} className="link">{SITE.contact.support}</a>.
        </p>
      </section>

      <p style={{ marginTop: "2.5rem", fontSize: "0.875rem", color: "var(--color-ink-faint)" }}>
        Antes de escrever, vale checar as{" "}
        <Link href="/faq" className="link">perguntas frequentes</Link> — a maioria das dúvidas já está lá.
      </p>
    </div>
  );
}
