import { db } from "../db";
import { AppError, notFound, forbidden } from "../lib/errors";
import { log, newCorrelationId } from "../lib/logger";
import { enforceRateLimit, RATE_LIMITS } from "../lib/ratelimit";
import { runAnalysis } from "../ai";
import type { AnalysisReference } from "../ai";
import { inspectUserText } from "../ai/guardrails";
import {
  DesignSpecificationSchema,
  specHash,
  parseSpecJson,
  blockingWarnings,
  type DesignSpecification,
} from "./spec";
import { quoteDesign, quoteExpiry } from "./pricing";
import { recordAudit } from "./audit";
import { readFileBytes } from "../storage";
import { samplePalette } from "../storage/validate";
import type { ReferenceRole } from "./enums";

/**
 * The design flow: references in, versioned specification out.
 *
 * The invariant that everything else depends on: an approved DesignVersion is
 * immutable. Editing an approved design does not change it — it creates version
 * n+1, which needs its own approval and its own quote. Production is always
 * pinned to a specific version and its hash, so "the atelier made something
 * different from what I approved" is a question with a definitive answer.
 */

const MAX_REFERENCES = 4;
/** Guards the AI request body: four 10 MB images base64-encoded is ~53 MB. */
const MAX_VISION_BYTES = 4 * 1024 * 1024;

export async function createDesign(params: {
  userId: string;
  title: string;
  briefText: string;
}): Promise<string> {
  const design = await db.design.create({
    data: {
      userId: params.userId,
      title: params.title.trim().slice(0, 120) || "Peça sem título",
      briefText: params.briefText.trim().slice(0, 4000),
      status: "DRAFT",
    },
  });
  return design.id;
}

