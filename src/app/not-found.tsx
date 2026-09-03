import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: false },
};

/**
 * A 404 that helps rather than shrugs. It names the three things a lost visitor
 * is most likely looking for, instead of a decorative illustration and a
 * "voltar ao início" link.
 */
export default function NotFound() {
  return (
    <div className="wrap-narrow section">
      <p className="t-mono" style={{ color: "var(--color-shu)", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em" }}>
        ERRO 404
      </p>
      <h1 className="t-display" style={{ marginTop: "1rem" }}>
        Esta peça
        <br />
        não existe
      </h1>
      <p className="t-lede" style={{ marginTop: "1.5rem" }}>
        O endereço que você abriu não corresponde a nada no ateliê. Pode ser um link antigo, um erro de
        digitação, ou uma peça que saiu do catálogo.
      </p>

      <div className="panel" style={{ padding: "1.5rem", marginTop: "2.5rem" }}>
        <p className="t-label">Talvez você queira</p>
        <ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0, display: "grid", gap: "0.85rem" }}>
          <li>
            <Link href="/loja" className="link" style={{ fontWeight: 600 }}>Ver a loja</Link>
            <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
              O catálogo completo, pronta-entrega e sob encomenda.
            </span>
          </li>
          <li>
            <Link href="/criar" className="link" style={{ fontWeight: 600 }}>Criar uma peça sob medida</Link>
            <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
              Se você não encontrou o que queria, talvez seja porque ainda não existe.
            </span>
          </li>
          <li>
            <Link href="/rastrear" className="link" style={{ fontWeight: 600 }}>Rastrear um pedido</Link>
            <span style={{ display: "block", fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
              Com o código que começa com KJ-.
            </span>
          </li>
        </ul>
      </div>

      <p style={{ marginTop: "2rem", fontSize: "0.875rem", color: "var(--color-ink-soft)" }}>
        Se você chegou aqui por um link nosso, isso é um bug e queremos saber:{" "}
        <Link href="/contato" className="link">avise o suporte</Link>.
      </p>
    </div>
  );
}
