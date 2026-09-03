import Link from "next/link";
import type { ReactNode } from "react";
import { CONFIDENCE_META, MEDIA_KIND_LABELS, type ConfidenceKind, type MediaKind } from "@/server/domain/enums";

/**
 * The shared vocabulary of the interface.
 *
 * These are the pieces that carry a *product commitment*, not just a style:
 * the confidence tag that keeps the AI honest, the media disclosure that keeps a
 * render from passing as a photograph, and the state components that make sure
 * no flow ever dead-ends on "algo deu errado".
 */

// ---------------------------------------------------------------- primitives

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ink" | "shu" | "blueprint" }) {
  const cls = tone === "ink" ? "badge badge-ink" : tone === "shu" ? "badge badge-shu" : tone === "blueprint" ? "badge badge-blueprint" : "badge";
  return <span className={cls}>{children}</span>;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="t-label">{children}</p>;
}

export function SectionHead({
  label,
  title,
  action,
}: {
  label?: string;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="section-head">
      <div>
        {label ? <Label>{label}</Label> : null}
        <h2 className="t-display-sm" style={{ marginTop: label ? "0.5rem" : 0 }}>{title}</h2>
      </div>
      {action ? (
        <Link href={action.href} className="link" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------- confidence tagging

/**
 * The single most important component in the product.
 *
 * Every AI-derived value is rendered with one of these. The symbol carries the
 * meaning as much as the colour does, so the distinction survives a monochrome
 * print, a colour-blind reader, and a bad screen — which matters, because this
 * tag is what tells a customer whether to trust a line before approving it.
 */
export function ConfidenceTag({ kind, showLabel = true }: { kind: ConfidenceKind; showLabel?: boolean }) {
  const meta = CONFIDENCE_META[kind];
  return (
    <span className={`conf conf-${meta.tone}`} title={meta.meaning}>
      <span className="sr-only">Confiabilidade: </span>
      {showLabel ? meta.pt : null}
    </span>
  );
}

export function ConfidenceLegend() {
  return (
    <div className="panel-sunk" style={{ padding: "1rem 1.15rem" }}>
      <Label>Como ler esta ficha</Label>
      <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.6rem" }}>
        {(Object.keys(CONFIDENCE_META) as ConfidenceKind[]).map((kind) => (
          <li key={kind} style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            <ConfidenceTag kind={kind} />
            <span style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", flex: "1 1 16rem" }}>
              {CONFIDENCE_META[kind].meaning}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ media honesty

/**
 * Any image that is not a photograph of the real, finished garment says so, on
 * the image, always. A concept render sold as a product photo is the single
 * most damaging thing an AI fashion platform can do to its customers.
 */
export function MediaFrame({
  kind,
  alt,
  src,
  aspect = "3 / 4",
}: {
  kind: MediaKind;
  alt: string;
  src?: string | null;
  aspect?: string;
}) {
  const disclosure = MEDIA_KIND_LABELS[kind];
  return (
    <div className="product-media" style={{ aspectRatio: aspect }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed private URLs are not remote-optimisable
        <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" decoding="async" />
      ) : (
        <div className="tech-placeholder" role="img" aria-label={alt}>
          <span className="t-label" style={{ textAlign: "center", padding: "0 1rem" }}>
            Desenho técnico
            <br />
            do ateliê
          </span>
        </div>
      )}
      {disclosure ? <p className="media-disclosure">{disclosure}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ notices

export type NoticeTone = "info" | "attention" | "blocking" | "good";

const NOTICE_MARK: Record<NoticeTone, string> = {
  info: "i",
  attention: "!",
  blocking: "■",
  good: "✓",
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "blocking" ? "alert" : "note"}>
      <span className="notice-mark" aria-hidden="true">{NOTICE_MARK[tone]}</span>
      <div>
        {title ? <p className="notice-title">{title}</p> : null}
        <div>{children}</div>
        {action ? <div className="notice-action">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Errors always say what happened AND what to do next. There is no path in this
 * codebase that renders a bare "Something went wrong" — `action` is required.
 */
export function ErrorState({
  code,
  message,
  action,
  retry,
}: {
  code?: string;
  message: string;
  action: string;
  retry?: ReactNode;
}) {
  return (
    <div className="notice notice-blocking" role="alert" aria-live="assertive">
      <span className="notice-mark" aria-hidden="true">■</span>
      <div>
        <p className="notice-title">{message}</p>
        <p className="notice-action">{action}</p>
        {retry ? <div style={{ marginTop: "0.85rem" }}>{retry}</div> : null}
        {code ? (
          <p className="t-mono" style={{ marginTop: "0.75rem", fontSize: "0.7rem", color: "var(--color-ink-faint)" }}>
            Código: {code}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  mark = "◇",
  title,
  description,
  action,
}: {
  mark?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">{mark}</span>
      <p className="t-title">{title}</p>
      <p style={{ color: "var(--color-ink-soft)", maxWidth: "48ch" }}>{description}</p>
      {action ? <div style={{ marginTop: "0.5rem" }}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: "grid", gap: "0.85rem" }}>
      <p style={{ fontSize: "0.9rem", color: "var(--color-ink-soft)" }}>{label}</p>
      <div className="skeleton" style={{ height: 12, width: "70%" }} />
      <div className="skeleton" style={{ height: 12, width: "45%" }} />
      <div className="skeleton" style={{ height: 12, width: "58%" }} />
    </div>
  );
}

// -------------------------------------------------------------- breadcrumbs

export function Breadcrumbs({ trail }: { trail: { href?: string; label: string }[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: item.href } : {}),
    })),
  };
  return (
    <>
      <nav aria-label="Trilha de navegação">
        <ol className="breadcrumbs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {trail.map((item) => (
            <li key={item.label}>
              {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  );
}

// ---------------------------------------------------------------- form bits

export function Field({
  label,
  name,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true" style={{ color: "var(--color-shu)" }}> *</span> : null}
        {required ? <span className="sr-only"> (obrigatório)</span> : null}
      </label>
      {hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
      {children}
      {error ? <p className="field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}

export function MoneyText({ cents, currency = "BRL" }: { cents: number; currency?: string }) {
  const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  return <span className="t-num">{formatted}</span>;
}
