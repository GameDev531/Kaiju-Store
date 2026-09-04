import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import {
  STYLES, getStyle, isStyleId, stylesByGroup, stylesByFamily, matchStyles,
  facetsForQuery, facetsForStyles, normalizeText, styleSearchText, facetLabel,
  STYLE_GROUPS, ALL_STYLE_FACETS, styleDisplayLabel,
} from "@/server/domain/styles";
import { searchCatalog, buildSearchText, reindexAllProducts, searchSuggestions } from "@/server/domain/search";
import { FACET_KINDS } from "@/server/domain/enums";

/**
 * O catálogo de estilos é a espinha da busca e da recomendação. Um estilo com
 * alias faltando é uma busca que devolve zero para um termo que a pessoa
 * realmente digita — e o bug só aparece quando alguém reclama.
 */

// ======================================================== catálogo ==========

describe("catálogo de estilos", () => {
  it("tem identificadores únicos", () => {
    const ids = STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("usa apenas dimensões de faceta declaradas nos enums", () => {
    for (const facet of ALL_STYLE_FACETS) {
      const kind = facet.split(":")[0]!;
      expect(FACET_KINDS as readonly string[], `faceta desconhecida: ${facet}`).toContain(kind);
    }
  });

  it("dá a todo estilo o mínimo para ser encontrado e recomendado", () => {
    for (const style of STYLES) {
      expect(style.id, style.label).toMatch(/^[a-z0-9-]+$/);
      expect(style.label.length, style.id).toBeGreaterThan(1);
      expect(style.description.length, style.id).toBeGreaterThan(20);
      // Sem alias, só quem digita o nome exato encontra.
      expect(style.aliases.length, `${style.id} sem aliases`).toBeGreaterThanOrEqual(3);
      // Sem faceta, o recomendador é cego para o estilo.
      expect(style.facets.length, `${style.id} sem facetas`).toBeGreaterThanOrEqual(2);
    }
  });

  it("só aponta para vizinhos que existem", () => {
    for (const style of STYLES) {
      for (const relatedId of style.related) {
        expect(isStyleId(relatedId), `${style.id} → ${relatedId} não existe`).toBe(true);
      }
    }
  });

  it("cobre os três grupos com volume real", () => {
    for (const group of STYLE_GROUPS) {
      expect(stylesByGroup(group).length, group).toBeGreaterThanOrEqual(10);
    }
    expect(STYLES.length).toBeGreaterThanOrEqual(80);
  });

  it("agrupa por família para navegação", () => {
    const families = stylesByFamily("FEMININO");
    expect(families.size).toBeGreaterThan(3);
    for (const [, list] of families) expect(list.length).toBeGreaterThan(0);
  });
});

// ===================================================== normalização =========

describe("normalização de texto", () => {
  it("remove acento e caixa — a mesma função para consulta e índice", () => {
    expect(normalizeText("GÓTICO")).toBe("gotico");
    expect(normalizeText("Coquette")).toBe("coquette");
    expect(normalizeText("Alfaiataria  Moderna")).toBe("alfaiataria moderna");
    expect(normalizeText("  Y2K!  ")).toBe("y2k");
    expect(normalizeText("crochê")).toBe("croche");
  });

  it("é idempotente", () => {
    for (const raw of ["Dark Academia", "SOFT girl", "boêmio", "K-pop"]) {
      expect(normalizeText(normalizeText(raw))).toBe(normalizeText(raw));
    }
  });
});

// ========================================================= matching =========

describe("reconhecimento de estilo na busca", () => {
  it("encontra pelo nome exato", () => {
    expect(matchStyles("quiet luxury")[0]?.styleId).toBe("quiet-luxury");
    expect(matchStyles("dark academia")[0]?.styleId).toBe("dark-academia");
    expect(matchStyles("techwear")[0]?.styleId).toBe("techwear");
  });

  it("encontra por sinônimo, inclusive em português", () => {
    const cases: [string, string][] = [
      ["stealth wealth", "quiet-luxury"],
      ["luxo discreto", "quiet-luxury"],
      ["dinheiro antigo", "old-money"],
      ["moda de rua", "streetwear-fem"],
      ["fofo", "soft-girl"],
      ["motoqueiro", "biker"],
      ["fliperama", "retro-gamer"],
      ["coreano", "kpop-fashion"],
      ["faroeste", "western"],
    ];
    for (const [query, expectedId] of cases) {
      const ids = matchStyles(query, 4).map((m) => m.styleId);
      expect(ids, `"${query}" deveria achar ${expectedId}`).toContain(expectedId);
    }
  });

  it("tolera acento e caixa", () => {
    expect(matchStyles("GÓTICO").length).toBeGreaterThan(0);
    expect(matchStyles("gotico").length).toBeGreaterThan(0);
    expect(matchStyles("Gótico")[0]?.styleId).toBe(matchStyles("gotico")[0]?.styleId);
  });

  it("tolera plural e flexão", () => {
    expect(matchStyles("goticas").length).toBeGreaterThan(0);
    expect(matchStyles("minimalista").length).toBeGreaterThan(0);
  });

  it("prefere a frase inteira ao termo solto", () => {
    // "old money" não pode virar um casamento fraco em "money".
    const top = matchStyles("old money")[0];
    expect(top?.styleId).toBe("old-money");
    // "dark academia" não pode ser confundido com "dark" sozinho.
    expect(matchStyles("dark academia")[0]?.styleId).toBe("dark-academia");
  });

  it("acha estilo dentro de uma frase maior", () => {
    const ids = matchStyles("quero uma jaqueta techwear preta", 5).map((m) => m.styleId);
    expect(ids).toContain("techwear");
  });

  it("traz TODOS os estilos que reivindicam uma palavra ambígua", () => {
    // "fofo" é alias de Kawaii e de Soft Girl. Devolver só um esconde metade do
    // catálogo de quem digitou exatamente o termo certo.
    const ids = matchStyles("fofo", 6).map((m) => m.styleId);
    expect(ids).toContain("soft-girl");
    expect(ids).toContain("kawaii-fem");
  });

  it("não inventa resultado para termo sem sentido", () => {
    expect(matchStyles("asdfghjkl qwerty")).toHaveLength(0);
    expect(matchStyles("")).toHaveLength(0);
    expect(matchStyles("a")).toHaveLength(0);
  });

  it("converte a consulta em facetas para o recomendador", () => {
    const facets = facetsForQuery("cyber gamer");
    expect(facets).toContain("PALETTE:neon");
    expect(facets.some((f) => f.startsWith("FANDOM_GENRE:"))).toBe(true);
  });

  it("expande estilos em facetas ao etiquetar um produto", () => {
    const facets = facetsForStyles(["techwear", "cottagecore"]);
    expect(facets).toContain("STYLE_ID:techwear");
    expect(facets).toContain("STYLE_ID:cottagecore");
    expect(facets).toContain("FABRIC:technical");
    expect(facets).toContain("MOTIF:floral");
  });

  it("ignora estilo inexistente em vez de quebrar", () => {
    expect(facetsForStyles(["nao-existe"])).toHaveLength(0);
  });

  it("dá rótulo legível a toda faceta que os estilos produzem", () => {
    for (const facet of ALL_STYLE_FACETS) {
      const label = facetLabel(facet);
      expect(label.length, facet).toBeGreaterThan(1);
      // Um rótulo que ainda contém "FABRIC:" não foi traduzido.
      expect(label, facet).not.toContain(":");
    }
  });
});

// =========================================================== índice =========

describe("índice de busca do produto", () => {
  it("inclui alias de estilo, para que sinônimo encontre a peça", () => {
    const text = buildSearchText({
      name: "Blazer Estruturado",
      subtitle: "Lã fria",
      description: "Ombro construído.",
      garmentType: "Blazer",
      category: "OUTERWEAR",
      styleIds: ["quiet-luxury"],
    });
    // Nenhuma destas palavras está na descrição da peça.
    expect(text).toContain("stealth wealth");
    expect(text).toContain("luxo discreto");
  });

  it("normaliza igual à consulta", () => {
    const text = buildSearchText({
      name: "Jaqueta Gótica",
      description: "Preto.",
      garmentType: "Jaqueta",
      category: "OUTERWEAR",
      styleIds: [],
    });
    expect(text).toContain(normalizeText("Gótica"));
    expect(text).not.toContain("ó");
  });

  it("gera texto de busca a partir de vários estilos", () => {
    const text = styleSearchText(["techwear", "militar"]);
    expect(text).toContain("ripstop");
    expect(text).toContain("camuflado");
  });
});

// ====================================================== busca real ==========

describe("busca no catálogo", () => {
  async function makeProduct(input: {
    slug: string; name: string; description?: string; category?: string;
    garmentType?: string; styles?: { id: string; primary?: boolean }[];
  }) {
    const product = await db.product.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? "Peça de teste.",
        category: input.category ?? "TOPS",
        garmentType: input.garmentType ?? "Camiseta",
        basePriceCents: 10_000,
        published: true,
      },
    });
    for (const [i, style] of (input.styles ?? []).entries()) {
      await db.productStyle.create({
        data: { productId: product.id, styleId: style.id, isPrimary: style.primary ?? false, position: i },
      });
      for (const facet of facetsForStyles([style.id])) {
        const [kind, value] = facet.split(":");
        if (!kind || !value) continue;
        await db.productTag.upsert({
          where: { productId_kind_value: { productId: product.id, kind, value } },
          create: { productId: product.id, kind, value },
          update: {},
        });
      }
    }
    return product.id;
  }

  beforeEach(async () => {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    for (const t of ["ProductTag", "ProductStyle", "ProductVariant", "ProductMedia", "Product", "InteractionEvent", "TasteProfile"]) {
      await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
    }
    await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  });

  it("encontra pelo nome do estilo, mesmo sem a palavra na descrição", async () => {
    const target = await makeProduct({
      slug: "blazer-lux", name: "Blazer Estruturado",
      description: "Ombro construído em lã fria.",
      styles: [{ id: "quiet-luxury", primary: true }],
    });
    await makeProduct({ slug: "camiseta-basica", name: "Camiseta Básica", styles: [{ id: "casual-fem" }] });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "quiet luxury" });
    expect(result.items[0]?.productId).toBe(target);
    expect(result.detectedStyles.map((s) => s.id)).toContain("quiet-luxury");
  });

  it("encontra por sinônimo que não aparece em lugar nenhum da peça", async () => {
    const target = await makeProduct({
      slug: "blazer-lux2", name: "Blazer Estruturado",
      description: "Ombro construído.",
      styles: [{ id: "quiet-luxury", primary: true }],
    });
    await reindexAllProducts();

    for (const query of ["stealth wealth", "luxo discreto", "sem logo"]) {
      const result = await searchCatalog({ query });
      expect(result.items[0]?.productId, query).toBe(target);
    }
  });

  it("ignora acento e caixa", async () => {
    const target = await makeProduct({
      slug: "jaqueta-gotica", name: "Jaqueta Gótica",
      styles: [{ id: "gotico-dark", primary: true }],
    });
    await reindexAllProducts();

    for (const query of ["gotico", "GÓTICO", "Gótica", "goth"]) {
      const result = await searchCatalog({ query });
      expect(result.items[0]?.productId, query).toBe(target);
    }
  });

  it("põe o estilo primário na frente do secundário", async () => {
    const primary = await makeProduct({
      slug: "tech-primario", name: "Calça Alfa", styles: [{ id: "techwear", primary: true }],
    });
    await makeProduct({
      slug: "tech-secundario", name: "Calça Beta", styles: [{ id: "techwear", primary: false }],
    });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "techwear" });
    expect(result.items[0]?.productId).toBe(primary);
  });

  it("dá mais peso ao estilo do que a uma coincidência de texto", async () => {
    const styled = await makeProduct({
      slug: "peca-estilo", name: "Peça Alfa", styles: [{ id: "cottagecore", primary: true }],
    });
    await makeProduct({
      slug: "peca-texto", name: "Peça Beta",
      description: "Inspirada no universo cottagecore de alguma forma.",
    });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "cottagecore" });
    expect(result.items[0]?.productId).toBe(styled);
  });

  it("filtra por estilo como restrição, não como reforço", async () => {
    const punk = await makeProduct({ slug: "p1", name: "Alfa", styles: [{ id: "punk-fem" }] });
    await makeProduct({ slug: "p2", name: "Beta", styles: [{ id: "coquette" }] });
    await reindexAllProducts();

    const result = await searchCatalog({ styleIds: ["punk-fem"] });
    expect(result.items.map((i) => i.productId)).toEqual([punk]);
  });

  it("exige TODOS os termos da consulta", async () => {
    await makeProduct({ slug: "j1", name: "Jaqueta Vermelha", description: "Vermelha." });
    const target = await makeProduct({ slug: "j2", name: "Jaqueta Preta", description: "Preta." });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "jaqueta preta" });
    expect(result.items.map((i) => i.productId)).toEqual([target]);
  });

  it("nunca devolve tela vazia sem saída", async () => {
    await makeProduct({ slug: "algo", name: "Algo", styles: [{ id: "techwear" }] });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "cottagecore" });
    expect(result.items).toHaveLength(0);
    // Sugere vizinhos em vez de encerrar a conversa.
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("não mostra peça despublicada", async () => {
    const id = await makeProduct({ slug: "oculto", name: "Oculto", styles: [{ id: "techwear" }] });
    await db.product.update({ where: { id }, data: { published: false } });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "techwear" });
    expect(result.items).toHaveLength(0);
  });

  it("lista por novidade quando não há consulta nem filtro", async () => {
    await makeProduct({ slug: "a", name: "A" });
    await new Promise((r) => setTimeout(r, 10));
    const newer = await makeProduct({ slug: "b", name: "B" });
    await reindexAllProducts();

    const result = await searchCatalog({});
    expect(result.items[0]?.productId).toBe(newer);
    expect(result.items[0]?.reason).toContain("novidade");
  });

  it("explica por que cada resultado apareceu", async () => {
    await makeProduct({ slug: "x", name: "X", styles: [{ id: "techwear", primary: true }] });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "techwear" });
    expect(result.items[0]?.reason).toBeTruthy();
    expect(result.items[0]?.matchedStyles).toContain("techwear");
  });

  it("limita e pagina", async () => {
    for (let i = 0; i < 5; i += 1) await makeProduct({ slug: `pg-${i}`, name: `Peça ${i}` });
    await reindexAllProducts();

    const page1 = await searchCatalog({ limit: 2, offset: 0 });
    const page2 = await searchCatalog({ limit: 2, offset: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.items[0]?.productId).not.toBe(page2.items[0]?.productId);
    expect(page1.total).toBe(5);
  });

  it("trunca consulta absurda em vez de varrer o banco com ela", async () => {
    const result = await searchCatalog({ query: "a".repeat(500) });
    expect(result.normalizedQuery.length).toBeLessThanOrEqual(80);
  });

  /**
   * O bug que este teste tranca: a busca reconhecia o estilo na frase, anunciava
   * isso na tela ("Entendemos que você procura Japanese Street") e devolvia zero
   * resultados, porque o candidato era filtrado exigindo TODAS as palavras no
   * texto. Prometer entendimento e entregar tela vazia é pior do que não entender.
   */
  it("estilo reconhecido na frase traz a peça mesmo sem as palavras no texto", async () => {
    const target = await makeProduct({
      slug: "haori-teste", name: "Haori Corte Seco",
      description: "Mangas amplas em nylon ripstop com amarração lateral.",
      garmentType: "Haori",
      styles: [{ id: "japanese-street", primary: true }],
    });
    await reindexAllProducts();

    const result = await searchCatalog({ query: "roupa de rua japonesa" });
    expect(result.detectedStyles.map((s) => s.id)).toContain("japanese-street");
    expect(result.items.map((i) => i.productId)).toContain(target);
  });

  it("o alcance por estilo não afrouxa o filtro explícito", async () => {
    await makeProduct({
      slug: "so-techwear", name: "Calça Técnica",
      styles: [{ id: "techwear", primary: true }],
    });
    const kawaii = await makeProduct({
      slug: "so-kawaii", name: "Moletom Fofo",
      styles: [{ id: "kawaii-universo", primary: true }],
    });
    await reindexAllProducts();

    // O filtro é restrição: mesmo com "kawaii" reconhecido na frase, quem
    // filtrou por techwear não pode receber a peça kawaii.
    const result = await searchCatalog({ styleIds: ["techwear"], query: "kawaii" });
    expect(result.items.map((i) => i.productId)).not.toContain(kawaii);
  });

  it("zero resultado devolve sugestões espalhadas pelos três grupos", async () => {
    await reindexAllProducts();
    const result = await searchCatalog({ query: "vestido de noiva vitoriano" });
    expect(result.items).toHaveLength(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    const groups = new Set(result.suggestions.map((s) => s.group));
    expect(groups.size, "sugestão presa num canto só do catálogo").toBeGreaterThan(1);
  });
});

