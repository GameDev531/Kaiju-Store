import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db";
import {
  STYLES,
  STYLE_GROUPS,
  STYLE_GROUP_META,
  stylesByFamily,
  type StyleGroup,
} from "@/server/domain/styles";
import { Breadcrumbs, Label, Badge, SectionHead } from "@/components/ui";

export const metadata: Metadata = {
  title: "Estilos",
  description:
    "O vocabulário do ateliê: mais de 80 estéticas, de quiet luxury a techwear, de cottagecore a mecha. Cada uma com o que a define e o que costuma andar junto.",
  alternates: { canonical: "/estilos" },
  openGraph: { title: "Estilos · KAIJU", description: "Mais de 80 estéticas mapeadas — busque pelo termo que você já usa." },
};

export const dynamic = "force-dynamic";

export default async function StylesIndexPage() {
  // Quantas peças publicadas cada estilo tem hoje. Um número real ou nenhum —
  // um contador inflado é a primeira mentira que o cliente percebe.
  const counts = await db.productStyle.groupBy({
    by: ["styleId"],
    where: { product: { published: true, deletedAt: null } },
    _count: { _all: true },
  });
  const countById = new Map(counts.map((c) => [c.styleId, c._count._all]));

  return (
    <div className="wrap section">
      <Breadcrumbs trail={[{ href: "/", label: "Início" }, { label: "Estilos" }]} />

      <header style={{ marginTop: "1.5rem", maxWidth: "62ch" }}>
        <Label>Vocabulário do ateliê</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>
          {STYLES.length} estilos
        </h1>
        <p className="t-lede" style={{ marginTop: "0.85rem" }}>
          Esta é a lista de termos que a busca entende — com sinônimo, gíria, e as duas línguas.
          Se você digitar “stealth wealth”, “roupa de rico discreto” ou “old money”, a plataforma
          chega no mesmo lugar. Se um estilo que você usa não estiver aqui, ele ainda pode ser
          descrito no estúdio: a lista é o que sabemos nomear, não o limite do que sabemos fazer.
        </p>
      </header>

      <form method="get" action="/loja" style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 320px" }}>
          <label className="field-label" htmlFor="busca">Buscar por estilo ou peça</label>
          <input
            id="busca"
            name="busca"
            className="input"
            placeholder="coquette, techwear, jaqueta bomber, dark academia…"
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <button type="submit" className="btn btn-ink">Buscar</button>
      </form>

      {STYLE_GROUPS.map((group: StyleGroup) => {
        const families = stylesByFamily(group);
        return (
          <section key={group} style={{ marginTop: "4rem" }} aria-labelledby={`grupo-${group}`}>
            <h2 id={`grupo-${group}`} className="t-title">{STYLE_GROUP_META[group].label}</h2>
            {/* O grupo é apresentação, não identidade. Dizer isso em voz alta
                evita que a navegação vire uma regra sobre quem pode vestir o quê. */}
            <p style={{ marginTop: "0.5rem", maxWidth: "62ch", color: "var(--color-ink-faint)", fontSize: "0.9rem" }}>
              {STYLE_GROUP_META[group].blurb}
            </p>

            <div style={{ display: "grid", gap: "2rem", marginTop: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {Array.from(families.entries()).map(([family, styles]) => (
                <div key={family}>
                  <Label>{family}</Label>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "grid", gap: "0.5rem" }}>
                    {styles.map((style) => {
                      const count = countById.get(style.id) ?? 0;
                      return (
                        <li key={style.id}>
                          <Link
                            href={`/estilos/${style.id}`}
                            className="panel"
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", padding: "0.7rem 0.9rem", textDecoration: "none" }}
                          >
                            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{style.label}</span>
                            <span className="t-mono" style={{ fontSize: "0.7rem", color: "var(--color-ink-faint)", whiteSpace: "nowrap" }}>
                              {count > 0 ? `${count} peça${count === 1 ? "" : "s"}` : "sob medida"}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section style={{ marginTop: "4.5rem" }}>
        <SectionHead
          label="Nenhum dos oitenta serve?"
          title="Descreva o seu"
          action={{ href: "/criar", label: "Abrir o estúdio" }}
        />
        <p style={{ maxWidth: "62ch", color: "var(--color-ink-faint)" }}>
          O estúdio parte de uma foto ou de uma descrição sua e devolve uma ficha técnica que
          um humano revisa antes de qualquer costura começar. O estilo é o ponto de partida da
          conversa, não o formulário inteiro.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.25rem" }}>
          <Badge tone="blueprint">Revisão humana obrigatória</Badge>
          <Badge>Você aprova antes de produzir</Badge>
        </div>
      </section>
    </div>
  );
}
