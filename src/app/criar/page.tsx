import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { CreateDesignForm } from "@/components/design/forms";
import { createDesignAction } from "./actions";
import { Breadcrumbs, Label, Notice, SectionHead, EmptyState } from "@/components/ui";
import { getStyle } from "@/server/domain/styles";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Criar minha peça",
  description:
    "Envie suas referências, receba uma ficha técnica com a incerteza declarada, aprove linha por linha e um ateliê verificado costura a peça.",
  alternates: { canonical: "/criar" },
};

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ estilo?: string }>;
}) {
  const auth = await getAuth();
  // Chegou de uma página de estilo: o campo já vem começado, e continua editável.
  const style = getStyle((await searchParams).estilo ?? "");
  const prefillBrief = style
    ? `Quero uma peça no estilo ${style.label}. ${style.description}\n\n`
    : undefined;

  if (!auth) {
    // Preserva a intenção original através do login, em vez de descartá-la.
    const next = encodeURIComponent(style ? `/criar?estilo=${style.id}` : "/criar");
    return (
      <div className="wrap-narrow section">
        <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Criar minha peça" }]} />
        <h1 className="t-display-sm" style={{ marginTop: "1.5rem" }}>Criar minha peça</h1>
        <p className="t-lede" style={{ marginTop: "1rem" }}>
          Você precisa de uma conta para criar uma peça sob medida — as suas referências, medidas e
          fichas ficam guardadas nela, e só você tem acesso.
        </p>
        <div style={{ display: "flex", gap: "0.85rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
          <Link href={`/cadastrar?next=${next}`} className="btn btn-primary">Criar conta</Link>
          <Link href={`/entrar?next=${next}`} className="btn btn-outline">Já tenho conta</Link>
        </div>
        <div style={{ marginTop: "2.5rem" }}>
          <Notice tone="info" title="Antes de decidir">
            A página <Link href="/como-funciona" className="link">Como funciona</Link> mostra o processo
            inteiro, incluindo o que a análise consegue e o que ela não consegue determinar.
          </Notice>
        </div>
      </div>
    );
  }

  const [designs, csrf] = await Promise.all([
    db.design.findMany({
      where: { userId: auth.user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { _count: { select: { references: true, versions: true } } },
    }),
    csrfToken("design.create"),
  ]);

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Criar minha peça" }]} />

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 400px)", marginTop: "1.5rem" }}>
        <div>
          <Label>Passo 1 de 6</Label>
          <h1 className="t-display-sm" style={{ marginTop: "0.75rem" }}>Comece pela ideia</h1>
          <p className="t-lede" style={{ marginTop: "1rem" }}>
            Dê um nome e descreva a peça. No próximo passo você anexa as referências e diz para que
            serve cada uma. Nada é enviado para produção antes da sua aprovação.
          </p>

          <div style={{ marginTop: "2rem" }}>
            <CreateDesignForm action={createDesignAction} csrf={csrf} prefillBrief={prefillBrief} />
          </div>

          <div style={{ marginTop: "2.5rem" }}>
            <Notice tone="info" title="Sobre suas imagens">
              Elas ficam em armazenamento privado, acessível só por link assinado e temporário.
              O ateliê que produzir sua peça vê as referências e as medidas — nunca seu nome,
              endereço ou contato. Você pode apagar tudo em{" "}
              <Link href="/conta/privacidade" className="link">Conta → Privacidade</Link>.
              Não usamos suas imagens para treinar modelos.
            </Notice>
          </div>
        </div>

        <aside>
          <SectionHead label="Seus designs" title="Rascunhos" />
          {designs.length === 0 ? (
            <EmptyState
              mark="✎"
              title="Nada por aqui ainda"
              description="Seu primeiro design aparece nesta lista assim que você criar."
            />
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
              {designs.map((d) => (
                <li key={d.id}>
                  <Link href={`/criar/${d.id}`} className="panel" style={{ display: "block", padding: "1rem", textDecoration: "none" }}>
                    <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>{d.title}</p>
                    <p className="t-mono" style={{ fontSize: "0.72rem", color: "var(--color-ink-faint)", marginTop: "0.35rem" }}>
                      {d._count.references} ref · {d._count.versions} versão(ões) · {statusLabel(d.status)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "rascunho",
    ANALYZING: "analisando",
    NEEDS_REVIEW: "aguardando sua revisão",
    APPROVED: "aprovado",
    ORDERED: "em produção",
    ARCHIVED: "arquivado",
  };
  return map[status] ?? status.toLowerCase();
}
