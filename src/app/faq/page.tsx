import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Label, SectionHead } from "@/components/ui";
import { PRIMARY_FAQ, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Respostas sobre peças sob medida, análise por IA, medidas, prazos, direitos autorais e o ecossistema KAIJU.",
  alternates: { canonical: "/faq" },
};

const GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "Peças sob medida",
    items: [...PRIMARY_FAQ],
  },
  {
    title: "Preço e pagamento",
    items: [
      {
        q: "Por que uma peça sob medida custa mais que uma de loja?",
        a: "Porque ninguém a produziu antes de você pedir. Não há diluição de custo de molde, corte em lote, ou escala de compra de tecido. O orçamento mostra a composição inteira — mão de obra do ateliê, materiais, técnicas especiais e o serviço de design — para você ver exatamente onde o dinheiro vai.",
      },
      {
        q: "Quando eu pago?",
        a: "Depois de aprovar a ficha técnica e ver o orçamento completo, com prazo e frete. Antes disso você não paga nada, e criar quantos designs quiser é gratuito.",
      },
      {
        q: "Vocês guardam meu cartão?",
        a: "Não. O pagamento é processado pelo provedor, que devolve para nós apenas um identificador da transação, a bandeira e os quatro últimos dígitos. O número do cartão nunca passa pelos nossos servidores.",
      },
      {
        q: "Posso parcelar?",
        a: "As opções disponíveis aparecem no checkout, conforme o meio de pagamento escolhido e o provedor.",
      },
    ],
  },
  {
    title: "Medidas e caimento",
    items: [
      {
        q: "E se eu medir errado?",
        a: "Acontece, e por isso a origem da medida fica registrada na ficha — se você mediu sozinho, se um profissional mediu, ou se tirou de uma peça que já serve. Se a peça for executada corretamente conforme os números que você deu, mas eles não corresponderem ao seu corpo, oferecemos ajuste com custo reduzido quando a alteração é tecnicamente possível. A política de trocas detalha cada caso.",
      },
      {
        q: "Posso mandar as medidas de uma peça que já tenho?",
        a: "Sim, e muita gente prefere assim. Marque a origem como “tirei de uma peça que serve” — o ateliê trabalha diferente sabendo que os números incluem a folga da peça, não o corpo.",
      },
      {
        q: "O que é a tolerância de ±15 mm?",
        a: "É a margem acordada dentro da qual a peça pronta pode variar em relação à ficha. Costura é trabalho manual sobre tecido, que estica e encolhe; um centímetro e meio é a margem que a alfaiataria trabalha na prática. Fora dela, é erro de execução e o conserto é por nossa conta.",
      },
    ],
  },
  {
    title: "Direitos autorais",
    items: [
      {
        q: "Posso mandar fazer a roupa de um personagem?",
        a: "Depende. Uma peça única para uso pessoal, inspirada numa estética — silhueta, paleta, tipo de gola — é o caso comum e nós produzimos. Reprodução de arte, logotipo ou personagem específico é sinalizada, analisada por uma pessoa, e pode exigir que você confirme ter autorização. Revenda de qualquer peça baseada em obra de terceiro está fora. A política de propriedade intelectual explica cada situação.",
      },
      {
        q: "As miniaturas são de personagens de anime?",
        a: "Não. São criações originais do nosso estúdio, esculpidas internamente. Não damos nem vendemos réplicas de personagens de terceiros, nem como brinde de campanha.",
      },
    ],
  },
  {
    title: "Ateliês e produção",
    items: [
      {
        q: "Quem costura a minha peça?",
        a: "Um ateliê ou profissional independente da nossa rede, verificado por uma pessoa da nossa equipe antes de receber qualquer pedido. Você vê o nome do estúdio, a cidade e o nível de verificação na página do seu pedido.",
      },
      {
        q: "O ateliê vê meus dados pessoais?",
        a: "Não. Ele recebe a ficha técnica, as referências visuais e as medidas. Nome, endereço, e-mail e telefone não são compartilhados — a entrega é intermediada por nós.",
      },
      {
        q: "Quero costurar para a KAIJU. Como faço?",
        a: "A página de cadastro de ateliê explica o processo, os níveis de verificação e como o pagamento funciona. O cadastro é gratuito e você define sua capacidade e o nível de complexidade que aceita.",
      },
    ],
  },
  {
    title: "Conta e privacidade",
    items: [
      {
        q: "Vocês usam minhas fotos para treinar IA?",
        a: "Não. Suas imagens servem para gerar a ficha da sua peça e para o ateliê executá-la. Não treinam modelos, não são vendidas, não alimentam publicidade. O consentimento para melhoria de modelo existe na sua conta, vem desativado, e não pedimos que você o ative.",
      },
      {
        q: "Como apago meus dados?",
        a: "Em Conta → Privacidade. Você pode exportar tudo em JSON, apagar só o histórico de navegação e o perfil de gosto, ou pedir a exclusão da conta inteira. Os dois primeiros são imediatos.",
      },
      {
        q: "Por que vocês recomendam peças para mim?",
        a: "A partir do que você visualizou, buscou e comprou aqui, montamos um perfil de afinidade sobre características de roupa — techwear, paleta escura, modelagem oversized. Você pode ver esse perfil por extenso na sua conta e apagá-lo quando quiser. Ele perde força com o tempo por padrão.",
      },
    ],
  },
];

export default function FaqPage() {
  const all = GROUPS.flatMap((g) => g.items);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: all.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Perguntas frequentes" }]} />
      <Label>Dúvidas</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Perguntas frequentes</h1>
      <p className="t-lede" style={{ marginTop: "1rem" }}>
        Se a sua pergunta não estiver aqui, <Link href="/contato" className="link">escreva para a gente</Link> —
        respondemos em até {SITE.contact.responseHours} horas úteis.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} style={{ marginTop: "3rem" }}>
          <SectionHead label={`${group.items.length} perguntas`} title={group.title} />
          {group.items.map((item) => (
            <details key={item.q} style={{ borderBottom: "1px solid var(--color-rule)", paddingBlock: "1.1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 650, fontSize: "1rem" }}>{item.q}</summary>
              <p style={{ marginTop: "0.85rem", color: "var(--color-ink-soft)", lineHeight: 1.7 }}>{item.a}</p>
            </details>
          ))}
        </section>
      ))}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </div>
  );
}
