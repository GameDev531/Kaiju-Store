import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { AddressForm } from "@/components/account/forms";
import { saveAddressAction } from "../actions";
import { Label, SectionHead, EmptyState, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Meus endereços", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/enderecos");

  const [addresses, csrf] = await Promise.all([
    db.address.findMany({
      where: { userId: auth.user.id, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    csrfToken("account.address"),
  ]);

  return (
    <div>
      <Label>Entrega</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Meus endereços</h1>

      <section style={{ marginTop: "2rem" }}>
        <SectionHead label="Salvos" title="Endereços" />
        {addresses.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum endereço cadastrado" description="Você precisa de um endereço para calcular o frete e concluir um pedido." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
            {addresses.map((a) => (
              <li key={a.id} className="panel" style={{ padding: "1.15rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontWeight: 650 }}>{a.label}</p>
                    <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.25rem" }}>
                      {a.recipient}
                      <br />
                      {a.line1}{a.line2 ? `, ${a.line2}` : ""}
                      <br />
                      {a.district ? `${a.district} · ` : ""}{a.city}/{a.state} · {formatCep(a.postalCode)}
                    </p>
                  </div>
                  {a.isDefault ? <Badge tone="ink">Padrão</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Novo" title="Adicionar endereço" />
        <AddressForm action={saveAddressAction} csrf={csrf} />
      </section>
    </div>
  );
}

const formatCep = (raw: string): string => (raw.length === 8 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw);