/** Every design read for a customer is ownership-scoped at the query. */
export async function getDesignForUser(designId: string, userId: string) {
  const design = await db.design.findFirst({
    where: { id: designId, userId, deletedAt: null },
    include: {
      references: { include: { referenceImage: { include: { file: true } } }, orderBy: { position: "asc" } },
      versions: { orderBy: { version: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 5 },
      measurementProfile: true,
      quotations: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!design) throw notFound("O design");
  return design;
}

export async function attachReference(params: {
  designId: string;
  userId: string;
  referenceImageId: string;
  role: ReferenceRole;
  weight?: number;
}): Promise<void> {
  const [design, reference] = await Promise.all([
    db.design.findFirst({ where: { id: params.designId, userId: params.userId, deletedAt: null } }),
    db.referenceImage.findFirst({ where: { id: params.referenceImageId, userId: params.userId, deletedAt: null } }),
  ]);
  if (!design) throw notFound("O design");
  // The reference must belong to the same customer. Attaching someone else's
  // upload by id is the classic IDOR here, and this is where it is stopped.
  if (!reference) throw forbidden("usar esta referência");

  const count = await db.designReference.count({ where: { designId: params.designId } });
  if (count >= MAX_REFERENCES) {
    throw new AppError("PRECONDITION_FAILED", `Um design combina no máximo ${MAX_REFERENCES} referências.`, {
      action: "Remova uma referência antes de adicionar outra — ou crie um segundo design.",
    });
  }

  await db.designReference.create({
    data: {
      designId: params.designId,
      referenceImageId: params.referenceImageId,
      role: params.role,
      weight: Math.min(100, Math.max(0, params.weight ?? 100)),
      position: count,
    },
  });
}

export interface AnalysisOutcomeSummary {
  analysisId: string;
  versionId: string;
  version: number;
  degraded: boolean;
  degradedReason?: string;
  guardrailNeedsReview: boolean;
}

/**
 * Runs the analysis and writes the resulting specification as a new version.
 *
 * The AI's output never lands anywhere except a DesignVersion authored by "AI"
 * and awaiting review. There is no path from a model response to a production
 * job that does not pass through a human clicking approve.
 */
export async function analyseDesign(params: {
  designId: string;
  userId: string;
  rateLimitSubject: string;
}): Promise<AnalysisOutcomeSummary> {
  await enforceRateLimit(RATE_LIMITS.aiAnalysis, params.rateLimitSubject, { userId: params.userId, route: "design.analyse" });

  const correlationId = newCorrelationId();
  const design = await getDesignForUser(params.designId, params.userId);

  const guardrail = inspectUserText(design.briefText ?? "", { userId: params.userId, correlationId });
  if (guardrail.blocked) {
    const detail = guardrail.findings.find((f) => f.code === "PROHIBITED_ITEM")?.detail;
    await db.moderationCase.create({
      data: {
        targetType: "DESIGN",
        targetId: design.id,
        reason: "PROHIBITED",
        severity: "HIGH",
        source: "AUTOMATED",
        detail: detail ?? "Conteúdo proibido detectado no texto do pedido.",
      },
    });
    throw new AppError("AI_CONTENT_BLOCKED", detail ?? "Não produzimos este tipo de peça.", {
      action: "Ajuste a descrição do pedido. Nossa política de produção explica o que não é aceito.",
    });
  }

  await db.design.update({ where: { id: design.id }, data: { status: "ANALYZING" } });

  const analysis = await db.aIAnalysis.create({
    data: {
      designId: design.id,
      provider: "pending",
      status: "RUNNING",
      correlationId,
      guardrailJson: JSON.stringify({ findings: guardrail.findings, needsReview: guardrail.needsReview }),
    },
  });

  try {
    // Load image payloads only for references small enough to send, newest first.
    const references: AnalysisReference[] = [];
    let visionBudget = MAX_VISION_BYTES;
    for (const link of design.references) {
      const file = link.referenceImage.file;
      let imageBase64: string | undefined;
      let palette: { hex: string; share: number }[] = [];
      if (file.scanStatus === "CLEAN" || file.scanStatus === "PENDING") {
        try {
          const bytes = await readFileBytes(file.storageKey);
          palette = samplePalette(bytes);
          if (bytes.length <= visionBudget) {
            imageBase64 = bytes.toString("base64");
            visionBudget -= bytes.length;
          }
        } catch (error) {
          log.warn("designs.reference_unreadable", { fileId: file.id, error });
        }
      }
      references.push({
        id: link.referenceImageId,
        role: link.role as ReferenceRole,
        caption: link.referenceImage.caption ?? undefined,
        weight: link.weight,
        meta: {
          widthPx: file.widthPx,
          heightPx: file.heightPx,
          byteSize: file.byteSize,
          contentType: file.contentType,
          dominantColors: palette,
        },
        ...(imageBase64 ? { imageBase64 } : {}),
      });
    }

    const measurements = design.measurementProfile
      ? {
          provided: true,
          // Only the measurements actually filled in are sent. A null field must
          // reach the analyser as "absent", never as a zero.
          fields: collectMeasurements(design.measurementProfile),
          source: design.measurementProfile.source,
        }
      : { provided: false, fields: {}, source: "SELF_REPORTED" };

    const result = await runAnalysis({
      designId: design.id,
      title: design.title,
      briefText: guardrail.sanitizedText,
      references,
      measurements,
      preferences: { cutProfile: "UNISEX" },
      correlationId,
    });

    // If the guardrails saw an IP signal, the spec carries the warning whether or
    // not the model noticed — this is a policy decision, not a model decision.
    let spec = result.spec;
    if (guardrail.needsReview && !spec.warnings.some((w) => w.code === "POSSIBLE_THIRD_PARTY_IP")) {
      spec = {
        ...spec,
        warnings: [
          ...spec.warnings,
          {
            code: "POSSIBLE_THIRD_PARTY_IP" as const,
            severity: "ATTENTION" as const,
            message:
              "Seu pedido menciona ou parece reproduzir um personagem, marca ou arte de terceiro. Reproduzir obra protegida pode exigir autorização do titular.",
            resolution:
              "Peças de uso pessoal e não comercial costumam ser aceitas; revenda não. Nossa política de propriedade intelectual explica o limite, e nossa equipe revisa antes da produção.",
          },
        ],
      };
    }

    const versionRow = await saveSpecVersion({
      designId: design.id,
      spec,
      authoredBy: "AI",
      authorUserId: null,
      changeSummary: result.degraded
        ? "Ficha gerada pelo analisador determinístico (leitura de imagem indisponível)."
        : "Primeira leitura das referências.",
    });

    await db.aIAnalysis.update({
      where: { id: analysis.id },
      data: {
        provider: result.provider,
        model: result.model,
        status: "SUCCEEDED",
        resultJson: JSON.stringify(spec),
        latencyMs: result.latencyMs,
        costCents: result.costCents,
        designVersionId: versionRow.id,
        completedAt: new Date(),
      },
    });

    await db.design.update({
      where: { id: design.id },
      data: { status: "NEEDS_REVIEW", garmentType: spec.garmentType.value },
    });

    if (guardrail.needsReview) {
      await db.moderationCase.create({
        data: {
          targetType: "DESIGN",
          targetId: design.id,
          reason: "IP",
          severity: "MEDIUM",
          source: "AUTOMATED",
          detail: guardrail.findings.map((f) => f.detail).join(" | ").slice(0, 500),
        },
      });
    }

    return {
      analysisId: analysis.id,
      versionId: versionRow.id,
      version: versionRow.version,
      degraded: result.degraded,
      ...(result.degradedReason ? { degradedReason: result.degradedReason } : {}),
      guardrailNeedsReview: guardrail.needsReview,
    };
  } catch (error) {
    await db.aIAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "FAILED",
        failureCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        failureMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        completedAt: new Date(),
      },
    });
    await db.design.update({ where: { id: design.id }, data: { status: "DRAFT" } });
    throw error;
  }
}

