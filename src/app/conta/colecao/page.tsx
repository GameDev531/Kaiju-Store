import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { Label, SectionHead, EmptyState, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Minha coleção", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/colecao");

  const grants = await db.rewardGrant.findMany({
    where: { userId: auth.user.id, status: { in: ["GRANTED", "RESERVED", "SHIPPED"] } },
    include: { reward: true, campaign: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <Label>Colecionáveis</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Minha coleção</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Itens desbloqueados por campanhas. Cada um segue junto com o próximo envio.
      </p>

      <div style={{ marginTop: "2.5rem" }}>
        {grants.length === 0 ? (
          <EmptyState
            mark="▲"
            title="Sua coleção está vazia"
            description="Campanhas ativas desbloqueiam esculturas originais e itens da casa. A qualificação é calculada sobre pedidos entregues e sem devolução."
            action={<Link href="/recompensas" className="btn btn-primary">Ver campanhas ativas</Link>}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {grants.map((g) => (
              <li key={g.id} className="panel corner-ticks" style={{ padding: "1.25rem" }}>
                <Badge tone="shu">{g.campaign.name}</Badge>
                <p style={{ fontWeight: 650, marginTop: "0.85rem" }}>{g.reward.name}</p>
                {g.reward.description ? (
                  <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", lineHeight: 1.5 }}>
                    {g.reward.description}
                  </p>
                ) : null}
                <p className="t-mono" style={{ fontSize: "0.72rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
                  {g.status === "SHIPPED" ? "Enviado" : "Reservado para o próximo envio"} ·{" "}
                  {g.createdAt.toLocaleDateString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
