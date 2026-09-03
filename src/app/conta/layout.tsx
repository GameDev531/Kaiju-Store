import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { logoutAction } from "@/app/(auth)/actions";
import { Label } from "@/components/ui";

const NAV = [
  { href: "/conta", label: "Visão geral" },
  { href: "/conta/pedidos", label: "Pedidos" },
  { href: "/conta/medidas", label: "Medidas" },
  { href: "/conta/enderecos", label: "Endereços" },
  { href: "/conta/colecao", label: "Minha coleção" },
  { href: "/conta/privacidade", label: "Privacidade e dados" },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta");

  return (
    <div className="wrap section">
      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 220px) minmax(0, 1fr)", alignItems: "start" }}>
        <aside>
          <Label>Sua conta</Label>
          <p style={{ fontWeight: 650, marginTop: "0.5rem", fontSize: "1.05rem" }}>{auth.user.displayName}</p>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", wordBreak: "break-all" }}>{auth.user.email}</p>

          {!auth.user.emailVerified ? (
            <p style={{ fontSize: "0.78rem", color: "var(--color-inferred)", marginTop: "0.5rem", fontWeight: 600 }}>
              ◐ E-mail ainda não verificado
            </p>
          ) : null}

          <nav aria-label="Navegação da conta" style={{ marginTop: "1.75rem" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.15rem" }}>
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "0.55rem 0.75rem",
                      textDecoration: "none",
                      fontSize: "0.9rem",
                      borderLeft: "2px solid transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {auth.user.roles.includes("PRODUCER") ? (
            <Link href="/atelie/painel" className="btn btn-quiet btn-sm btn-block" style={{ marginTop: "1.5rem" }}>
              Painel do ateliê
            </Link>
          ) : null}
          {auth.user.roles.some((r) => ["ADMIN", "SUPER_ADMIN", "MODERATOR", "SUPPORT", "FINANCE"].includes(r)) ? (
            <Link href="/admin" className="btn btn-quiet btn-sm btn-block" style={{ marginTop: "0.5rem" }}>
              Administração
            </Link>
          ) : null}

          <form action={logoutAction} style={{ marginTop: "1.5rem" }}>
            <button type="submit" className="btn btn-quiet btn-sm btn-block">Sair</button>
          </form>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
