import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumbs, Label, Notice } from "@/components/ui";
import { SITE } from "@/lib/site";

/**
 * Shared shell for policy documents.
 *
 * Policies are read by people who are already worried about something, so the
 * shell puts the summary first and the effective date where it can be checked.
 */
export function PolicyPage({
  title,
  label,
  summary,
  updated,
  children,
}: {
  title: string;
  label: string;
  summary: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="wrap-narrow section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: title }]} />
      <Label>{label}</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{title}</h1>
      <p className="t-lede" style={{ marginTop: "1rem" }}>{summary}</p>
      <p className="t-mono" style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "1rem" }}>
        Versão {SITE.policyVersion} · atualizada em {updated}
      </p>
      <hr className="rule" style={{ marginBlock: "2.5rem" }} />
      <div className="policy-body">{children}</div>
      <hr className="rule" style={{ marginBlock: "2.5rem" }} />
      <p style={{ fontSize: "0.875rem", color: "var(--color-ink-soft)" }}>
        Dúvida sobre este documento? <Link href="/contato" className="link">Fale com a gente</Link>. Respondemos em
        até {SITE.contact.responseHours} horas úteis.
      </p>
    </div>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2 className="t-title" style={{ marginBottom: "0.85rem" }}>{title}</h2>
      <div style={{ display: "grid", gap: "0.85rem", lineHeight: 1.7, color: "var(--color-ink-soft)" }}>{children}</div>
    </section>
  );
}

export { Notice };
