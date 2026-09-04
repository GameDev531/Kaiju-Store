import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { Breadcrumbs, Label, SectionHead, Badge, EmptyState, Notice, MoneyText } from "@/components/ui";
import {
  DISCIPLINE_LABELS, ENGAGEMENT_LABELS, LOCATION_MODE_LABELS,
  type Discipline, type Engagement, type LocationMode,
} from "@/server/domain/enums";

export const metadata: Metadata = {
  title: "Vagas e projetos",
  description:
    "Quadro de vagas para costureiros, modelistas, bordadeiras, ilustradores e designers. Gratuito dos dois lados, com empresa verificada antes de publicar.",
  alternates: { canonical: "/trabalhos" },
};
export const dynamic = "force-dynamic";

export default async function JobsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; modo?: string }>;
}) {
  const { area, modo } = await searchParams;
  const auth = await getAuth();

  const discipline = area && area in DISCIPLINE_LABELS ? (area as Discipline) : undefined;
  const locationMode = modo && modo in LOCATION_MODE_LABELS ? (modo as LocationMode) : undefined;

  const postings = await db.jobPosting.findMany({
    // OPEN only: a posting is not visible until a human has approved both the
    // company behind it and the posting itself.
    where: {
      status: "OPEN",
      ...(discipline ? { discipline } : {}),
      ...(locationMode ? { locationMode } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      recruiterAccount: { select: { companyName: true, status: true } },
      _count: { select: { applications: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Vagas e projetos" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "64ch" }}>
        <Label>Quadro de trabalho · gratuito para os dois lados</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Vagas e projetos na indústria da moda</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Costura, modelagem, bordado, ilustração, design, 3D e fotografia. Sem taxa para quem
          contrata e sem taxa para quem se candidata.
        </p>
      </header>

      <div style={{ marginTop: "2rem", maxWidth: "72ch" }}>
        <Notice tone="info" title="Por que exigimos comprovação de empresa para publicar">
          Quadros de vaga abertos são um dos canais mais usados para golpe de recrutamento — pedido de
          "taxa de cadastro", "compra de material", dados bancários. Aqui, publicar exige CNPJ e
          documentação analisada por uma pessoa. Isso torna o processo mais lento para o contratante,
          e muito mais seguro para quem procura trabalho.
          <br />
          <strong>Nunca pague nada para se candidatar a uma vaga.</strong> Nenhuma empresa legítima
          cobra do candidato. Se alguém pedir, denuncie na própria vaga.
        </Notice>
      </div>

      <form method="get" action="/trabalhos" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label className="field-label" htmlFor="area">Área</label>
          <select id="area" name="area" className="select" defaultValue={discipline ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(DISCIPLINE_LABELS) as Discipline[]).map((d) => (
              <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label className="field-label" htmlFor="modo">Modalidade</label>
          <select id="modo" name="modo" className="select" defaultValue={locationMode ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(LOCATION_MODE_LABELS) as LocationMode[]).map((m) => (
              <option key={m} value={m}>{LOCATION_MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-ink">Filtrar</button>
        {discipline || locationMode ? <Link href="/trabalhos" className="btn btn-quiet">Limpar</Link> : null}
      </form>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label={`${postings.length} vaga(s) aberta(s)`} title="Oportunidades" />
        {postings.length === 0 ? (
          <EmptyState
            mark="◇"
            title="Nenhuma vaga aberta neste filtro"
            description="O quadro é novo e as vagas passam por análise antes de aparecer. Volte em alguns dias, ou remova o filtro para ver tudo."
            action={<Link href="/trabalhos" className="btn btn-outline">Ver todas as áreas</Link>}
          />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "1rem" }}>
            {postings.map((p) => (
              <li key={p.id} className="panel" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", flexWrap: "wrap" }}>
                  <div style={{ maxWidth: "54ch" }}>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                      <Badge tone="blueprint">{DISCIPLINE_LABELS[p.discipline as Discipline]}</Badge>
                      <Badge>{ENGAGEMENT_LABELS[p.engagement as Engagement]}</Badge>
                      <Badge>{LOCATION_MODE_LABELS[p.locationMode as LocationMode]}</Badge>
                      {p.recruiterAccount.status === "APPROVED" ? <Badge tone="ink">Empresa verificada</Badge> : null}
                    </div>
                    <p style={{ fontWeight: 650, fontSize: "1.05rem" }}>{p.title}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>
                      {p.recruiterAccount.companyName}
                      {p.city ? ` · ${p.city}/${p.state}` : ""}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.7rem", lineHeight: 1.6 }}>
                      {p.description.slice(0, 260)}{p.description.length > 260 ? "…" : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", minWidth: "10rem" }}>
                    {p.payMinCents !== null && p.payMaxCents !== null ? (
                      <>
                        <p className="t-label">Faixa</p>
                        <p style={{ fontWeight: 700, marginTop: "0.25rem" }}>
                          <MoneyText cents={p.payMinCents} currency={p.currency} /> —{" "}
                          <MoneyText cents={p.payMaxCents} currency={p.currency} />
                        </p>
                        <p style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)" }}>
                          {p.payPeriod === "HOUR" ? "por hora" : p.payPeriod === "MONTH" ? "por mês" : "por projeto"}
                        </p>
                      </>
                    ) : (
                      <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>Faixa não informada</p>
                    )}
                    <p style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)", marginTop: "0.6rem" }}>
                      {p._count.applications} candidatura(s)
                    </p>
                    <Link href={auth ? `/trabalhos/${p.id}` : `/entrar?next=/trabalhos/${p.id}`} className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem" }}>
                      Ver vaga
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "3.5rem" }}>
        <SectionHead label="Contratando" title="Quero publicar uma vaga" />
        <div className="panel" style={{ padding: "1.5rem", maxWidth: "72ch" }}>
          <p style={{ lineHeight: 1.65 }}>
            Publicar é gratuito, mas não é imediato. Você precisa comprovar que existe uma empresa por
            trás da vaga: CNPJ ativo, razão social e um documento que ligue você a ela. Uma pessoa da
            nossa equipe analisa antes de a vaga ir ao ar.
          </p>
          <p style={{ marginTop: "0.85rem", color: "var(--color-ink-soft)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Sabemos que isso afasta contratantes apressados. É intencional. O custo de um golpe de
            recrutamento cai sobre quem está procurando trabalho, e essa conta não é aceitável.
          </p>
          <Link href="/trabalhos/contratar" className="btn btn-primary" style={{ marginTop: "1.25rem" }}>
            Solicitar acesso de contratante
          </Link>
        </div>
      </section>
    </div>
  );
}
