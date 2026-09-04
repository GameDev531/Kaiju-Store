import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { evaluateEligibility, CampaignRuleSchema } from "@/server/domain/rewards";
import { Breadcrumbs, Label, SectionHead, Badge, EmptyState, Notice } from "@/components/ui";
import { RIGHTS_LABELS } from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Campanhas e colecionáveis",
  description:
    "Campanhas KAIJU: peças entregues desbloqueiam esculturas originais do estúdio. Regras calculadas no servidor sobre pedidos efetivamente concluídos.",
  alternates: { canonical: "/recompensas" },
};
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const auth = await getAuth();
  const campaigns = await db.campaign.findMany({
    where: { active: true, endsAt: { gte: new Date() } },
    include: { rewards: true },
    orderBy: { endsAt: "asc" },
  });

  const progress = auth
    ? await Promise.all(
        campaigns.map(async (c) => ({ id: c.id, eligibility: await evaluateEligibility(c.id, auth.user.id).catch(() => null) })),
      )
    : [];
  const progressById = new Map(progress.map((p) => [p.id, p.eligibility]));

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Campanhas" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Colecionáveis do estúdio</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Campanhas</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Peças entregues desbloqueiam objetos que não estão à venda: esculturas em resina, pins e
          patches desenhados e produzidos pelo nosso estúdio.
        </p>
      </header>

      <div style={{ marginTop: "2rem", maxWidth: "72ch" }}>
        <Notice tone="info" title="Todas as esculturas são criação original">
          As miniaturas são personagens da própria KAIJU, esculpidos internamente. Não vendemos nem
          damos réplicas de personagens de terceiros — nem como brinde.
        </Notice>
      </div>

      <section style={{ marginTop: "3rem" }}>
        {campaigns.length === 0 ? (
          <EmptyState
            mark="▲"
            title="Nenhuma campanha ativa agora"
            description="As campanhas são sazonais e por tiragem limitada. Quando uma abrir, ela aparece aqui e na sua conta."
            action={<Link href="/loja" className="btn btn-outline">Ver a loja</Link>}
          />
        ) : (
          <div style={{ display: "grid", gap: "2rem" }}>
            {campaigns.map((campaign) => {
              const rule = safeRule(campaign.ruleJson);
              const eligibility = progressById.get(campaign.id);
              const remaining = campaign.maxGrantsTotal !== null ? campaign.maxGrantsTotal - campaign.grantedCount : null;

              return (
                <article key={campaign.id} className="panel corner-ticks" style={{ padding: "1.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
                    <div style={{ maxWidth: "52ch" }}>
                      <Badge tone="shu">Campanha ativa</Badge>
                      <h2 className="t-title" style={{ marginTop: "0.85rem" }}>{campaign.name}</h2>
                      <p style={{ color: "var(--color-ink-soft)", marginTop: "0.6rem", lineHeight: 1.65 }}>
                        {campaign.description}
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="t-label">Encerra em</p>
                      <p style={{ fontWeight: 700, marginTop: "0.25rem" }}>
                        {campaign.endsAt.toLocaleDateString("pt-BR")}
                      </p>
                      {remaining !== null ? (
                        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.35rem" }}>
                          {remaining} de {campaign.maxGrantsTotal} restantes
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* ---- the rules, stated plainly ---- */}
                  {rule ? (
                    <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "1.5rem" }}>
                      <Label>Regras exatas</Label>
                      <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <li>
                          <strong>{rule.minItems} peças</strong> em pedidos <strong>entregues</strong>, dentro de{" "}
                          <strong>{rule.windowDays} dias</strong>.
                        </li>
                        <li>
                          Um pedido só conta <strong>{rule.settlementDays} dias após a entrega</strong> — é o prazo em
                          que você ainda pode devolver.
                        </li>
                        <li>Pedidos devolvidos, reembolsados ou em contestação não contam.</li>
                        <li>Um item por pessoa nesta campanha.</li>
                      </ul>
                      <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.85rem", lineHeight: 1.55 }}>
                        A qualificação é calculada no servidor a partir dos seus pedidos reais. Nada do
                        que sai do seu navegador influencia esse cálculo — e se um pedido que qualificou
                        for reembolsado depois, o item é revogado.
                      </p>
                    </div>
                  ) : null}

                  {/* ---- personal progress ---- */}
                  {auth && eligibility ? (
                    <div style={{ marginTop: "1.5rem" }}>
                      <Label>Seu progresso</Label>
                      {eligibility.progress.map((p) => (
                        <div key={p.label} style={{ marginTop: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                            <span>{p.label}</span>
                            <span className="t-mono">{p.current} / {p.target}</span>
                          </div>
                          <div
                            style={{ height: 8, background: "var(--color-paper-sunk)", marginTop: "0.35rem", border: "1px solid var(--color-rule)" }}
                            role="progressbar"
                            aria-valuenow={p.current}
                            aria-valuemin={0}
                            aria-valuemax={p.target}
                            aria-label={p.label}
                          >
                            <div style={{ height: "100%", width: `${Math.min(100, (p.current / p.target) * 100)}%`, background: "var(--color-shu)" }} />
                          </div>
                        </div>
                      ))}
                      <p style={{ fontSize: "0.875rem", marginTop: "0.85rem", fontWeight: eligibility.eligible ? 650 : 400, color: eligibility.eligible ? "var(--color-observed)" : "var(--color-ink-soft)" }}>
                        {eligibility.eligible
                          ? "✓ Você já tem direito ao item desta campanha. Ele vai junto com o próximo envio."
                          : eligibility.blockedReason}
                      </p>
                    </div>
                  ) : !auth ? (
                    <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
                      <Link href="/entrar?next=/recompensas" className="link">Entre na sua conta</Link> para ver o seu progresso.
                    </p>
                  ) : null}

                  {/* ---- the items ---- */}
                  {campaign.rewards.length > 0 ? (
                    <div style={{ marginTop: "1.75rem" }}>
                      <Label>O que você desbloqueia</Label>
                      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: "0.75rem" }}>
                        {campaign.rewards.map((reward) => {
                          const available = reward.inventoryTotal - reward.inventoryGranted - reward.inventoryReserved;
                          return (
                            <div key={reward.id} className="panel-sunk" style={{ padding: "1.15rem" }}>
                              <p style={{ fontWeight: 650 }}>{reward.name}</p>
                              {reward.description ? (
                                <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", lineHeight: 1.5 }}>
                                  {reward.description}
                                </p>
                              ) : null}
                              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                                <Badge tone="blueprint">
                                  {RIGHTS_LABELS[reward.rightsBasis as keyof typeof RIGHTS_LABELS]?.label ?? reward.rightsBasis}
                                </Badge>
                                <Badge>{available > 0 ? `${available} disponíveis` : "Esgotado"}</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function safeRule(json: string) {
  const parsed = CampaignRuleSchema.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : null;
}
