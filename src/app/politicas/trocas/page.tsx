import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Trocas, refação e reembolso",
  description:
    "Quem arca com o quê quando uma peça sob medida sai diferente do aprovado: defeito, erro de execução, erro de medida, dano no transporte.",
  alternates: { canonical: "/politicas/trocas" },
};

export default function ReturnsPolicyPage() {
  return (
    <PolicyPage
      label="Política"
      title="Trocas, refação e reembolso"
      updated="1 de setembro de 2026"
      summary="Peça feita sob medida não tem devolução por arrependimento como uma peça de prateleira. Em compensação, quando o erro é nosso ou do ateliê, o conserto é por nossa conta — e esta página diz exatamente onde fica cada linha."
    >
      <Notice tone="attention" title="A regra que governa tudo aqui">
        A <strong>ficha técnica que você aprovou</strong> é o contrato de produção. Ela fica registrada
        com uma assinatura digital da versão exata. Comparar a peça recebida com essa ficha é o que
        transforma "ficou diferente do que eu imaginei" numa pergunta com resposta objetiva.
      </Notice>

      <PolicySection title="1. Antes de qualquer coisa: os 7 dias">
        <p>
          Você tem <strong>7 dias corridos a partir da entrega</strong> para conferir a peça e abrir um
          chamado. Vista, meça, olhe as costuras. Depois desse prazo o pedido é considerado aceito, e
          passamos a tratar eventuais problemas como desgaste de uso, não como defeito de fabricação.
        </p>
        <p>
          Guarde a embalagem até ter certeza. Em caso de refação ou devolução, ela ajuda.
        </p>
      </PolicySection>

      <PolicySection title="2. Quando o conserto é por nossa conta">
        <p>Nestes casos você não paga nada, e a escolha entre refação e reembolso é sua:</p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Defeito de fabricação.</strong> Costura falhando, ponto solto, zíper que não corre,
            forro descosturando, tecido com falha.
          </li>
          <li>
            <strong>Execução divergente da ficha.</strong> Manga diferente da aprovada, bolso ausente,
            cor trocada, material substituído sem a sua autorização.
          </li>
          <li>
            <strong>Medida fora da tolerância acordada.</strong> A tolerância padrão é ±15 mm e fica
            registrada na sua ficha. Se a peça entregue estiver fora dela em relação às medidas que
            você informou, o erro é de execução.
          </li>
          <li>
            <strong>Dano no transporte.</strong> Peça que chega rasgada, molhada ou com a embalagem
            violada. Fotografe antes de desembalar por completo, se possível.
          </li>
          <li>
            <strong>Extravio.</strong> Encomenda que a transportadora não entrega. Refazemos ou
            reembolsamos, você escolhe.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="3. Quando o caso é diferente">
        <p>
          <strong>Medida informada errada.</strong> Se a peça foi executada exatamente conforme os
          números que você forneceu, mas eles não correspondem ao seu corpo, o ateliê fez o trabalho
          certo. Nesses casos oferecemos <strong>ajuste com custo reduzido</strong> — você paga a mão de
          obra do ajuste, não uma peça nova — desde que a alteração seja tecnicamente possível na peça
          já cortada. Um erro de 2 cm na cintura costuma ser ajustável; um erro de 10 cm no comprimento
          total, muitas vezes não.
        </p>
        <p>
          <strong>Mudou de ideia sobre o design.</strong> A ficha aprovada foi executada corretamente,
          mas você queria outra coisa. Não há reembolso — o tecido foi cortado para você e o ateliê foi
          pago pelo trabalho. É exatamente por isso que a etapa de aprovação existe e insiste tanto que
          você leia cada linha.
        </p>
        <p>
          <strong>"Não ficou igual à referência."</strong> Uma foto de referência não é um molde.
          Trabalhamos com o que a ficha diz, e a ficha marca explicitamente o que foi <em>observado</em>,
          o que foi <em>deduzido</em> e o que foi <em>sugerido pelo ateliê</em>. Se a divergência está
          num campo marcado como observado, é caso de refação. Se está num campo que a ficha declarava
          incerto, e você aprovou assim, não é.
        </p>
      </PolicySection>

      <PolicySection title="4. Cancelamento antes da produção">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li><strong>Antes do pagamento:</strong> cancele à vontade, sem custo.</li>
          <li><strong>Pago, sem ateliê designado:</strong> cancelamento com reembolso integral.</li>
          <li><strong>Ateliê aceitou, materiais não comprados:</strong> reembolso integral.</li>
          <li>
            <strong>Materiais já comprados, antes do corte:</strong> reembolso menos o custo dos
            materiais, que ficam com o ateliê.
          </li>
          <li>
            <strong>Depois do corte:</strong> o tecido está comprometido e não volta a ser tecido.
            A partir daqui o cancelamento é uma conversa com o suporte, avaliada caso a caso.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="5. Como abrir um chamado">
        <p>
          Pela página do seu pedido, em "Relatar um problema". Peça, e isso ajuda muito:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.5rem" }}>
          <li>Fotos do problema em luz natural, incluindo uma foto da peça inteira.</li>
          <li>Para divergência de medida: a foto da fita métrica sobre a peça, no ponto medido.</li>
          <li>Qual linha da ficha aprovada você entende que não foi cumprida.</li>
        </ul>
        <p>
          Respondemos em até 48 horas úteis com uma decisão ou com um pedido de informação adicional.
          Se a análise envolver o ateliê, ele também é ouvido — e as fotos de produção que ele registrou
          durante a execução fazem parte da avaliação.
        </p>
      </PolicySection>

      <PolicySection title="6. O que não prometemos">
        <p>
          Não prometemos "reprodução perfeita" de nenhuma referência, e desconfie de quem promete.
          Prometemos execução conforme uma ficha técnica que você leu e aprovou, dentro de uma
          tolerância declarada, com conferência de medidas registrada no controle de qualidade.
        </p>
        <p>
          Cor é o caso mais frequente de expectativa frustrada: a tela do seu celular, a luz da foto
          original e a luz onde você vai usar a peça são três coisas diferentes. Se a cor exata for
          crítica para você, peça ao ateliê uma foto do tecido físico antes do corte — isso está
          incluído em todo pedido sob medida e não custa nada.
        </p>
      </PolicySection>

      <PolicySection title="7. Peças de pronta-entrega">
        <p>
          Itens que não são feitos sob medida seguem o direito de arrependimento previsto no Código de
          Defesa do Consumidor: <strong>7 dias corridos a partir do recebimento</strong>, com a peça sem
          uso e com etiquetas. Nesse caso o frete de devolução é por nossa conta.
        </p>
      </PolicySection>

      <Notice tone="info" title="Este documento evolui">
        Quando mudarmos algo aqui, a versão anterior continua valendo para pedidos já feitos sob ela.
        Você não fica preso a uma regra que mudou depois da sua compra. Veja também a{" "}
        <Link href="/politicas/envio" className="link">política de envio</Link>.
      </Notice>
    </PolicyPage>
  );
}
