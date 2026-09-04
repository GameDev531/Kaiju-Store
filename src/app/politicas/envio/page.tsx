import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/policy";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Política de envio",
  description: "Prazos, custos, rastreio, e o que acontece quando uma encomenda atrasa, volta ou se perde.",
  alternates: { canonical: "/politicas/envio" },
};

export default function ShippingPolicyPage() {
  return (
    <PolicyPage
      label="Política"
      title="Envio"
      updated="1 de setembro de 2026"
      summary="O prazo total é produção mais transporte, e mostramos os dois separadamente antes de você pagar. Quando algo dá errado no caminho, a conta é nossa."
    >
      <PolicySection title="1. O prazo, decomposto">
        <p>
          Um pedido sob medida tem duas partes de prazo, e juntá-las numa promessa única é como se
          mente sobre entrega:
        </p>
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Produção:</strong> de 7 a 40 dias, conforme a complexidade. O intervalo exato aparece
            no seu orçamento antes do pagamento. Começa a contar quando um ateliê <em>aceita</em> o
            trabalho, não quando você paga.
          </li>
          <li>
            <strong>Transporte:</strong> de 4 a 11 dias úteis conforme a região, ou cerca da metade
            disso na modalidade expressa. O valor e o prazo aparecem no checkout, calculados para o seu CEP.
          </li>
        </ul>
        <p>
          Entre o pagamento e o aceite do ateliê costumam passar de algumas horas a dois dias. Se
          passar disso, você vê o pedido em "Buscando ateliê" e nós agimos — não deixamos parado.
        </p>
      </PolicySection>

      <PolicySection title="2. Rastreio">
        <p>
          O código aparece na página do pedido assim que a etiqueta é emitida, e você recebe um aviso.
          Também dá para consultar sem entrar na conta em{" "}
          <Link href="/rastrear" className="link">rastrear pedido</Link>, com o código que começa com KJ —
          essa consulta mostra só o andamento, nunca dados pessoais.
        </p>
      </PolicySection>

      <PolicySection title="3. Quando dá errado">
        <ul style={{ paddingLeft: "1.2rem", display: "grid", gap: "0.6rem" }}>
          <li>
            <strong>Tentativa de entrega sem sucesso.</strong> A transportadora costuma tentar mais de
            uma vez. Você é avisado a cada tentativa registrada.
          </li>
          <li>
            <strong>Devolvido ao remetente.</strong> Normalmente endereço incompleto ou ausência. Nós
            confirmamos o endereço com você e reenviamos <strong>sem cobrar o segundo frete</strong> na
            primeira ocorrência.
          </li>
          <li>
            <strong>Extraviado.</strong> Abrimos a investigação com a transportadora. Você não precisa
            esperar por ela: refazemos a peça ou reembolsamos, à sua escolha, e a disputa com a
            transportadora é problema nosso.
          </li>
          <li>
            <strong>Chegou danificado.</strong> Fotografe a embalagem e a peça e abra um chamado.
            Refação ou reembolso, sem custo. Ver{" "}
            <Link href="/politicas/trocas" className="link">política de trocas e refação</Link>.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="4. Endereço">
        <p>
          Confira antes de finalizar. Depois que a etiqueta é emitida, mudar o destino depende da
          transportadora e nem sempre é possível. Se o endereço estiver errado e a encomenda voltar,
          o primeiro reenvio é por nossa conta.
        </p>
      </PolicySection>

      <PolicySection title="5. Onde entregamos">
        <p>
          Todo o território brasileiro. Envio internacional ainda não está disponível — quando estiver,
          será anunciado com prazo e custo reais, não como "em breve" permanente.
        </p>
      </PolicySection>

      <Notice tone="info" title="Sobre datas comemorativas">
        Não prometemos entrega para uma data específica em pedidos sob medida. Se a peça é para uma
        data, fale com o suporte antes de comprar: dizemos se dá, e se não der, dizemos que não dá.
      </Notice>
    </PolicyPage>
  );
}
