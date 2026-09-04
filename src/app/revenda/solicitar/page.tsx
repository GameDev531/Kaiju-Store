import type { Metadata } from "next";
import { ApplicationShell } from "@/components/apply-form";
import { Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Solicitar cadastro de revenda",
  description: "Requisitos para a condição de atacado KAIJU: CNPJ, vínculo com a empresa e volume.",
  alternates: { canonical: "/revenda/solicitar" },
};

export default function WholesaleApplicationPage() {
  return (
    <ApplicationShell
      breadcrumbHref="/revenda"
      breadcrumbLabel="Revenda"
      label="Para lojistas"
      title="Cadastro de revenda"
      intro="Condição de atacado sobre o catálogo pronta-entrega, para quem tem loja física ou online e quer levar as peças da KAIJU ao próprio público."
      requirements={[
        { title: "CNPJ ativo", body: "Razão social e situação cadastral regular. MEI é aceito." },
        { title: "Vínculo com a empresa", body: "Contrato social, certificado MEI ou equivalente." },
        { title: "Prova de que a loja opera", body: "Endereço da loja física, perfil comercial ativo, ou site com catálogo próprio." },
        { title: "Volume pretendido", body: "Uma estimativa realista. O percentual de desconto e o pedido mínimo são definidos a partir dela." },
      ]}
      documentNote="Documentos empresariais são usados apenas para a decisão de aprovação e apagados em até 90 dias. Guardamos o resultado da análise e o percentual acordado, não o documento."
    >
      <section style={{ marginTop: "2.5rem" }}>
        <Notice tone="info" title="Peças sob medida não entram na condição">
          Uma peça feita sob medida individual consome o mesmo tempo de ateliê independentemente de
          quantas você pedir — não há escala para diluir. Para produção em lote com modelagem única,
          existe um caminho B2B separado; mencione isso no seu e-mail.
        </Notice>
      </section>
    </ApplicationShell>
  );
}
