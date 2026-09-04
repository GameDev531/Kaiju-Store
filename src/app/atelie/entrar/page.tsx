import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { ProducerApplicationForm } from "@/components/atelier/forms";
import { applyAsProducerAction } from "../actions";
import { SPECIALIZATION_OPTIONS } from "../constants";
import { Breadcrumbs, Label, Notice, SectionHead } from "@/components/ui";
import { VERIFICATION_META, type VerificationLevel } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Trabalhe como ateliê",
  description:
    "Receba trabalhos de costura com ficha técnica completa, medidas conferidas e pagamento acordado antes de aceitar.",
  alternates: { canonical: "/atelie/entrar" },
};
export const dynamic = "force-dynamic";

export default async function ProducerOnboardingPage() {
  const auth = await getAuth();
  const existing = auth
    ? await db.producer.findUnique({ where: { userId: auth.user.id }, select: { id: true } })
    : null;
  if (existing) redirect("/atelie/painel");

  const csrf = auth ? await csrfToken("atelier.apply") : null;

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Trabalhe como ateliê" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Para costureiros, modelistas e ateliês</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>
          Trabalho com ficha pronta, medida conferida e valor combinado antes
        </h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          A pior parte de costurar sob encomenda não é costurar. É entender o que a pessoa quer,
          descobrir a medida no meio do caminho, e negociar preço depois de já ter começado.
          Aqui isso vem resolvido.
        </p>
      </header>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="O que muda" title="Como o trabalho chega até você" />
        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          {[
            {
              title: "Ficha técnica completa",
              body: "Tipo de peça, silhueta, manga, gola, fechamento, material, acabamento — e o que é incerto vem marcado como incerto, não escondido.",
            },
            {
              title: "Medidas já conferidas",
              body: "Em milímetros, com a origem declarada (auto-medida, profissional, ou tirada de uma peça) e a tolerância acordada com o cliente.",
            },
            {
              title: "Valor acordado antes",
              body: "Você vê quanto recebe pelo trabalho antes de aceitar. Sem negociação depois de começar.",
            },
            {
              title: "Canal para dúvida",
              body: "Travou em algo? Registra o impedimento e a produção pausa oficialmente até o cliente responder. O prazo não corre contra você.",
            },
            {
              title: "Você pode recusar",
              body: "Nenhum trabalho é imposto. Recusar não penaliza — só ajuda a calibrar o que te oferecemos.",
            },
            {
              title: "Sua capacidade, sua regra",
              body: "Você define quantas peças por semana e até que complexidade. A plataforma respeita esse limite.",
            },
          ].map((card) => (
            <div key={card.title} className="panel" style={{ padding: "1.25rem" }}>
              <p style={{ fontWeight: 650 }}>{card.title}</p>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.5rem", lineHeight: 1.55 }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Confiança" title="Níveis de verificação" />
        <p className="t-lede" style={{ marginBottom: "1.5rem" }}>
          Todo ateliê passa por análise humana antes de receber o primeiro pedido. O nível sobe com
          o histórico de entregas, não com o tempo de cadastro.
        </p>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nível</th>
                <th scope="col">O que significa</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(VERIFICATION_META) as VerificationLevel[]).map((level) => (
                <tr key={level}>
                  <td style={{ fontWeight: 650 }}>{VERIFICATION_META[level].label}</td>
                  <td>{VERIFICATION_META[level].publicMeaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Cadastro" title="Enviar meu cadastro" />
        {!auth ? (
          <div className="panel" style={{ padding: "1.75rem" }}>
            <p style={{ fontWeight: 650 }}>Você precisa de uma conta primeiro</p>
            <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", fontSize: "0.9rem" }}>
              O cadastro de ateliê é uma extensão da sua conta. Leva um minuto.
            </p>
            <div style={{ display: "flex", gap: "0.85rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
              <Link href="/cadastrar?next=/atelie/entrar" className="btn btn-primary">Criar conta</Link>
              <Link href="/entrar?next=/atelie/entrar" className="btn btn-outline">Já tenho conta</Link>
            </div>
          </div>
        ) : (
          <ProducerApplicationForm action={applyAsProducerAction} csrf={csrf!} specializations={SPECIALIZATION_OPTIONS} />
        )}
      </section>

      <div style={{ marginTop: "2.5rem", maxWidth: "70ch" }}>
        <Notice tone="info" title="Sobre pagamento e dados">
          O repasse é feito por ciclo de fechamento, sobre trabalhos entregues e aprovados na qualidade.
          Você recebe as referências visuais e as medidas do cliente — nunca o nome, o endereço ou o
          contato dele. Isso protege as duas pontas.
        </Notice>
      </div>
    </div>
  );
}
