import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Propriedade intelectual",
  description:
    "Como a KAIJU trata direitos autorais: o que produzimos, o que recusamos, como denunciar uma violação e como responder a uma denúncia.",
  alternates: { canonical: "/politicas/direitos-autorais" },
};

export default function CopyrightPolicyPage() {
  return (
    <PolicyPage
      label="Política"
      title="Propriedade intelectual"
      updated="1 de setembro de 2026"
      summary="Somos uma plataforma de moda inspirada em cultura anime e geek. Isso é diferente de ser uma fábrica de réplicas — e a distinção é o que mantém a marca de pé."
    >
      <PolicySection title="1. As quatro origens possíveis">
        <p>Toda peça e toda arte aqui é classificada em uma destas categorias, e a classificação é obrigatória:</p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Criação original.</strong> Desenvolvida pelo nosso estúdio. Personagens, esculturas e
            grafismos que são nossos. A maior parte do catálogo.
          </li>
          <li>
            <strong>Licenciada.</strong> Produzida sob contrato com o titular dos direitos, identificado
            na ficha do produto. Se não houver contrato, não existe produto licenciado — por mais que a
            demanda exista.
          </li>
          <li>
            <strong>Do criador parceiro.</strong> Arte de um criador que declara e responde por ser o
            titular. A responsabilidade é dele, e nós verificamos antes de publicar.
          </li>
          <li>
            <strong>Referência enviada por cliente.</strong> Imagens que você envia para orientar uma
            peça sua. Não vão para o catálogo, não são vendidas a ninguém, e ficam visíveis apenas para
            você e para o ateliê que produz a sua peça.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="2. Peça sob medida a partir de uma referência protegida">
        <p>
          A pergunta que mais recebemos: "posso mandar fazer uma jaqueta igual à do personagem X?"
        </p>
        <p>
          A resposta honesta é: <strong>depende, e nós não somos o seu advogado.</strong> O que podemos
          dizer com clareza é como agimos:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Uma peça única, para seu uso pessoal, inspirada numa estética</strong> — silhueta,
            paleta, tipo de gola, clima visual — é o caso comum e nós produzimos. Elementos de design
            genéricos não pertencem a ninguém.
          </li>
          <li>
            <strong>Reprodução de arte, logotipo, emblema ou personagem específico</strong> nós tratamos
            como um caso que exige atenção. O sistema sinaliza automaticamente, uma pessoa analisa, e
            podemos pedir que você confirme que tem autorização — ou propor uma alternativa que capture
            a mesma ideia sem reproduzir a obra.
          </li>
          <li>
            <strong>Revenda</strong> de qualquer peça baseada em obra de terceiro está fora. Uso pessoal
            e comércio são situações jurídicas diferentes, e nós não financiamos a segunda.
          </li>
          <li>
            <strong>Falsificação</strong> — reproduzir a marca de outra empresa numa peça para que ela
            passe por original — nunca. Não é uma zona cinzenta.
          </li>
        </ul>
        <Notice tone="attention" title="O aviso que aparece no seu pedido">
          Quando detectamos sinal de obra de terceiro na sua referência, a ficha técnica exibe um alerta
          antes da aprovação. Ele não é uma acusação nem um bloqueio automático — é para você decidir
          com a informação na mão.
        </Notice>
      </PolicySection>

      <PolicySection title="3. O que a nossa IA não faz">
        <p>
          O analisador de referências é instruído a descrever roupa em termos funcionais — formas, cores,
          construção — e não a identificar ou reproduzir obras protegidas. Ele não recebe instrução para
          contornar proteção de direitos, e pedidos nesse sentido no texto do cliente são registrados e
          ignorados.
        </p>
        <p>
          O gerador de conceito do plano Designer cria composições originais a partir de direção
          estética. Ele não é, e não será, uma ferramenta de "gere a arte do personagem X".
        </p>
      </PolicySection>

      <PolicySection title="4. Denunciar uma violação">
        <p>
          Se você é titular de direitos e acredita que algo aqui viola sua propriedade, envie para{" "}
          <a href={`mailto:${SITE.contact.copyright}`} className="link">{SITE.contact.copyright}</a> ou use o{" "}
          <Link href="/contato?assunto=direitos" className="link">formulário de denúncia</Link>, com:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Identificação da obra protegida e a evidência da sua titularidade.</li>
          <li>O link exato do conteúdo denunciado nesta plataforma.</li>
          <li>Seus dados de contato.</li>
          <li>Uma declaração de boa-fé de que o uso não está autorizado.</li>
        </ul>
        <p>
          <strong>Prazo:</strong> acusamos o recebimento em até 2 dias úteis e concluímos a análise em até
          10 dias úteis. Casos claros de reprodução literal são despublicados durante a análise, não depois.
        </p>
      </PolicySection>

      <PolicySection title="5. Se o conteúdo denunciado for seu">
        <p>
          Você é avisado, vê o motivo, e pode apresentar contra-notificação com a evidência da sua
          autorização ou titularidade. Não removemos permanentemente sem dar essa oportunidade, exceto
          em casos de falsificação evidente.
        </p>
        <p>
          <strong>Reincidência.</strong> Contas com violações repetidas e confirmadas perdem o acesso à
          publicação e, na sequência, à plataforma. O critério é violação confirmada, não denúncia
          recebida — uma denúncia infundada não conta contra ninguém.
        </p>
      </PolicySection>

      <PolicySection title="6. Sobre a marca KAIJU">
        <p>
          O nome, o símbolo e o sistema visual da KAIJU são nossos. As esculturas, os personagens e os
          grafismos originais também. Não autorizamos a reprodução deles fora da plataforma.
        </p>
        <p>
          A palavra "kaiju" (怪獣) é um termo comum do japonês, e não reivindicamos direito sobre ela
          como palavra — apenas sobre a marca no nosso segmento e sobre a nossa identidade visual.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
