import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { explainProfile } from "@/server/domain/recommender";
import { PrivacyControls } from "@/components/account/forms";
import { exportDataAction, forgetBehaviourAction, requestDeletionAction } from "../actions";
import { Label, SectionHead, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Privacidade e dados", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/privacidade");

  const [taste, references, consents, csrfExport, csrfForget, csrfDelete] = await Promise.all([
    explainProfile({ userId: auth.user.id }),
    db.referenceImage.count({ where: { userId: auth.user.id, deletedAt: null } }),
    db.consentRecord.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" } }),
    csrfToken("account.export"),
    csrfToken("account.forget"),
    csrfToken("account.delete"),
  ]);

  // One consent record per kind — the most recent decision wins.
  const latestConsent = new Map<string, (typeof consents)[number]>();
  for (const c of consents) if (!latestConsent.has(c.kind)) latestConsent.set(c.kind, c);

  return (
    <div>
      <Label>Seus dados</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Privacidade e dados</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Tudo o que a plataforma sabe sobre você, o que faz com isso, e os botões para mudar de ideia.
      </p>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="O que guardamos" title="Seus dados hoje" />
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Dado</th>
                <th scope="col">Para quê</th>
                <th scope="col">Quem vê</th>
                <th scope="col">Retenção</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Nome e e-mail", "Identificar sua conta e falar sobre pedidos.", "Você e nossa equipe de suporte.", "Enquanto a conta existir."],
                ["Medidas", "Cortar a peça no seu corpo.", "Você e o ateliê que produz sua peça — sem seu nome junto.", "Enquanto a conta existir."],
                [`Referências enviadas (${references})`, "Gerar a ficha técnica da peça.", "Você e o ateliê designado ao seu pedido.", "2 anos, ou até você apagar."],
                ["Endereço", "Entregar o pedido.", "Você, o suporte e a transportadora.", "Enquanto a conta existir."],
                ["Histórico de navegação", "Recomendar peças que combinem com seu gosto.", "Apenas o sistema de recomendação.", "Perde força em 45 dias; apagável a qualquer momento."],
                ["Pedidos e pagamentos", "Registro fiscal e atendimento.", "Você, o suporte e o financeiro.", "Prazo legal para documento fiscal."],
              ].map(([what, why, who, retention]) => (
                <tr key={what}>
                  <td style={{ fontWeight: 600 }}>{what}</td>
                  <td>{why}</td>
                  <td>{who}</td>
                  <td>{retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Inteligência artificial" title="O que fazemos — e não fazemos — com suas imagens" />
        <Notice tone="info" title="Suas imagens não treinam modelos">
          As referências que você envia são usadas para uma coisa só: gerar a ficha técnica da sua peça
          e permitir que o ateliê execute. Elas não são usadas para treinar nenhum modelo, não são
          vendidas, não alimentam publicidade e não são compartilhadas com ninguém além do ateliê
          designado ao seu pedido. Quando enviamos uma imagem a um provedor de IA para análise, é
          apenas para essa análise — e você pode escolher o modo de ficha manual, sem envio nenhum.
        </Notice>
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>
            Consentimento para melhoria de modelo:{" "}
            <strong>{latestConsent.get("AI_IMPROVEMENT")?.granted ? "concedido" : "não concedido"}</strong>{" "}
            — o padrão é não conceder, e não pedimos que mude isso.
          </p>
        </div>
      </section>

      {taste.length > 0 ? (
        <section style={{ marginTop: "2.5rem" }}>
          <SectionHead label="Recomendações" title="Seu perfil de gosto, por extenso" />
          <div className="panel-sunk" style={{ padding: "1.25rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginBottom: "1rem" }}>
              Não é uma caixa-preta: é uma lista de características de roupa com um número de afinidade
              cada, calculada do que você olhou e comprou. Quanto maior, mais peso na recomendação.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
              {taste.map((t) => (
                <li key={t.facet} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.9rem", paddingBottom: "0.4rem", borderBottom: "1px solid var(--color-rule)" }}>
                  <span>{t.label}</span>
                  <span className="t-mono" style={{ color: "var(--color-ink-faint)" }}>{t.score}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Seus controles" title="Exportar, apagar, sair" />
        <PrivacyControls
          exportAction={exportDataAction}
          forgetAction={forgetBehaviourAction}
          deleteAction={requestDeletionAction}
          csrfExport={csrfExport}
          csrfForget={csrfForget}
          csrfDelete={csrfDelete}
        />
      </section>

      <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
        Detalhes completos na <Link href="/politicas/privacidade" className="link">Política de privacidade</Link>.
      </p>
    </div>
  );
}
