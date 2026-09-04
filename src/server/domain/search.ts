import { db } from "../db";
import { normalizeText, matchStyles, getStyle, styleDisplayLabel, STYLES, type StyleDefinition } from "./styles";
import { buildSearchText } from "./search-text";
import { readAffinity } from "./recommender";
import { log } from "../lib/logger";

/**
 * Busca do catálogo.
 *
 * O que ela resolve, em ordem de importância:
 *
 *  1. **Acento e caixa não podem quebrar a busca.** "GÓTICO", "gotico" e
 *     "Gotico" batem no mesmo índice, porque consulta e índice passam pela
 *     MESMA função de normalização. Duas normalizações diferentes é um bug
 *     invisível até alguém reclamar que "não acha nada".
 *
 *  2. **Estilo tem prioridade sobre texto.** Quem digita "quiet luxury" quer
 *     aquele estilo, não uma peça cuja descrição por acaso diz "luxo". Um
 *     casamento de estilo vale mais que qualquer casamento textual.
 *
 *  3. **Sinônimo funciona.** "stealth wealth", "luxo discreto" e "sem logo"
 *     chegam todos em Quiet Luxury, porque os aliases do catálogo entram no
 *     índice do produto.
 *
 *  4. **Zero resultado nunca é um beco.** A busca devolve sugestões — estilos
 *     próximos, termos parecidos — em vez de uma tela vazia.
 *
 * Implementação: uma coluna `searchText` varrida com LIKE. É honestamente
 * simples, e é a escolha certa enquanto o catálogo cabe em uma consulta. O
 * caminho de upgrade (FTS5 no SQLite, tsvector no Postgres) está no
 * ARQUITETURA.md; este módulo é a fronteira que isolaria essa troca.
 */

export interface SearchResultItem {
  productId: string;
  score: number;
  /** Por que este produto apareceu. Mostrado quando ajuda a entender o resultado. */
  reason: string;
  matchedStyles: string[];
}

export interface SearchOutcome {
  items: SearchResultItem[];
  /** Estilos que a própria consulta apontou — viram chips clicáveis. */
  detectedStyles: StyleDefinition[];
  /** Quando nada foi encontrado: para onde mandar a pessoa. */
  suggestions: StyleDefinition[];
  total: number;
  /** A consulta depois de normalizada. Útil para depurar e para o log. */
  normalizedQuery: string;
}

export interface SearchInput {
  query?: string | undefined;
  styleIds?: string[] | undefined;
  category?: string | undefined;
  /** Enviesa o resultado pelo gosto de quem busca, sem substituir a relevância. */
  userId?: string | null | undefined;
  anonId?: string | null | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

const WEIGHTS = {
  /** Estilo declarado pelo produto e apontado pela consulta. O sinal mais forte. */
  styleExact: 1000,
  stylePrimary: 400,
  /** O termo aparece no nome. */
  nameExact: 700,
  namePartial: 350,
  /** O termo aparece no subtítulo ou no tipo de peça. */
  subtitle: 200,
  /** O termo aparece em qualquer lugar do índice (descrição, alias de estilo). */
  haystack: 120,
  /** Cada token adicional que também casa. Recompensa consulta específica. */
  tokenBonus: 60,
  /** Afinidade do perfil de gosto, teto baixo para não sequestrar a busca. */
  tasteMax: 180,
} as const;

const MAX_QUERY_LENGTH = 80;
const MAX_TOKENS = 8;

export async function searchCatalog(input: SearchInput): Promise<SearchOutcome> {
  const rawQuery = (input.query ?? "").slice(0, MAX_QUERY_LENGTH);
  const normalizedQuery = normalizeText(rawQuery);
  const limit = Math.min(60, Math.max(1, input.limit ?? 24));
  const offset = Math.max(0, input.offset ?? 0);

  // Estilos que a consulta aponta, mais os que vieram por filtro explícito.
  const detected = normalizedQuery.length >= 2 ? matchStyles(normalizedQuery, 4) : [];
  const filterStyleIds = (input.styleIds ?? []).filter((id) => getStyle(id) !== undefined);
  const targetStyleIds = new Set([...filterStyleIds, ...detected.map((d) => d.styleId)]);

  const tokens = normalizedQuery
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, MAX_TOKENS);

