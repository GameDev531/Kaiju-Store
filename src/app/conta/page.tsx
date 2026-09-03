import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { explainProfile } from "@/server/domain/recommender";
import { evaluateEligibility } from "@/server/domain/rewards";
import { Label, SectionHead, Badge, EmptyState, Notice, MoneyText } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta");

  const [orders, designs, notifications, taste, campaigns] = await Promise.all([
    db.order.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, reference: true, status: true, totalCents: true, currency: true, createdAt: true },
    }),
    db.design.findMany({
      where: { userId: auth.user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, status: true, updatedAt: true },
    }),
    db.notification.findMany({
      where: { userId: auth.user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    explainProfile({ userId: auth.user.id }),
    db.campaign.findMany({
      where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
      take: 2,
      select: { id: true, name: true, description: true },
    }),
  ]);

  const campaignProgress = await Promise.all(
    campaigns.map(async (c) => ({
      campaign: c,
      eligibility: await evaluateEligibility(c.id, auth.user.id).catch(() => null),
    })),
  );

  return (
    <div>
      <Label>Visão geral</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Olá, {auth.user.displayName.split(" ")[0]}</h1>

      {notifications.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <SectionHead label="Novidades" title="Precisa da sua atenção" />
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
            {notifications.map((n) => (
              <li key={n.id} className="panel" style={{ padding: "1rem" }}>
                <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{n.title}</p>
                <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.25rem" }}>{n.body}</p>
                {n.href ? <Link href={n.href} className="link" style={{ fontSize: "0.85rem", display: "inline-block", marginTop: "0.5rem" }}>Abrir</Link> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Últimos pedidos" title="Pedidos" action={{ href: "/conta/pedidos", label: "Ver todos" }} />
        {orders.length === 0 ? (
          <EmptyState
            mark="◇"
            title="Nenhum pedido ainda"
            description="Quando você fizer o primeiro, ele aparece aqui com o acompanhamento completo da produção."
            action={<Link href="/criar" className="btn btn-primary">Criar minha peça</Link>}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/pedido/${o.reference}`} className="panel" style={{ display: "flex", padding: "1rem", justifyContent: "space-between", gap: "1rem", textDecoration: "none", flexWrap: "wrap" }}>
                  <div>
                    <p className="t-mono" style={{ fontWeight: 700 }}>{o.reference}</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
                      {o.createdAt.toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Badge>{ORDER_STATUS_LABELS[o.status as OrderStatus].pt}</Badge>
                    <p style={{ fontWeight: 600, marginTop: "0.35rem" }}>
                      <MoneyText cents={o.totalCents} currency={o.currency} />
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Estúdio" title="Meus designs" action={{ href: "/criar", label: "Novo design" }} />
        {designs.length === 0 ? (
          <EmptyState mark="✎" title="Nenhum design salvo" description="Toda peça sob medida começa como um design aqui." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
            {designs.map((d) => (
              <li key={d.id}>
                <Link href={`/criar/${d.id}`} className="panel" style={{ display: "flex", padding: "1rem", justifyContent: "space-between", gap: "1rem", textDecoration: "none" }}>
                  <span style={{ fontWeight: 600 }}>{d.title}</span>
                  <Badge>{d.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {campaignProgress.some((c) => c.eligibility) ? (
        <section style={{ marginTop: "2.5rem" }}>
          <SectionHead label="Campanhas" title="Colecionáveis" action={{ href: "/recompensas", label: "Ver campanhas" }} />
          {campaignProgress.map(({ campaign, eligibility }) =>
            eligibility ? (
              <div key={campaign.id} className="panel" style={{ padding: "1.25rem", marginBottom: "0.85rem" }}>
                <p style={{ fontWeight: 650 }}>{campaign.name}</p>
                {eligibility.progress.map((p) => (
                  <div key={p.label} style={{ marginTop: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span>{p.label}</span>
                      <span className="t-mono">{p.current} / {p.target}</span>
                    </div>
                    <div
                      style={{ height: 6, background: "var(--color-paper-sunk)", marginTop: "0.35rem", border: "1px solid var(--color-rule)" }}
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
                <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.85rem" }}>
                  {eligibility.eligible ? "Você já tem direito ao item desta campanha." : eligibility.blockedReason}
                </p>
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      {taste.length > 0 ? (
        <section style={{ marginTop: "2.5rem" }}>
          <SectionHead label="Transparência" title="O que sabemos do seu gosto" action={{ href: "/conta/privacidade", label: "Gerenciar" }} />
          <div className="panel-sunk" style={{ padding: "1.25rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginBottom: "1rem" }}>
              Isto é o perfil que usamos para recomendar peças. Ele vem só do que você visualizou,
              buscou e comprou aqui, e perde força com o tempo. Você pode apagá-lo quando quiser.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {taste.map((t) => (
                <span key={t.facet} className="badge">
                  {t.label} <span className="t-mono" style={{ opacity: 0.6 }}>{t.score}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
