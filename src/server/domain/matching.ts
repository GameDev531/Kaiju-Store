import { db } from "../db";
import type { DesignSpecification } from "./spec";
import type { JobRole } from "./enums";
import { log } from "../lib/logger";

/**
 * Producer matching.
 *
 * A scoring function, not a black box: every component is named, bounded, and
 * recorded on the offer so an admin can see exactly why a job went where it did.
 *
 * Three rules constrain what may enter the score:
 *  1. Nothing derived from a protected attribute. Location is used only for
 *     shipping distance and material sourcing, never as a proxy for anything else.
 *  2. Hard requirements are filters, not weights — an unverified atelier cannot
 *     be outscored into eligibility by being cheap.
 *  3. The weights are server-side and never returned to a producer. Publishing
 *     the formula turns matching into a gaming exercise.
 */

export interface MatchCandidate {
  producerId: string;
  studioName: string;
  score: number;
  /** Admin-visible only. */
  explanation: {
    component: string;
    points: number;
    detail: string;
  }[];
}

const WEIGHTS = {
  specializationGarment: 30,
  specializationTechnique: 20,
  complexityHeadroom: 15,
  quality: 20,
  onTime: 10,
  capacity: 15,
  verification: 10,
  /** Small nudge towards under-used ateliers so new verified partners get work. */
  fairness: 10,
} as const;

export interface MatchRequest {
  spec: DesignSpecification;
  role: JobRole;
  /** Shipping origin preference — nearer is cheaper and faster, nothing more. */
  preferredState?: string | null;
  excludeProducerIds?: string[];
  limit?: number;
}

function requiredTechniques(spec: DesignSpecification, role: JobRole): string[] {
  if (role === "EMBROIDERY") return ["EMBROIDERY"];
  if (role === "PRINTING") return ["PRINTING"];
  if (role === "THREE_D") return ["THREE_D_PRINTING"];

  const needed: string[] = [];
  if (spec.embroidery) needed.push("EMBROIDERY");
  if (spec.printing) needed.push("PRINTING");
  const material = spec.materialEstimate?.value.toLowerCase() ?? "";
  if (/couro|leather/.test(material)) needed.push("LEATHER");
  if (/malha|jersey|tric/.test(material)) needed.push("KNIT");
  return needed;
}

const GARMENT_KEYS: Record<DesignSpecification["category"], string> = {
  TOPS: "TOPS",
  OUTERWEAR: "OUTERWEAR",
  BOTTOMS: "BOTTOMS",
  DRESSES: "DRESSES",
  KNITWEAR: "KNITWEAR",
  ACCESSORIES: "ACCESSORIES",
};

