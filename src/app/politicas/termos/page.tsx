import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "As regras de uso da plataforma KAIJU para clientes, ateliês, criadores e contratantes.",
  alternates: { canonical: "/politicas/termos" },
};

export default function TermsPage() {
  return (
    <PolicyPage
      label="Documento"
      title="Termos de uso"
      updated="1 de setembro de 2026"
      summary="O que você pode esperar de nós, e o que esperamos de você. Escrito para ser lido, não para ser tolerado."
    >
      <PolicySection title="1. O que a KAIJU é">
        <p>
          {SITE.legalName} opera uma plataforma que conecta pessoas que querem roupa sob medida a
          ateliês que a produzem, além de vender peças próprias. Somos parte marca, parte
          intermediário — e a distinção importa para responsabilidade:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Nas <strong>peças próprias</strong>, somos o fornecedor e respondemos integralmente.</li>
          <li>
            Nas <strong>peças sob medida</strong>, somos responsáveis pela ficha técnica, pela seleção e
            verificação do ateliê e pelo controle de qualidade. Não nos escondemos atrás do ateliê: se
            a peça sai errada, você trata conosco.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="2. Sua conta">
        <p>
          Você é responsável por manter sua senha em segurança e pelo que acontece na sua conta.
          Nunca pedimos sua senha por e-mail, telefone ou mensagem — se alguém pedir, é golpe.
        </p>
        <p>
          Uma conta por pessoa. Contas criadas em massa, com dados falsos, ou para contornar limites de
          campanha são encerradas.
        </p>
      </PolicySection>

      <PolicySection title="3. Pedidos sob medida">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            A <strong>ficha técnica que você aprova</strong> é o objeto do contrato. Leia antes de aprovar:
            é literalmente o que será executado.
          </li>
          <li>
            As <strong>medidas que você informa</strong> são sua responsabilidade. Damos o guia e a
            tolerância; conferir os números é seu.
          </li>
          <li>
            <strong>Preço e prazo</strong> aparecem antes do pagamento e não mudam depois, salvo se você
            mesmo alterar o pedido.
          </li>
          <li>
            <strong>Cancelamento</strong> segue a{" "}
            <Link href="/politicas/trocas" className="link">política de trocas e refação</Link>, que
            depende do estágio da produção.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="4. O que não produzimos">
        <p>Independentemente de quem peça ou de como o pedido seja formulado:</p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Equipamento de proteção balística ou que se apresente como tal.</li>
          <li>Uniformes de forças de segurança reais.</li>
          <li>Simbologia de ódio.</li>
          <li>Peças projetadas para ocultar armas.</li>
          <li>Falsificação de marca de terceiro.</li>
          <li>Reprodução de obra protegida para revenda.</li>
        </ul>
        <p>
          Detalhes sobre propriedade intelectual na{" "}
          <Link href="/politicas/direitos-autorais" className="link">política específica</Link>.
        </p>
      </PolicySection>

      <PolicySection title="5. Ateliês parceiros">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Você trabalha por conta própria. Não há vínculo empregatício com a KAIJU.</li>
          <li>Aceitar um trabalho é assumir a ficha, o prazo e o valor exibidos no momento do aceite.</li>
          <li>Recusar não penaliza. Aceitar e abandonar, sim.</li>
          <li>
            Dados do cliente que você recebe — medidas e referências — servem só para produzir aquela
            peça. Usá-los para qualquer outra coisa encerra a parceria.
          </li>
          <li>O repasse é feito por ciclo de fechamento sobre trabalhos entregues e aprovados.</li>
        </ul>
      </PolicySection>

      <PolicySection title="6. Criadores e contratantes">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Criadores declaram e respondem pela titularidade da arte que publicam.</li>
          <li>A comissão vigente aparece no painel antes de qualquer venda.</li>
          <li>
            Contratantes no quadro de vagas comprovam empresa antes de publicar, e não podem cobrar nada
            de candidatos — em nenhuma hipótese, sob nenhum nome.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="7. Limites e responsabilidade">
        <p>
          Nossa responsabilidade em relação a um pedido é limitada ao valor pago por ele — refação,
          reembolso, ou ambos conforme o caso. Não respondemos por lucros cessantes ou danos indiretos.
        </p>
        <p>
          Isso não afasta os direitos que o Código de Defesa do Consumidor garante a você, que
          prevalecem sobre qualquer cláusula aqui.
        </p>
      </PolicySection>

      <PolicySection title="8. Encerramento">
        <p>
          Você pode encerrar sua conta a qualquer momento. Podemos encerrar a sua em caso de fraude,
          violação repetida de direitos de terceiros, abuso de campanhas ou cupons, ou ameaça a outras
          pessoas na plataforma — sempre com o motivo informado e com direito a contestar.
        </p>
      </PolicySection>

      <PolicySection title="9. Mudanças e foro">
        <p>
          Alterações relevantes são comunicadas com antecedência. Pedidos já feitos seguem a versão
          vigente na data da compra. Foro da comarca do domicílio do consumidor, conforme a legislação
          aplicável.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