  // Um filtro de estilo explícito é uma restrição; um estilo apenas detectado
  // na frase é um reforço de ranking. Confundir os dois faz "jaqueta preta"
  // esconder toda jaqueta que não esteja etiquetada como gótica.
  //
  // O texto exige TODOS os tokens — precisão. O estilo detectado entra em OR
  // com ele para dar alcance: sem isso, "roupa de rua japonesa" reconhecia o
  // estilo Japanese Street, dizia isso na tela em letras grandes, e devolvia
  // zero resultado porque a palavra "roupa" não estava na descrição. Prometer
  // entendimento e entregar tela vazia é pior do que não entender.
  const recallStyleIds = detected.map((d) => d.styleId);
  const textOrStyle =
    tokens.length > 0
      ? {
          OR: [
            { AND: tokens.map((token) => ({ searchText: { contains: token } })) },
            ...(recallStyleIds.length > 0
              ? [{ styles: { some: { styleId: { in: recallStyleIds } } } }]
              : []),
          ],
        }
      : {};

  const candidates = await db.product.findMany({
    where: {
      published: true,
      deletedAt: null,
      ...(input.category ? { category: input.category } : {}),
      ...(filterStyleIds.length > 0
        ? { styles: { some: { styleId: { in: filterStyleIds } } } }
        : {}),
      ...textOrStyle,
    },
    select: {
      id: true,
      name: true,
      subtitle: true,
      garmentType: true,
      searchText: true,
      createdAt: true,
      styles: { select: { styleId: true, isPrimary: true } },
      tags: { select: { kind: true, value: true } },
    },
    take: 500,
  });

  const affinity =
    input.userId || input.anonId
      ? await readAffinity({ userId: input.userId ?? null, anonId: input.anonId ?? null })
      : {};
  const hasTaste = Object.keys(affinity).length > 0;
  const maxAffinity = hasTaste ? Math.max(...Object.values(affinity)) : 0;

  const scored: SearchResultItem[] = candidates.map((product) => {
    let score = 0;
    const reasons: string[] = [];
    const matchedStyles: string[] = [];

    // --- estilo -----------------------------------------------------------
    for (const link of product.styles) {
      if (!targetStyleIds.has(link.styleId)) continue;
      matchedStyles.push(link.styleId);
      score += WEIGHTS.styleExact + (link.isPrimary ? WEIGHTS.stylePrimary : 0);
    }
    if (matchedStyles.length > 0) {
      const labels = matchedStyles.map((id) => {
        const style = getStyle(id);
        return style ? styleDisplayLabel(style) : id;
      });
      reasons.push(labels.length === 1 ? labels[0]! : `${labels[0]} e mais ${labels.length - 1}`);
    }

    // --- texto ------------------------------------------------------------
    if (tokens.length > 0) {
      const name = normalizeText(product.name);
      const subtitle = normalizeText(`${product.subtitle ?? ""} ${product.garmentType}`);

      if (name === normalizedQuery) {
        score += WEIGHTS.nameExact;
        reasons.push("nome exato");
      } else if (tokens.every((t) => name.includes(t))) {
        score += WEIGHTS.namePartial;
        reasons.push("no nome da peça");
      } else if (tokens.some((t) => name.includes(t))) {
        score += Math.round(WEIGHTS.namePartial / 2);
      }

      const inSubtitle = tokens.filter((t) => subtitle.includes(t)).length;
      if (inSubtitle > 0) score += WEIGHTS.subtitle * (inSubtitle / tokens.length);

      const inHaystack = tokens.filter((t) => product.searchText.includes(t)).length;
      if (inHaystack > 0) {
        score += WEIGHTS.haystack;
        score += WEIGHTS.tokenBonus * (inHaystack - 1);
        if (reasons.length === 0) reasons.push("corresponde à descrição");
      }
    }

    // --- gosto ------------------------------------------------------------
    // Enviesa, nunca decide. Uma peça sem relevância nenhuma não sobe na busca
    // só porque combina com o perfil — isso quebraria a confiança na busca.
    if (hasTaste && maxAffinity > 0) {
      const facets = product.tags.map((t) => `${t.kind}:${t.value}`);
      const affinitySum = facets.reduce((sum, f) => sum + (affinity[f] ?? 0), 0);
      if (affinitySum > 0 && score > 0) {
        score += Math.min(WEIGHTS.tasteMax, Math.round((affinitySum / maxAffinity) * WEIGHTS.tasteMax));
      }
    }

    // Sem consulta e sem filtro: navegação pura, ordenada por novidade.
    //
    // O timestamp entra em milissegundos inteiros, sem dividir. Uma divisão por
    // 1e6 empatava duas peças criadas com poucos milissegundos de diferença, e
    // o desempate virava ordem alfabética de id — que não é "novidade" nenhuma.
    if (tokens.length === 0 && targetStyleIds.size === 0) {
      score = product.createdAt.getTime();
      reasons.push("novidade do ateliê");
    }

    return {
      productId: product.id,
      score,
      reason: reasons[0] ?? "corresponde à busca",
      matchedStyles,
    };
  });

