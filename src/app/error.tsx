"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The application error boundary.
 *
 * `digest` is the only identifier shown — Next.js generates it server-side and
 * it correlates to the server log entry without exposing a stack, a query, or a
 * provider payload to the browser.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side observability hook. The server already logged the real error.
    if (typeof console !== "undefined") {
      console.error("Erro na aplicação", error.digest ?? "");
    }
  }, [error]);

  return (
    <div className="wrap-narrow section">
      <p className="t-mono" style={{ color: "var(--color-shu)", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em" }}>
        ERRO 500
      </p>
      <h1 className="t-display-sm" style={{ marginTop: "1rem" }}>Algo quebrou do nosso lado</h1>
      <p className="t-lede" style={{ marginTop: "1.25rem" }}>
        Esta falha é nossa, não sua. Nada do que você preencheu foi perdido — rascunhos de design,
        referências e pedidos ficam salvos no servidor, não nesta página.
      </p>

      <div className="notice notice-blocking" style={{ marginTop: "2rem" }} role="alert">
        <span className="notice-mark" aria-hidden="true">■</span>
        <div>
          <p className="notice-title">O que fazer agora</p>
          <p>
            Tente recarregar. Se o erro voltar, ele é reproduzível e nossa equipe precisa saber —
            mande o código abaixo junto com o que você estava fazendo.
          </p>
          {error.digest ? (
            <p className="t-mono" style={{ marginTop: "0.85rem", fontSize: "0.8rem" }}>
              Código do incidente: {error.digest}
            </p>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.85rem", marginTop: "2rem", flexWrap: "wrap" }}>
        <button type="button" onClick={reset} className="btn btn-primary">Tentar de novo</button>
        <Link href="/" className="btn btn-outline">Ir para o início</Link>
        <Link href="/contato" className="btn btn-quiet">Falar com o suporte</Link>
      </div>
    </div>
  );
}
