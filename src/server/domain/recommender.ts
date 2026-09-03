import { db } from "../db";
import type { InteractionKind } from "./enums";
import { log } from "../lib/logger";

/**
 * The taste engine.
 *
 * What it does: learns which *facets* of clothing a person keeps coming back to
 * — techwear silhouettes, mecha motifs, muted palettes, oversized fits — and
 * ranks the catalogue against that.
 *
 * What it deliberately does not do:
 *  - It never keys on anything about the person. Only on what they looked at.
 *  - It stores integer scores over a small closed facet vocabulary, not an
 *    opaque embedding, so a customer can read their own profile and delete it.
 *  - It decays. A phase someone went through in March should not define their
 *    homepage in September.
 *
 * The design is content-based rather than collaborative on purpose: with an
 * early catalogue and few customers, "people like you also bought" produces
 * either noise or a feedback loop. Facet affinity works from the first session.
 */

/** How much each kind of interaction says about taste. Buying says the most. */
const EVENT_WEIGHTS: Record<InteractionKind, number> = {
  VIEW: 1,
  DWELL: 2,
  SEARCH: 3,
  SAVE: 5,
  CUSTOMIZE: 6,
  ADD_TO_CART: 7,
  PURCHASE: 12,
};

/**
 * Half-life of an interaction, in days. After 45 days a signal counts half.
 * Applied as integer arithmetic on read so we never rewrite the whole table.
 */
const HALF_LIFE_DAYS = 45;

/** Ceiling per facet so one obsessive week cannot flatten everything else. */
const MAX_FACET_SCORE = 1_000;

export type Affinity = Record<string, number>;

export interface RecordInteractionInput {
  kind: InteractionKind;
  userId?: string | null;
  anonId?: string | null;
  productId?: string | null;
  query?: string | null;
}

/**
 * Records a signal. Fire-and-forget from the caller's perspective: a failure
 * here must never break a page render.
 */
export async function recordInteraction(input: RecordInteractionInput): Promise<void> {
  if (!input.userId && !input.anonId) return;
  try {
    let facetsJson: string | null = null;

    if (input.productId) {
      const tags = await db.productTag.findMany({
        where: { productId: input.productId },
        select: { kind: true, value: true },
      });
      // Denormalised at write time so scoring never fans out into joins.
      facetsJson = JSON.stringify(tags.map((t) => `${t.kind}:${t.value}`));
    }

    await db.interactionEvent.create({
      data: {
        kind: input.kind,
        userId: input.userId ?? null,
        anonId: input.userId ? null : (input.anonId ?? null),
        productId: input.productId ?? null,
        query: input.query ? normalizeQuery(input.query) : null,
        facetsJson,
        weight: EVENT_WEIGHTS[input.kind],
      },
    });

    const { enqueue } = await import("../jobs/queue");
    await enqueue(
      "taste_profile",
      { userId: input.userId ?? null, anonId: input.anonId ?? null },
      // One rebuild per subject per 10-minute bucket, however many events land.
      { dedupeKey: `taste:${input.userId ?? input.anonId}:${Math.floor(Date.now() / 600_000)}`, delaySeconds: 30 },
    );
  } catch (error) {
    log.warn("recommender.record_failed", { kind: input.kind, error });
  }
}

export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Maps free-text searches onto the facet vocabulary. This is what makes "o que
 * o cliente costuma pesquisar" actually steer recommendations rather than just
 * filling a log table.
 */
const QUERY_FACETS: { re: RegExp; facets: string[] }[] = [
  { re: /\b(techwear|tatico|tactical|utility|cargo)\b/, facets: ["STYLE:techwear", "FIT:utility"] },
  { re: /\b(street|streetwear|urbano|oversized|baggy)\b/, facets: ["STYLE:streetwear", "FIT:oversized"] },
  { re: /\b(mecha|robo|piloto|gundam|eva)\b/, facets: ["MOTIF:mecha"] },
  { re: /\b(kimono|haori|yukata|japones|japonesa|wafuku)\b/, facets: ["MOTIF:wafuku", "STYLE:neo_traditional"] },
  { re: /\b(dark|preto|black|gotic|sombrio)\b/, facets: ["PALETTE:dark"] },
  { re: /\b(pastel|clarinho|kawaii|fofo|rosa)\b/, facets: ["PALETTE:pastel", "MOTIF:kawaii"] },
  { re: /\b(cyber|neon|futurista|cyberpunk)\b/, facets: ["STYLE:cyber", "PALETTE:neon"] },
  { re: /\b(vintage|retro|anos 90|90s|y2k)\b/, facets: ["STYLE:retro"] },
  { re: /\b(minimal|clean|liso|basico)\b/, facets: ["STYLE:minimal"] },
  { re: /\b(bordado|embroider)\b/, facets: ["FABRIC:embroidered"] },
  { re: /\b(moletom|hoodie|casaco|jaqueta)\b/, facets: ["FIT:relaxed"] },
  { re: /\b(couro|leather|biker)\b/, facets: ["FABRIC:leather", "STYLE:biker"] },
  { re: /\b(cosplay|fantasia|personagem)\b/, facets: ["FANDOM_GENRE:cosplay"] },
  { re: /\b(shonen|shounen|luta|batalha)\b/, facets: ["FANDOM_GENRE:shonen"] },
  { re: /\b(slice of life|cotidiano|escolar)\b/, facets: ["FANDOM_GENRE:slice_of_life"] },
  { re: /\b(horror|terror|sombra)\b/, facets: ["FANDOM_GENRE:horror", "PALETTE:dark"] },
];

