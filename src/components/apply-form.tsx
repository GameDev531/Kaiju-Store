import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, Label, SectionHead, Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

/**
 * Shared shell for the three programmes that require human verification before
 * access: recruiter, creator store, wholesale.
 *
 * They share a shape on purpose — each states what it asks for, why, what
 * happens to the documents afterwards, and how long the review takes. A
 * verification gate that does not explain itself just reads as friction.
 */
export function ApplicationShell({
  breadcrumbLabel,
  breadcrumbHref,
  label,
  title,
  intro,
  requirements,
  documentNote,
  children,
}: {
  breadcrumbLabel: string;
  breadcrumbHref: string;
  label: string;
  title: string;
  intro: string;
  requirements: { title: string; body: string }[];
  documentNote: string;
  children?: ReactNode;
}) {
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs
        trail={[
          { href: "/", label: "Início" },
          { href: breadcrumbHref, label: breadcrumbLabel },
          { label: title },
        ]}
      />
      <Label>{label}</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{title}</h1>
      <p className="t-lede" style={{ marginTop: "1rem" }}>{intro}</p>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="O que pedimos" title="Requisitos" />
        <div style={{ display: "grid", gap: "1rem" }}>
          {requirements.map((r) => (
            <div key={r.title} className="panel" style={{ padding: "1.25rem" }}>
              <p style={{ fontWeight: 650 }}>{r.title}</p>
              <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", lineHeight: 1.6 }}>
                {r.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <Notice tone="info" title="O que acontece com os seus documentos">
          {documentNote}
        </Notice>
      </section>

      {children}

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Enviar" title="Solicitar acesso" />
        <div className="panel corner-ticks" style={{ padding: "1.5rem" }}>
          <p style={{ lineHeight: 1.7 }}>
            O envio de documentação ainda é feito por e-mail enquanto construímos o formulário seguro
            de upload. Escreva para{" "}
            <a href={`mailto:${SITE.contact.partners}`} className="link t-mono">{SITE.contact.partners}</a>{" "}
            com o assunto <strong>{title}</strong>, anexando o que está listado acima.
          </p>
          <p style={{ marginTop: "0.85rem", fontSize: "0.9rem", color: "var(--color-ink-soft)", lineHeight: 1.65 }}>
            Preferimos dizer isso do que apresentar um formulário que só guarda o seu dado e não faz
            nada com ele. Resposta em até {SITE.contact.responseHours} horas úteis, com a decisão ou
            com o que falta.
          </p>
          <div style={{ display: "flex", gap: "0.85rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
            <a href={`mailto:${SITE.contact.partners}?subject=${encodeURIComponent(title)}`} className="btn btn-primary">
              Escrever agora
            </a>
            <Link href="/contato" className="btn btn-quiet">Outros canais</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