const MEASUREMENT_KEYS = [
  "heightMm", "chestMm", "waistMm", "hipMm", "shoulderMm", "sleeveMm",
  "inseamMm", "outseamMm", "neckMm", "thighMm", "wristMm", "torsoMm",
] as const;

type MeasurementColumns = { [K in (typeof MEASUREMENT_KEYS)[number]]: number | null };

function collectMeasurements(profile: MeasurementColumns): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of MEASUREMENT_KEYS) {
    const value = profile[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

export async function saveSpecVersion(params: {
  designId: string;
  spec: DesignSpecification;
  authoredBy: "AI" | "CUSTOMER" | "PRODUCER" | "ADMIN";
  authorUserId: string | null;
  changeSummary: string;
}): Promise<{ id: string; version: number }> {
  const parsed = DesignSpecificationSchema.parse(params.spec);

  const version = await db.$transaction(async (tx) => {
    const last = await tx.designVersion.findFirst({
      where: { designId: params.designId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const next = (last?.version ?? 0) + 1;

    const row = await tx.designVersion.create({
      data: {
        designId: params.designId,
        version: next,
        specJson: JSON.stringify(parsed),
        authoredBy: params.authoredBy,
        authorUserId: params.authorUserId,
        changeSummary: params.changeSummary.slice(0, 400),
      },
    });
    await tx.design.update({ where: { id: params.designId }, data: { currentVersionId: row.id } });
    return row;
  });

  return { id: version.id, version: version.version };
}

/**
 * Customer edits. Always a new version — an approved sheet is never mutated,
 * which is what makes the revision history meaningful rather than decorative.
 */
export async function reviseSpec(params: {
  designId: string;
  userId: string;
  spec: DesignSpecification;
  changeSummary: string;
}): Promise<{ versionId: string; version: number }> {
  const design = await db.design.findFirst({
    where: { id: params.designId, userId: params.userId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!design) throw notFound("O design");
  if (design.status === "ORDERED") {
    throw new AppError("PRECONDITION_FAILED", "Este design já virou um pedido em produção.", {
      action: "Crie uma cópia para fazer uma nova versão, ou fale com o ateliê pelo pedido.",
    });
  }

  const saved = await saveSpecVersion({
    designId: params.designId,
    spec: params.spec,
    authoredBy: "CUSTOMER",
    authorUserId: params.userId,
    changeSummary: params.changeSummary || "Ajustes do cliente na ficha técnica.",
  });

  await db.design.update({ where: { id: params.designId }, data: { status: "NEEDS_REVIEW" } });
  await recordAudit({
    actorUserId: params.userId,
    action: "design.revised",
    targetType: "Design",
    targetId: params.designId,
    newState: { version: saved.version, summary: params.changeSummary },
  });

  return { versionId: saved.id, version: saved.version };
}

/**
 * Approval freezes the version and stamps its hash. From here the customer can
 * be quoted; production will be held to exactly this hash.
 */
export async function approveVersion(params: {
  designId: string;
  versionId: string;
  userId: string;
}): Promise<{ specHash: string }> {
  const version = await db.designVersion.findFirst({
    where: { id: params.versionId, designId: params.designId, design: { userId: params.userId } },
    include: { design: { select: { id: true, userId: true } } },
  });
  if (!version) throw notFound("A versão do design");

  const spec = parseSpecJson(version.specJson);
  const blocking = blockingWarnings(spec);
  if (blocking.length > 0) {
    throw new AppError("SPEC_NOT_APPROVED", blocking[0]!.message, {
      action: blocking[0]!.resolution,
      fields: Object.fromEntries(blocking.map((w) => [w.code, w.resolution])),
    });
  }

  const hash = specHash(spec);
  await db.designVersion.update({
    where: { id: params.versionId },
    data: { approvedAt: new Date(), approvedByUserId: params.userId, specHash: hash },
  });
  await db.design.update({ where: { id: params.designId }, data: { status: "APPROVED" } });

  await recordAudit({
    actorUserId: params.userId,
    action: "design.approved",
    targetType: "DesignVersion",
    targetId: params.versionId,
    newState: { specHash: hash, version: version.version },
  });

  return { specHash: hash };
}

/**
 * Quotes are bound to a spec hash. If the customer edits after quoting, the hash
 * changes and the old quote no longer applies — checkout rejects it rather than
 * charging yesterday's price for today's garment.
 */
export async function createQuotation(params: {
  designId: string;
  versionId: string;
  userId: string;
  quantity: number;
  rush: boolean;
}): Promise<string> {
  const version = await db.designVersion.findFirst({
    where: { id: params.versionId, designId: params.designId, design: { userId: params.userId } },
  });
  if (!version) throw notFound("A versão do design");
  if (!version.approvedAt || !version.specHash) {
    throw new AppError("SPEC_NOT_APPROVED", "Aprove a ficha técnica antes de pedir o orçamento.", {
      action: "Revise cada linha da ficha e confirme a aprovação.",
    });
  }

  const spec = parseSpecJson(version.specJson);
  const seller = await db.sellerAccount.findFirst({
    where: { userId: params.userId, status: "APPROVED" },
    select: { discountBp: true },
  });

  const quote = quoteDesign({
    spec,
    quantity: params.quantity,
    rush: params.rush,
    ...(seller ? { sellerDiscountBp: seller.discountBp } : {}),
  });

  const row = await db.quotation.create({
    data: {
      designId: params.designId,
      designVersionId: params.versionId,
      currency: quote.currency,
      breakdownJson: JSON.stringify(quote.lines),
      subtotalCents: quote.subtotalCents,
      aiFeeCents: quote.aiFeeCents,
      serviceFeeCents: quote.serviceFeeCents,
      totalCents: quote.totalCents,
      productionDaysMin: quote.productionDaysMin,
      productionDaysMax: quote.productionDaysMax,
      expiresAt: quoteExpiry(),
      specHash: version.specHash,
    },
  });

  return row.id;
}

/** Rejects a stale quote loudly instead of honouring a price for a changed spec. */
export async function assertQuotationValid(quotationId: string, userId: string) {
  const quotation = await db.quotation.findFirst({
    where: { id: quotationId, design: { userId } },
    include: { designVersion: true },
  });
  if (!quotation) throw notFound("O orçamento");

  if (quotation.expiresAt < new Date()) {
    throw new AppError("QUOTE_EXPIRED", "Este orçamento expirou.", {
      action: "Peça um novo orçamento — os preços de tecido mudam e não queremos cobrar um valor desatualizado.",
    });
  }
  // Recompute from the version's CURRENT content rather than trusting the hash
  // column. Comparing two stored columns would only catch a re-approval; it
  // would miss the content itself changing underneath a live quote, which is
  // exactly the case that must never reach a cutting table at yesterday's price.
  const currentHash = specHash(parseSpecJson(quotation.designVersion.specJson));
  if (currentHash !== quotation.specHash) {
    throw new AppError("SPEC_CHANGED", "A ficha técnica mudou depois deste orçamento.", {
      action: "Aprove a versão atual e gere um novo orçamento.",
      internal: { quoted: quotation.specHash, current: currentHash },
    });
  }
  return quotation;
}