export function facetsFromQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  const out = new Set<string>();
  for (const entry of QUERY_FACETS) {
    if (entry.re.test(normalized)) for (const f of entry.facets) out.add(f);
  }
  return [...out];
}

/**
 * Rebuilds a subject's affinity vector from their event history.
 *
 * Recomputed rather than incremented so that decay stays correct and a deleted
 * event actually disappears from the profile — an increment-only counter would
 * make "delete my data" a lie.
 */
export async function rebuildTasteProfile(subject: {
  userId?: string | null;
  anonId?: string | null;
}): Promise<Affinity> {
  const where = subject.userId ? { userId: subject.userId } : { anonId: subject.anonId ?? "" };

  const events = await db.interactionEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 2_000,
    select: { kind: true, weight: true, facetsJson: true, query: true, createdAt: true },
  });

  const affinity: Affinity = {};
  const now = Date.now();

  for (const event of events) {
    const ageDays = (now - event.createdAt.getTime()) / 86_400_000;
    // 2^(-age/halflife), in integer basis points.
    const decayBp = Math.max(0, Math.round(10_000 * Math.pow(2, -ageDays / HALF_LIFE_DAYS)));
    if (decayBp === 0) continue;
    const effective = Math.round((event.weight * decayBp) / 10_000);
    if (effective === 0) continue;

    const facets: string[] = [];
    if (event.facetsJson) {
      try {
        const parsed = JSON.parse(event.facetsJson) as unknown;
        if (Array.isArray(parsed)) facets.push(...parsed.filter((f): f is string => typeof f === "string"));
      } catch {
        // A corrupt row contributes nothing rather than failing the rebuild.
      }
    }
    if (event.query) facets.push(...facetsFromQuery(event.query));

    for (const facet of facets) {
      affinity[facet] = Math.min(MAX_FACET_SCORE, (affinity[facet] ?? 0) + effective);
    }
  }

  const payload = {
    affinityJson: JSON.stringify(affinity),
    eventCount: events.length,
    lastEventAt: events[0]?.createdAt ?? null,
  };

  if (subject.userId) {
    await db.tasteProfile.upsert({
      where: { userId: subject.userId },
      create: { userId: subject.userId, ...payload },
      update: payload,
    });
  } else if (subject.anonId) {
    await db.tasteProfile.upsert({
      where: { anonId: subject.anonId },
      create: { anonId: subject.anonId, ...payload },
      update: payload,
    });
  }

  return affinity;
}

export async function readAffinity(subject: { userId?: string | null; anonId?: string | null }): Promise<Affinity> {
  if (!subject.userId && !subject.anonId) return {};
  const profile = subject.userId
    ? await db.tasteProfile.findUnique({ where: { userId: subject.userId } })
    : await db.tasteProfile.findUnique({ where: { anonId: subject.anonId ?? "" } });
  if (!profile) return {};
  try {
    const parsed = JSON.parse(profile.affinityJson) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Affinity) : {};
  } catch {
    return {};
  }
}

export interface Recommendation {
  productId: string;
  score: number;
  /** Shown to the customer. Recommendations that cannot explain themselves are noise. */
  reason: string;
  matchedFacets: string[];
}

export interface RecommendOptions {
  userId?: string | null;
  anonId?: string | null;
  limit?: number;
  excludeProductIds?: string[];
  /** Restrict to a category, e.g. on a category landing page. */
  category?: string;
}

const FACET_LABELS: Record<string, string> = {
  "STYLE:techwear": "techwear",
  "STYLE:streetwear": "streetwear",
  "STYLE:cyber": "estética cyber",
  "STYLE:retro": "retrô",
  "STYLE:minimal": "minimalismo",
  "STYLE:neo_traditional": "recorte neo-tradicional",
  "STYLE:biker": "linha biker",
  "MOTIF:mecha": "motivos mecha",
  "MOTIF:wafuku": "referências japonesas",
  "MOTIF:kawaii": "estética kawaii",
  "PALETTE:dark": "paleta escura",
  "PALETTE:pastel": "tons pastel",
  "PALETTE:neon": "acentos neon",
  "FIT:oversized": "modelagem oversized",
  "FIT:relaxed": "caimento solto",
  "FIT:utility": "pegada utilitária",
  "FABRIC:leather": "couro",
  "FABRIC:embroidered": "bordados",
  "FANDOM_GENRE:shonen": "referências shonen",
  "FANDOM_GENRE:cosplay": "peças de cosplay",
  "FANDOM_GENRE:horror": "clima sombrio",
  "FANDOM_GENRE:slice_of_life": "estética do cotidiano",
};