  const ranked = scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));

  // Zero resultado nunca é uma tela vazia. Sugere estilos vizinhos aos que a
  // consulta apontou, ou os estilos mais próximos do termo digitado.
  const suggestions =
    ranked.length === 0 && normalizedQuery.length >= 2
      ? suggestStyles(detected.map((d) => d.style), normalizedQuery, 6)
      : [];

  log.debug("search.executed", {
    query: normalizedQuery,
    detectedStyles: detected.map((d) => d.styleId),
    candidates: candidates.length,
    results: ranked.length,
  });

  return {
    items: ranked.slice(offset, offset + limit),
    detectedStyles: detected.map((d) => d.style),
    suggestions,
    total: ranked.length,
    normalizedQuery,
  };
}

/** Vizinhança curada dos estilos detectados; senão, um recorte diverso do catálogo. */
function suggestStyles(
  detected: StyleDefinition[],
  normalizedQuery: string,
  limit: number,
): StyleDefinition[] {
  const out = new Map<string, StyleDefinition>();

  // 1. Vizinhança curada dos estilos que a frase apontou.
  for (const style of detected) {
    for (const relatedId of style.related) {
      const related = getStyle(relatedId);
      if (related && !detected.some((d) => d.id === related.id)) out.set(related.id, related);
    }
  }

  // 2. Nenhum estilo casou inteiro: tenta prefixo, que pega o termo digitado
  //    pela metade ou escrito de um jeito só parecido.
  if (out.size === 0 && normalizedQuery.length >= 3) {
    for (const match of matchStyles(normalizedQuery, limit, { prefix: true })) {
      out.set(match.style.id, match.style);
    }
  }

  // 3. Sem pista nenhuma: uma amostra larga, alternando entre os grupos, para
  //    que a pessoa veja a extensão do catálogo em vez de um canto dele.
  if (out.size === 0) {
    const byGroup = new Map<string, StyleDefinition[]>();
    const seenFamilies = new Set<string>();
    for (const style of STYLES) {
      const key = `${style.group}:${style.family}`;
      if (seenFamilies.has(key)) continue;
      seenFamilies.add(key);
      const bucket = byGroup.get(style.group) ?? [];
      bucket.push(style);
      byGroup.set(style.group, bucket);
    }
    const buckets = [...byGroup.values()];
    for (let round = 0; out.size < limit && buckets.some((b) => b.length > round); round += 1) {
      for (const bucket of buckets) {
        const style = bucket[round];
        if (style) out.set(style.id, style);
        if (out.size >= limit) break;
      }
    }
  }

  return [...out.values()].slice(0, limit);
}

/**
 * Sugestões de digitação, para o campo de busca.
 * Só estilos: sugerir nomes de produto abriria uma via para enumerar o catálogo
 * despublicado por prefixo.
 */
export function searchSuggestions(partial: string, limit = 6): StyleDefinition[] {
  const normalized = normalizeText(partial);
  if (normalized.length < 2) return [];
  return matchStyles(normalized, limit, { prefix: true }).map((m) => m.style);
}

export { buildSearchText };

/**
 * Reconstrói o índice de busca de um produto.
 *
 * `reindexProduct` é a ÚNICA função que escreve `searchText`. Tudo que puder ser
 * buscado precisa passar por aqui, senão a coluna vira mentira parcial — o pior
 * tipo de índice. A fórmula em si mora em `search-text.ts`, sem dependência de
 * banco, para que o seed use exatamente a mesma.
 */
/** Reindexa um produto a partir do banco. Chamado após qualquer escrita nele. */
export async function reindexProduct(productId: string): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      name: true, subtitle: true, description: true, garmentType: true, category: true,
      styles: { select: { styleId: true } },
    },
  });
  if (!product) return;

  await db.product.update({
    where: { id: productId },
    data: {
      searchText: buildSearchText({
        name: product.name,
        subtitle: product.subtitle,
        description: product.description,
        garmentType: product.garmentType,
        category: product.category,
        styleIds: product.styles.map((s) => s.styleId),
      }),
    },
  });
}

/** Reindexa o catálogo inteiro. Usado no seed e após mexer no catálogo de estilos. */
export async function reindexAllProducts(): Promise<number> {
  const products = await db.product.findMany({
    select: {
      id: true, name: true, subtitle: true, description: true, garmentType: true, category: true,
      styles: { select: { styleId: true } },
    },
  });
  for (const product of products) {
    await db.product.update({
      where: { id: product.id },
      data: {
        searchText: buildSearchText({
          name: product.name,
          subtitle: product.subtitle,
          description: product.description,
          garmentType: product.garmentType,
          category: product.category,
          styleIds: product.styles.map((s) => s.styleId),
        }),
      },
    });
  }
  log.info("search.reindexed", { count: products.length });
  return products.length;
}
