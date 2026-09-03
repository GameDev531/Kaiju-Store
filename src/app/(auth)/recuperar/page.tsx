import type { Metadata } from "next";
import { csrfToken } from "@/server/auth/session";
import { ResetRequestForm } from "@/components/auth/forms";
import { requestResetAction } from "../actions";
import { Breadcrumbs, Label } from "@/components/ui";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function RecoverPage() {
  const csrf = await csrfToken("auth.reset");
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { href: "/entrar", label: "Entrar" }, { label: "Recuperar senha" }]} />
      <Label>Acesso</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Recuperar senha</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Informe o e-mail da conta. Se ela existir, enviamos um link de redefinição válido por uma hora.
      </p>
      <div className="panel" style={{ padding: "1.75rem", marginTop: "2rem" }}>
        <ResetRequestForm action={requestResetAction} csrf={csrf} />
      </div>
      <p style={{ marginTop: "1.5rem", fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.6 }}>
        Por segurança, esta página responde a mesma coisa exista ou não uma conta com esse endereço.
        Isso impede que alguém descubra quem tem conta aqui.
      </p>
    </div>
  );
}