const labelFor = (facet: string): string => FACET_LABELS[facet] ?? facet.split(":")[1]?.replace(/_/g, " ") ?? facet;

/**
 * Scores the catalogue against the affinity vector.
 *
 * Scoring runs in the application rather than in SQL because the facet overlap
 * is a small dot product over a few hundred published products — well inside a
 * single query's worth of work, and far easier to explain and test than a
 * hand-tuned SQL ranking. When the catalogue outgrows this, the same function
 * becomes the reranker over a cheaper candidate query.
 */
export async function recommend(options: RecommendOptions): Promise<Recommendation[]> {
  const limit = options.limit ?? 8;
  const affinity = await readAffinity(options);

  const products = await db.product.findMany({
    where: {
      published: true,
      deletedAt: null,
      ...(options.category ? { category: options.category } : {}),
      ...(options.excludeProductIds?.length ? { id: { notIn: options.excludeProductIds } } : {}),
    },
    include: { tags: { select: { kind: true, value: true } } },
    take: 500,
  });

  const hasSignal = Object.keys(affinity).length > 0;

  const scored = products.map((product) => {
    const facets = product.tags.map((t) => `${t.kind}:${t.value}`);
    let score = 0;
    const matched: string[] = [];

    for (const facet of facets) {
      const weight = affinity[facet];
      if (weight && weight > 0) {
        score += weight;
        matched.push(facet);
      }
    }

    // Normalise by facet count so a heavily tagged product does not win purely
    // on surface area.
    if (facets.length > 0) score = Math.round(score / Math.sqrt(facets.length));

    // Cold start: with no signal, fall back to something defensible — newest
    // published work — rather than to a fabricated "trending" ranking.
    if (!hasSignal) {
      score = Math.round(product.createdAt.getTime() / 1_000_000_000);
    }

    matched.sort((a, b) => (affinity[b] ?? 0) - (affinity[a] ?? 0));

    return {
      productId: product.id,
      score,
      matchedFacets: matched.slice(0, 3),
      reason: !hasSignal
        ? "Novidade do ateliê"
        : matched.length > 0
          ? `Combina com seu interesse em ${matched.slice(0, 2).map(labelFor).join(" e ")}`
          : "Da mesma linha das peças que você viu",
    };
  });

  scored.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
  return scored.filter((s) => s.score > 0).slice(0, limit);
}

/**
 * "Complete the look" / "similar to this" — facet overlap with one product
 * rather than with a person. Used on product pages, where the strongest signal
 * is the thing being looked at right now.
 */
export async function similarTo(productId: string, limit = 4): Promise<Recommendation[]> {
  const source = await db.product.findUnique({
    where: { id: productId },
    include: { tags: true },
  });
  if (!source) return [];
  const sourceFacets = new Set(source.tags.map((t) => `${t.kind}:${t.value}`));

  const others = await db.product.findMany({
    where: { published: true, deletedAt: null, id: { not: productId } },
    include: { tags: true },
    take: 300,
  });

  return others
    .map((p) => {
      const facets = p.tags.map((t) => `${t.kind}:${t.value}`);
      const overlap = facets.filter((f) => sourceFacets.has(f));
      // Jaccard-style similarity, scaled to an integer.
      const union = new Set([...facets, ...sourceFacets]).size;
      const score = union === 0 ? 0 : Math.round((overlap.length * 1000) / union);
      return {
        productId: p.id,
        score,
        matchedFacets: overlap.slice(0, 3),
        reason:
          overlap.length > 0
            ? `Compartilha ${overlap.slice(0, 2).map(labelFor).join(" e ")}`
            : "Da mesma coleção",
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId))
    .slice(0, limit);
}

/**
 * The customer-facing view of their own profile. Privacy is not just a delete
 * button: someone should be able to see what the system thinks it knows.
 */
export async function explainProfile(subject: { userId?: string | null; anonId?: string | null }): Promise<
  { facet: string; label: string; score: number }[]
> {
  const affinity = await readAffinity(subject);
  return Object.entries(affinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([facet, score]) => ({ facet, label: labelFor(facet), score }));
}

/** Deletes all behavioural data for a subject. Called from privacy controls. */
export async function forgetTasteData(subject: { userId?: string | null; anonId?: string | null }): Promise<void> {
  if (subject.userId) {
    await db.interactionEvent.deleteMany({ where: { userId: subject.userId } });
    await db.tasteProfile.deleteMany({ where: { userId: subject.userId } });
  } else if (subject.anonId) {
    await db.interactionEvent.deleteMany({ where: { anonId: subject.anonId } });
    await db.tasteProfile.deleteMany({ where: { anonId: subject.anonId } });
  }
}
