import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth, csrfToken } from "@/server/auth/session";
import { RegisterForm } from "@/components/auth/forms";
import { registerAction } from "../actions";
import { Breadcrumbs, Label, Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta KAIJU para desenhar, aprovar e acompanhar peças sob medida.",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuth();
  const { next } = await searchParams;
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/conta";
  if (auth) redirect(target);

  const csrf = await csrfToken("auth.register");

  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Criar conta" }]} />
      <Label>Comece aqui</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Criar conta</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Uma conta guarda suas medidas, referências e fichas técnicas — e é onde você acompanha a produção.
      </p>

      <div className="panel" style={{ padding: "1.75rem", marginTop: "2rem" }}>
        <RegisterForm action={registerAction} csrf={csrf} next={target} />
      </div>

      <div style={{ marginTop: "1.75rem" }}>
        <Notice tone="info" title="O que coletamos, e por quê">
          Nome e e-mail para falar com você sobre pedidos. Medidas e referências para produzir a peça.
          Endereço para entregar. Nada além disso é necessário, e nada disso é vendido ou compartilhado
          com terceiros para publicidade. Suas imagens não treinam modelos.
        </Notice>
      </div>
    </div>
  );
}
