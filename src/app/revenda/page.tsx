import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Label, SectionHead, Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Programa de revenda",
  description: "Condição de atacado para lojistas com CNPJ comprovado no catálogo pronta-entrega KAIJU.",
  alternates: { canonical: "/revenda" },
};

export default function WholesalePage() {
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Revenda" }]} />

      <Label>Para lojistas</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Programa de revenda</h1>
      <p className="t-lede" style={{ marginTop: "1rem" }}>
        Se você tem loja física ou online e quer levar as peças da KAIJU para o seu público,
        existe uma condição de atacado — com comprovação de que a loja existe.
      </p>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="A condição" title="Como funciona" />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
          {[
            { t: "Desconto por volume", d: "Percentual aplicado sobre o catálogo pronta-entrega, definido na aprovação do seu cadastro conforme o volume acordado." },
            { t: "Pedido mínimo", d: "Existe um mínimo de peças por pedido. Ele é informado antes de você fechar qualquer compra." },
            { t: "Sob encomenda não entra", d: "Peças feitas sob medida individual não têm condição de atacado — cada uma consome o mesmo tempo de ateliê. Para produção em lote, existe um caminho B2B separado." },
            { t: "Sem exclusividade", d: "Você não fica preso a território ou a volume mínimo mensal. Se parar de comprar, o cadastro simplesmente fica inativo." },
          ].map((item) => (
            <li key={item.t} className="panel" style={{ padding: "1.15rem" }}>
              <p style={{ fontWeight: 650 }}>{item.t}</p>
              <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", lineHeight: 1.6 }}>{item.d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Cadastro" title="O que pedimos" />
        <p style={{ color: "var(--color-ink-soft)", lineHeight: 1.65 }}>
          CNPJ ativo, razão social, e um documento que ligue você à empresa — contrato social,
          certificado MEI ou equivalente. Uma pessoa da nossa equipe analisa.
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="info" title="Por que a burocracia">
            Desconto de revenda sem verificação vira desconto para qualquer um que preencha um
            formulário — e aí não é mais um programa de revenda, é uma tabela de preço mais barata
            para quem descobriu o link. A conferência mantém a condição de pé para quem realmente
            revende.
          </Notice>
        </div>
        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="attention" title="Sobre os seus documentos">
            Documentos de identificação e comprovação empresarial são usados só para a decisão de
            aprovação, guardados em armazenamento privado e apagados em até 90 dias. O que fica é o
            resultado da análise, não o documento.
          </Notice>
        </div>
        <Link href="/revenda/solicitar" className="btn btn-primary" style={{ marginTop: "1.75rem" }}>
          Solicitar cadastro de revenda
        </Link>
      </section>
    </div>
  );
}
