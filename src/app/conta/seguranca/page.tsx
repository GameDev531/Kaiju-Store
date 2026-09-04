import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { isStaff } from "@/server/auth/rbac";
import { MfaSetup, SessionControls } from "@/components/account/security";
import {
  beginMfaEnrolmentAction, confirmMfaEnrolmentAction, disableMfaAction, signOutEverywhereAction,
} from "./actions";
import { Label, SectionHead, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Segurança da conta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const auth = await getAuth();
  if (!auth) redirect("/entrar?next=/conta/seguranca");

  const [user, sessions, csrfBegin, csrfConfirm, csrfDisable, csrfRevoke] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { mfaEnrolledAt: true, mfaRecoveryCodes: true, lastLoginAt: true, emailVerified: true },
    }),
    db.session.findMany({
      where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, mfaVerifiedAt: true },
    }),
    csrfToken("security.mfa.begin"),
    csrfToken("security.mfa.confirm"),
    csrfToken("security.mfa.disable"),
    csrfToken("security.sessions.revoke"),
  ]);

  const remainingCodes = user.mfaRecoveryCodes
    ? (JSON.parse(user.mfaRecoveryCodes) as string[]).length
    : 0;
  const staff = isStaff(auth.user.roles);

  return (
    <div>
      <Label>Proteção da conta</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Segurança</h1>
      <p className="t-lede" style={{ marginTop: "0.85rem" }}>
        Sua conta guarda medidas do seu corpo, endereço e histórico de pedidos. Vale proteger.
      </p>

      {staff && !user.mfaEnrolledAt ? (
        <div style={{ marginTop: "1.75rem" }}>
          <Notice tone="blocking" title="Sua conta administrativa exige verificação em duas etapas">
            Ações sensíveis — reembolso, aprovação de repasse, concessão de papel — ficam bloqueadas
            até você ativar. Isso não é configurável.
          </Notice>
        </div>
      ) : null}

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Segundo fator" title="Verificação em duas etapas" />
        <MfaSetup
          beginAction={beginMfaEnrolmentAction}
          confirmAction={confirmMfaEnrolmentAction}
          disableAction={disableMfaAction}
          csrfBegin={csrfBegin}
          csrfConfirm={csrfConfirm}
          csrfDisable={csrfDisable}
          enrolled={user.mfaEnrolledAt !== null}
          isStaff={staff}
        />
        {user.mfaEnrolledAt && remainingCodes > 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
            Você tem {remainingCodes} código(s) de recuperação não utilizados.
          </p>
        ) : null}
        {user.mfaEnrolledAt && remainingCodes === 0 ? (
          <div style={{ marginTop: "0.85rem" }}>
            <Notice tone="attention" title="Você não tem mais códigos de recuperação">
              Se perder o aplicativo autenticador agora, recuperar o acesso vai exigir contato com o
              suporte e comprovação de identidade. Desative e reative a verificação para gerar novos.
            </Notice>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label={`${sessions.length} ativa(s)`} title="Sessões" />
        <div className="table-scroll">
          <table className="table">
            <caption className="sr-only">Sessões abertas nesta conta</caption>
            <thead>
              <tr>
                <th scope="col">Iniciada</th>
                <th scope="col">Última atividade</th>
                <th scope="col">Segundo fator</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="t-mono" style={{ fontSize: "0.8rem" }}>
                    {s.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {s.id === auth.sessionId ? (
                      <span style={{ display: "block", color: "var(--color-shu)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
                        este dispositivo
                      </span>
                    ) : null}
                  </td>
                  <td className="t-mono" style={{ fontSize: "0.8rem" }}>
                    {s.lastSeenAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {s.mfaVerifiedAt ? `confirmado ${s.mfaVerifiedAt.toLocaleDateString("pt-BR")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
          Não registramos endereço IP nem modelo de dispositivo em texto claro — só um identificador
          derivado, para detectar uso anômalo sem guardar sua localização.
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <SessionControls action={signOutEverywhereAction} csrf={csrfRevoke} />
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Boas práticas" title="O que ajuda de verdade" />
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
          {[
            "Use uma senha que não exista em nenhum outro serviço. Vazamento em outro site é como a maioria das contas cai.",
            "Uma frase longa e memorável é mais forte que uma senha curta cheia de símbolos.",
            "Ative a verificação em duas etapas. É a única medida aqui que sobrevive a um vazamento de senha.",
            "Nunca informamos, pedimos ou confirmamos sua senha por e-mail, telefone ou mensagem.",
          ].map((tip) => (
            <li key={tip} style={{ display: "flex", gap: "0.6rem", fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>
              <span aria-hidden="true" className="t-mono" style={{ color: "var(--color-observed)" }}>✓</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "1.25rem", fontSize: "0.875rem" }}>
          Viu algo estranho na sua conta? <Link href="/contato" className="link">Avise o suporte</Link>.
        </p>
      </section>
    </div>
  );
}
