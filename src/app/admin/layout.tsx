import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { isStaff } from "@/server/auth/rbac";
import { securityEvent } from "@/server/lib/logger";
import { Label, Notice } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Visão geral", permission: "admin.system.read" },
  { href: "/admin/pedidos", label: "Pedidos", permission: "admin.order.read" },
  { href: "/admin/atelies", label: "Ateliês", permission: "admin.producer.verify" },
  { href: "/admin/moderacao", label: "Moderação", permission: "content.moderate" },
  { href: "/admin/auditoria", label: "Auditoria", permission: "admin.audit.read" },
  { href: "/admin/saude", label: "Saúde do sistema", permission: "admin.system.read" },
] as const;

/**
 * The administrative shell.
 *
 * Authorisation here is a convenience for navigation only. Every page and every
 * action below re-checks its own permission server-side — hiding a link is not
 * access control, and this layout is not the boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/admin");

  if (!isStaff(auth.user.roles)) {
    securityEvent("authz.denied", { userId: auth.user.id, route: "/admin", reason: "not_staff" });
    redirect("/conta");
  }

  const { permissionsFor } = await import("@/server/auth/rbac");
  const permissions = permissionsFor(auth.user.roles);
  const visible = NAV.filter((item) => permissions.has(item.permission));

  return (
    <div className="wrap-wide section">
      {!auth.user.mfaEnrolled ? (
        <div style={{ marginBottom: "2rem" }}>
          <Notice tone="blocking" title="Sua conta administrativa está sem verificação em duas etapas">
            Ações sensíveis — reembolso, aprovação de repasse, concessão de papel — exigem MFA ativa e
            uma confirmação recente. Ative agora em{" "}
            <Link href="/conta/seguranca" className="link">Conta → Segurança</Link>.
          </Notice>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)", alignItems: "start" }}>
        <aside>
          <Label>Administração</Label>
          <p style={{ fontWeight: 650, marginTop: "0.5rem", fontSize: "0.95rem" }}>{auth.user.displayName}</p>
          <p className="t-mono" style={{ fontSize: "0.7rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>
            {auth.user.roles.join(" · ")}
          </p>

          <nav aria-label="Navegação administrativa" style={{ marginTop: "1.75rem" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.15rem" }}>
              {visible.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} style={{ display: "block", padding: "0.5rem 0.7rem", textDecoration: "none", fontSize: "0.875rem" }}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="panel-sunk" style={{ padding: "0.85rem", marginTop: "1.75rem" }}>
            <p className="t-label">Registro</p>
            <p style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.4rem", lineHeight: 1.5 }}>
              Toda ação sensível daqui é registrada com quem, o quê, quando, o alvo, o estado anterior,
              o novo e o motivo.
            </p>
          </div>

          <Link href="/conta" className="btn btn-quiet btn-sm btn-block" style={{ marginTop: "1.25rem" }}>
            Voltar à minha conta
          </Link>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
