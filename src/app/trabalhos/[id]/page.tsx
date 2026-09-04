import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { JobApplicationForm } from "@/components/jobs/apply";
import { applyToJobAction } from "../aplicar-actions";
import { Breadcrumbs, Label, SectionHead, Badge, Notice, MoneyText } from "@/components/ui";
import {
  DISCIPLINE_LABELS, ENGAGEMENT_LABELS, LOCATION_MODE_LABELS,
  type Discipline, type Engagement, type LocationMode,
} from "@/server/domain/enums";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

async function load(id: string) {
  return db.jobPosting.findFirst({
    where: {
      id,
      status: "OPEN",
      recruiterAccount: { status: "APPROVED" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      recruiterAccount: { select: { companyName: true, website: true, status: true, reviewedAt: true } },
      _count: { select: { applications: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const posting = await load(id);
  if (!posting) return { title: "Vaga não encontrada" };
  return {
    title: `${posting.title} — ${posting.recruiterAccount.companyName}`,
    description: posting.description.slice(0, 155),
    alternates: { canonical: `/trabalhos/${posting.id}` },
  };
}

export default async function JobPostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const posting = await load(id);
  if (!posting) notFound();

  const auth = await getAuth();
  const [existing, csrf] = await Promise.all([
    auth
      ? db.jobApplication.findFirst({
          where: { postingId: posting.id, applicantUserId: auth.user.id },
          select: { id: true },
        })
      : null,
    csrfToken("jobs.apply"),
  ]);

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[{ href: "/", label: "Início" }, { href: "/trabalhos", label: "Vagas" }, { label: posting.title }]}
      />

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", marginTop: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Badge tone="blueprint">{DISCIPLINE_LABELS[posting.discipline as Discipline]}</Badge>
            <Badge>{ENGAGEMENT_LABELS[posting.engagement as Engagement]}</Badge>
            <Badge>{LOCATION_MODE_LABELS[posting.locationMode as LocationMode]}</Badge>
            {posting.recruiterAccount.status === "APPROVED" ? <Badge tone="ink">Empresa verificada</Badge> : null}
          </div>

          <h1 className="t-display-sm" style={{ marginTop: "1rem" }}>{posting.title}</h1>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem", fontSize: "1.02rem" }}>
            {posting.recruiterAccount.companyName}
            {posting.city ? ` · ${posting.city}/${posting.state}` : ""}
          </p>

          <div style={{ marginTop: "2.5rem", lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--color-ink-soft)" }}>
            {posting.description}
          </div>

          <div style={{ marginTop: "2.5rem" }}>
            <Notice tone="attention" title="Nenhuma vaga legítima cobra nada de você">
              Não pague taxa de cadastro, compra de material, curso ou "reserva de vaga". Não envie
              dados bancários ou documentos antes de uma entrevista real com a empresa. Se algo assim
              acontecer nesta vaga,{" "}
              <Link href={`/contato?assunto=vaga-${posting.id}`} className="link">denuncie aqui</Link> —
              a conta da empresa é suspensa enquanto investigamos.
            </Notice>
          </div>
        </div>

        <aside>
          <div className="panel" style={{ padding: "1.35rem", marginBottom: "1.5rem" }}>
            <Label>Remuneração</Label>
            {posting.payMinCents !== null && posting.payMaxCents !== null ? (
              <>
                <p style={{ fontSize: "1.35rem", fontWeight: 700, marginTop: "0.4rem" }}>
                  <MoneyText cents={posting.payMinCents} currency={posting.currency} /> —{" "}
                  <MoneyText cents={posting.payMaxCents} currency={posting.currency} />
                </p>
                <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                  {posting.payPeriod === "HOUR" ? "por hora" : posting.payPeriod === "MONTH" ? "por mês" : "por projeto"}
                </p>
              </>
            ) : (
              <p style={{ marginTop: "0.4rem", color: "var(--color-ink-faint)", fontSize: "0.9rem" }}>
                A empresa não informou a faixa. Vale perguntar antes de investir tempo no processo.
              </p>
            )}
            <p style={{ fontSize: "0.82rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
              {posting._count.applications} candidatura(s) · publicada em{" "}
              {posting.createdAt.toLocaleDateString("pt-BR")}
            </p>
          </div>

          {!auth ? (
            <div className="panel" style={{ padding: "1.35rem" }}>
              <p style={{ fontWeight: 650 }}>Entre para se candidatar</p>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)", marginTop: "0.5rem" }}>
                Candidatar-se é gratuito. Sempre.
              </p>
              <Link href={`/entrar?next=/trabalhos/${posting.id}`} className="btn btn-primary btn-block" style={{ marginTop: "1rem" }}>
                Entrar
              </Link>
            </div>
          ) : (
            <JobApplicationForm
              action={applyToJobAction}
              csrf={csrf}
              postingId={posting.id}
              alreadyApplied={existing !== null}
            />
          )}

          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "1.25rem", lineHeight: 1.55 }}>
            Esta empresa comprovou CNPJ e documentação a uma pessoa da nossa equipe antes de poder
            publicar. Isso reduz risco — não o elimina. Dúvidas:{" "}
            <a href={`mailto:${SITE.contact.support}`} className="link">{SITE.contact.support}</a>.
          </p>
        </aside>
      </div>
    </div>
  );
}
