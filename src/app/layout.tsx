import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE, NAV_PRIMARY, NAV_FOOTER } from "@/lib/site";
import { getAuth } from "@/server/auth/session";
import { peekCartCount } from "@/server/domain/cart";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.legalName }],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2efe7" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  // Só olha. Abrir uma página não cria sacola nem grava cookie.
  const cartCount = await peekCartCount(auth?.user.id ?? null);

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.legalName,
    alternateName: SITE.name,
    url: SITE.url,
    description: SITE.description,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE.contact.support,
      availableLanguage: ["Portuguese"],
    },
  };
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.url}/loja?busca={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>

        <header className="hairline-bottom" style={{ background: "var(--color-paper-raised)" }}>
          <div className="wrap" style={{ display: "flex", alignItems: "center", gap: "2rem", minHeight: 68 }}>
            <Link
              href="/"
              style={{ textDecoration: "none", display: "flex", alignItems: "baseline", gap: 8 }}
              aria-label={`${SITE.name} — página inicial`}
            >
              <span
                className="t-display-sm"
                style={{ fontSize: "1.4rem", letterSpacing: "-0.04em", lineHeight: 1 }}
              >
                {SITE.name}
              </span>
              <span aria-hidden="true" style={{ color: "var(--color-shu)", fontSize: "1.4rem", lineHeight: 1 }}>
                ▲
              </span>
            </Link>

            <nav aria-label="Navegação principal" style={{ marginRight: "auto" }}>
              <ul
                style={{
                  display: "flex",
                  gap: "1.4rem",
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  overflowX: "auto",
                }}
              >
                {NAV_PRIMARY.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="nav-link">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              {auth ? (
                <Link href="/conta" className="btn btn-quiet btn-sm">
                  {auth.user.displayName.split(" ")[0]}
                </Link>
              ) : (
                <Link href="/entrar" className="btn btn-quiet btn-sm">Entrar</Link>
              )}
              <Link
                href="/sacola"
                className="btn btn-quiet btn-sm"
                aria-label={
                  cartCount === 0
                    ? "Sacola, vazia"
                    : `Sacola, ${cartCount} ${cartCount === 1 ? "item" : "itens"}`
                }
              >
                Sacola
                {cartCount > 0 ? (
                  <span className="cart-count" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span>
                ) : null}
              </Link>
              <Link href="/criar" className="btn btn-primary btn-sm">Criar minha peça</Link>
            </div>
          </div>
        </header>

        <main id="conteudo">{children}</main>

        <footer className="hairline-top" style={{ background: "var(--color-paper-sunk)", marginTop: "4rem" }}>
          <div className="wrap section-tight">
            <div
              style={{
                display: "grid",
                gap: "2.5rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                paddingBottom: "2.5rem",
              }}
            >
              <div style={{ gridColumn: "1 / -1", maxWidth: "34ch" }}>
                <p className="t-display-sm" style={{ fontSize: "1.6rem" }}>{SITE.name}</p>
                <p style={{ marginTop: "0.6rem", color: "var(--color-ink-soft)", fontSize: "0.9rem" }}>
                  {SITE.description}
                </p>
              </div>
              {Object.entries(NAV_FOOTER).map(([group, links]) => (
                <nav key={group} aria-label={group}>
                  <p className="t-label" style={{ marginBottom: "0.85rem" }}>{group}</p>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem" }}>
                    {links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} style={{ fontSize: "0.875rem", textDecoration: "none", color: "var(--color-ink-soft)" }}>
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>

            <hr className="rule" />
            <div
              style={{
                paddingTop: "1.5rem",
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "space-between",
                fontSize: "0.8125rem",
                color: "var(--color-ink-faint)",
              }}
            >
              <p>
                © {new Date().getFullYear()} {SITE.legalName}. Designs e esculturas originais.
                Nenhuma afiliação com franquias de terceiros.
              </p>
              <p className="t-mono">Política v{SITE.policyVersion}</p>
            </div>
          </div>
        </footer>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationLd, websiteLd]) }}
        />
      </body>
    </html>
  );
}
