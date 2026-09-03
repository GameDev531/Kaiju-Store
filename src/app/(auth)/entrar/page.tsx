import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuth, csrfToken } from "@/server/auth/session";
import { LoginForm } from "@/components/auth/forms";
import { loginAction, mfaAction } from "../actions";
import { Breadcrumbs, Label } from "@/components/ui";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta KAIJU para acompanhar pedidos, designs e medidas.",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuth();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/conta";
  if (auth) redirect(target);

  const [csrfLogin, csrfMfa] = await Promise.all([csrfToken("auth.login"), csrfToken("auth.mfa")]);

  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Entrar" }]} />
      <Label>Sua conta</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Entrar</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Seus designs, medidas e pedidos ficam aqui.
      </p>

      <div className="panel" style={{ padding: "1.75rem", marginTop: "2rem" }}>
        <LoginForm loginAction={loginAction} mfaAction={mfaAction} csrfLogin={csrfLogin} csrfMfa={csrfMfa} next={target} />
      </div>

      <p style={{ marginTop: "1.5rem", fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.6 }}>
        Nunca pedimos sua senha por e-mail, telefone ou mensagem. Se alguém pedir, é golpe —
        avise em <Link href="/contato" className="link">contato</Link>.
      </p>
    </div>
  );
}