export async function findProducers(request: MatchRequest): Promise<MatchCandidate[]> {
  const spec = request.spec;
  const complexity = spec.productionComplexity;
  const garmentKey = GARMENT_KEYS[spec.category];
  const techniques = requiredTechniques(spec, request.role);

  // --- hard filters ------------------------------------------------------
  // An atelier must be ACTIVE, verified at least once by a human, able to take
  // this complexity, and not already at capacity. None of these are negotiable
  // by score.
  const eligible = await db.producer.findMany({
    where: {
      status: "ACTIVE",
      verificationLevel: { in: ["VERIFIED", "TRUSTED", "PREMIUM"] },
      maxComplexity: { gte: complexity },
      ...(request.excludeProducerIds?.length ? { id: { notIn: request.excludeProducerIds } } : {}),
    },
    include: { specializations: true },
  });

  const candidates: MatchCandidate[] = [];

  for (const producer of eligible) {
    // Capacity is a filter too: an atelier at its weekly limit is not offered work.
    if (producer.activeJobCount >= producer.weeklyCapacity) continue;

    const explanation: MatchCandidate["explanation"] = [];
    let score = 0;
    const values = new Set(producer.specializations.map((s) => `${s.kind}:${s.value}`));
    const skillOf = (kind: string, value: string) =>
      producer.specializations.find((s) => s.kind === kind && s.value === value)?.skillLevel ?? 0;

    // 1. Does this atelier make this kind of garment?
    if (values.has(`GARMENT:${garmentKey}`)) {
      const skill = skillOf("GARMENT", garmentKey);
      const points = Math.round((WEIGHTS.specializationGarment * skill) / 5);
      score += points;
      explanation.push({
        component: "Especialização no tipo de peça",
        points,
        detail: `Declara ${garmentKey} com nível ${skill}/5.`,
      });
    }

    // 2. Techniques the spec actually needs.
    if (techniques.length > 0) {
      const covered = techniques.filter((t) => values.has(`TECHNIQUE:${t}`));
      // A required technique that nobody holds is handled by splitting the job,
      // not by pretending this atelier can do it.
      const points = Math.round((WEIGHTS.specializationTechnique * covered.length) / techniques.length);
      score += points;
      explanation.push({
        component: "Técnicas exigidas",
        points,
        detail: `${covered.length}/${techniques.length} cobertas (${covered.join(", ") || "nenhuma"}).`,
      });
    } else {
      score += WEIGHTS.specializationTechnique;
      explanation.push({
        component: "Técnicas exigidas",
        points: WEIGHTS.specializationTechnique,
        detail: "Peça sem técnica especial.",
      });
    }

    // 3. Headroom: prefer an atelier comfortably above this complexity, so a
    //    hard piece does not land on someone working at their ceiling.
    const headroom = producer.maxComplexity - complexity;
    const headroomPoints = Math.min(WEIGHTS.complexityHeadroom, headroom * 5);
    score += headroomPoints;
    explanation.push({
      component: "Folga de complexidade",
      points: headroomPoints,
      detail: `Teto ${producer.maxComplexity}, peça ${complexity}.`,
    });

    // 4. Outcome history. Zero-history ateliers sit at the neutral midpoint
    //    rather than at the bottom — otherwise nobody new ever gets a first job.
    const qualityPoints = Math.round((WEIGHTS.quality * producer.qualityScore) / 1000);
    score += qualityPoints;
    explanation.push({
      component: "Índice de qualidade",
      points: qualityPoints,
      detail: `${producer.qualityScore}/1000 sobre ${producer.completedJobs} entregas.`,
    });

    const onTimePoints =
      producer.completedJobs > 0 ? Math.round((WEIGHTS.onTime * producer.onTimeRateBp) / 10_000) : Math.round(WEIGHTS.onTime / 2);
    score += onTimePoints;
    explanation.push({
      component: "Pontualidade",
      points: onTimePoints,
      detail:
        producer.completedJobs > 0
          ? `${(producer.onTimeRateBp / 100).toFixed(1)}% no prazo.`
          : "Sem histórico — pontuação neutra.",
    });

    // 5. Free capacity right now.
    const free = producer.weeklyCapacity - producer.activeJobCount;
    const capacityPoints = Math.min(WEIGHTS.capacity, free * 5);
    score += capacityPoints;
    explanation.push({
      component: "Capacidade livre",
      points: capacityPoints,
      detail: `${free} de ${producer.weeklyCapacity} vagas na semana.`,
    });

    // 6. Verification tier.
    const tierPoints =
      producer.verificationLevel === "PREMIUM" ? WEIGHTS.verification
      : producer.verificationLevel === "TRUSTED" ? Math.round(WEIGHTS.verification * 0.7)
      : Math.round(WEIGHTS.verification * 0.4);
    score += tierPoints;
    explanation.push({
      component: "Nível de verificação",
      points: tierPoints,
      detail: producer.verificationLevel,
    });

    // 7. Fairness nudge. Without it, the top-scoring studio takes every job and
    //    the network never develops depth.
    const fairnessPoints = producer.activeJobCount === 0 ? WEIGHTS.fairness : Math.max(0, WEIGHTS.fairness - producer.activeJobCount * 3);
    score += fairnessPoints;
    explanation.push({
      component: "Distribuição de trabalho",
      points: fairnessPoints,
      detail: `${producer.activeJobCount} trabalho(s) em andamento.`,
    });

    // 8. Proximity — only as a shipping cost and lead-time consideration.
    if (request.preferredState && producer.state === request.preferredState) {
      score += 5;
      explanation.push({ component: "Proximidade logística", points: 5, detail: `Mesmo estado (${producer.state}).` });
    }

    candidates.push({ producerId: producer.id, studioName: producer.studioName, score, explanation });
  }

  candidates.sort((a, b) => b.score - a.score || a.producerId.localeCompare(b.producerId));
  const limit = request.limit ?? 5;

  log.info("matching.evaluated", {
    category: spec.category,
    complexity,
    eligibleCount: eligible.length,
    matchedCount: Math.min(candidates.length, limit),
  });

  return candidates.slice(0, limit);
}

/**
 * Decides whether a design needs to be split across specialists.
 *
 * A garment with embroidery and a 3D-printed accessory is genuinely two crafts;
 * pretending otherwise produces a job nobody can complete.
 */
export function planJobSplit(spec: DesignSpecification): { role: JobRole; reason: string }[] {
  const jobs: { role: JobRole; reason: string }[] = [
    { role: "PRIMARY", reason: "Modelagem, corte e costura da peça." },
  ];
  if (spec.embroidery) {
    jobs.push({ role: "EMBROIDERY", reason: "Bordado exige máquina e arte digitalizada específicas." });
  }
  if (spec.printing) {
    jobs.push({ role: "PRINTING", reason: "Estampa exige preparo de arte e equipamento próprio." });
  }
  const decor = spec.decorativeElements.map((d) => d.value.toLowerCase()).join(" ");
  if (/3d|resina|impress[ãa]o 3d|miniatura/.test(decor)) {
    jobs.push({ role: "THREE_D", reason: "Componente impresso em 3D." });
  }
  return jobs;
}
