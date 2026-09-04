import type { Metadata } from "next";
import { ApplicationShell } from "@/components/apply-form";
import { Notice, SectionHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Publicar uma vaga",
  description: "Como obter acesso de contratante no quadro de vagas KAIJU: requisitos e prazo de análise.",
  alternates: { canonical: "/trabalhos/contratar" },
};

export default function RecruiterApplicationPage() {
  return (
    <ApplicationShell
      breadcrumbHref="/trabalhos"
      breadcrumbLabel="Vagas"
      label="Para contratantes"
      title="Acesso de contratante"
      intro="Publicar vagas é gratuito. Não é imediato: você precisa comprovar que existe uma empresa por trás da vaga, e uma pessoa da nossa equipe analisa antes de a vaga ir ao ar."
      requirements={[
        { title: "CNPJ ativo", body: "Razão social e situação cadastral regular. Aceitamos MEI." },
        { title: "Vínculo com a empresa", body: "Contrato social, certificado MEI, ou procuração que ligue você à pessoa jurídica." },
        { title: "Contato verificável", body: "E-mail em domínio próprio da empresa, ou um canal público que possamos conferir." },
        { title: "Descrição real da vaga", body: "O que a pessoa vai fazer, a modalidade e, de preferência, a faixa de remuneração. Vaga sem faixa recebe menos candidatura — e é justo que receba." },
      ]}
      documentNote="Documentos de identificação e comprovação empresarial são usados apenas para a decisão de aprovação, guardados em armazenamento privado e apagados em até 90 dias. O que fica registrado é o resultado da análise, não o documento."
    >
      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Regras" title="O que não é permitido" />
        <Notice tone="blocking" title="Cobrança de candidato encerra a conta, sem aviso">
          Não é permitido cobrar nada de quem se candidata: taxa de cadastro, curso obrigatório, compra
          de material, "reserva de vaga", ou qualquer outro nome. Também não é permitido pedir dados
          bancários ou documentos antes de uma entrevista real.
          <br /><br />
          Essa regra existe porque o custo de um golpe de recrutamento cai inteiro sobre quem está
          procurando trabalho — frequentemente sobre quem mais precisa dele.
        </Notice>
      </section>
    </ApplicationShell>
  );
}