describe("rótulo desambiguado", () => {
  it("mantém o rótulo simples quando ele é único no catálogo", () => {
    const style = getStyle("quiet-luxury")!;
    expect(styleDisplayLabel(getStyle("techwear")!)).toBe("Techwear");
    expect(style.label).toBe("Quiet Luxury");
  });

  it("desambigua rótulos que existem em mais de um grupo", () => {
    // "Kawaii" existe no grupo FEMININO e em UNIVERSOS. Num chip solto, dois
    // itens escritos igual não dizem à pessoa em qual clicar.
    const fem = getStyle("kawaii-fem")!;
    const universo = getStyle("kawaii-universo")!;
    expect(fem.label).toBe(universo.label);
    expect(styleDisplayLabel(fem)).not.toBe(styleDisplayLabel(universo));
    expect(styleDisplayLabel(fem)).toContain("fem.");
    expect(styleDisplayLabel(universo)).toContain("universo");
  });

  it("nenhum rótulo exibido colide com outro no catálogo inteiro", () => {
    const shown = STYLES.map((s) => styleDisplayLabel(s));
    expect(new Set(shown).size).toBe(shown.length);
  });
});

describe("sugestões de digitação", () => {
  it("sugere estilos a partir de um prefixo", () => {
    const suggestions = searchSuggestions("tech");
    expect(suggestions.some((s) => s.id === "techwear")).toBe(true);
  });

  it("não sugere nada para entrada curta demais", () => {
    expect(searchSuggestions("t")).toHaveLength(0);
  });

  it("só devolve estilos, nunca nomes de produto", () => {
    // Sugerir nome de produto abriria enumeração do catálogo por prefixo.
    for (const suggestion of searchSuggestions("gotico")) {
      expect(getStyle(suggestion.id)).toBeDefined();
    }
  });
});
