import { z } from "zod";
import { createHash } from "node:crypto";
import { ConfidenceKindSchema, ReferenceRoleSchema } from "./enums";

/**
 * The Design Specification — the document the whole platform revolves around.
 *
 * It is produced by the AI, edited by the customer, frozen on approval, and read
 * by the atelier. Three properties matter above all:
 *
 *  1. Every substantive field carries its own epistemic status. "Cotton twill"
 *     is worthless to a tailor without knowing whether it was seen, guessed, or
 *     suggested. `SpecField` makes that impossible to omit.
 *  2. It is strictly validated. Model output that does not parse is rejected,
 *     never coerced — an invalid spec must fail loudly, not reach a cutting table.
 *  3. It is hashable. The approved hash is what production is held to.
 */

// A single specified attribute, always with its provenance attached.
export const SpecFieldSchema = z.object({
  /** The value in the customer's language, e.g. "Manga raglan, 3/4". */
  value: z.string().min(1).max(400),
  confidence: ConfidenceKindSchema,
  /** Which uploaded reference drove this, when any did. */
  sourceRole: ReferenceRoleSchema.optional(),
  /** Why the AI landed here — shown on demand, not by default. */
  rationale: z.string().max(600).optional(),
  /** Set when the customer overrode the AI. Production trusts this over `value`'s origin. */
  editedByCustomer: z.boolean().default(false),
});
export type SpecField = z.infer<typeof SpecFieldSchema>;

const optionalField = SpecFieldSchema.optional();

export const MeasurementSetSchema = z.object({
  // Millimetres, integers. Nothing in production ever sees a float.
  heightMm: z.number().int().min(500).max(2500).optional(),
  chestMm: z.number().int().min(400).max(2000).optional(),
  waistMm: z.number().int().min(300).max(2000).optional(),
  hipMm: z.number().int().min(400).max(2200).optional(),
  shoulderMm: z.number().int().min(200).max(900).optional(),
  sleeveMm: z.number().int().min(100).max(1100).optional(),
  inseamMm: z.number().int().min(200).max(1300).optional(),
  outseamMm: z.number().int().min(300).max(1500).optional(),
  neckMm: z.number().int().min(200).max(700).optional(),
  thighMm: z.number().int().min(250).max(1200).optional(),
  wristMm: z.number().int().min(100).max(400).optional(),
  torsoMm: z.number().int().min(300).max(1200).optional(),
  source: z.enum(["SELF_REPORTED", "TAILOR_MEASURED", "FROM_GARMENT"]).default("SELF_REPORTED"),
  /** Tolerance the atelier works to, agreed up front rather than argued later. */
  toleranceMm: z.number().int().min(5).max(40).default(15),
});
export type MeasurementSet = z.infer<typeof MeasurementSetSchema>;

export const ConstructionNoteSchema = z.object({
  topic: z.string().min(1).max(120),
  note: z.string().min(1).max(800),
  confidence: ConfidenceKindSchema,
  /** True when the atelier must confirm before proceeding. */
  blocksProduction: z.boolean().default(false),
});

export const SpecWarningSchema = z.object({
  code: z.enum([
    "MEASUREMENTS_MISSING",
    "FABRIC_UNDETERMINED",
    "COLOR_UNRELIABLE_FROM_IMAGE",
    "COMPLEX_CONSTRUCTION",
    "POSSIBLE_THIRD_PARTY_IP",
    "PRINT_RIGHTS_REQUIRED",
    "REFERENCE_LOW_QUALITY",
    "CONFLICTING_REFERENCES",
    "UNUSUAL_PROPORTIONS",
    "MATERIAL_MAY_NOT_DRAPE_AS_SHOWN",
  ]),
  severity: z.enum(["INFO", "ATTENTION", "BLOCKING"]),
  message: z.string().min(1).max(600),
  /** What the customer can do about it. Never a dead-end warning. */
  resolution: z.string().min(1).max(400),
});
export type SpecWarning = z.infer<typeof SpecWarningSchema>;

export const DesignSpecificationSchema = z.object({
  schemaVersion: z.literal(1),

  // --- identity of the garment -------------------------------------------
  garmentType: SpecFieldSchema,
  category: z.enum(["TOPS", "OUTERWEAR", "BOTTOMS", "DRESSES", "KNITWEAR", "ACCESSORIES"]),
  /** Presentation cut. Never inferred from a person in a photo — customer-set only. */
  cutProfile: z.enum(["UNISEX", "MASC_CUT", "FEM_CUT"]).default("UNISEX"),

  // --- shape ---------------------------------------------------------------
  silhouette: optionalField,
  fit: optionalField,
  length: optionalField,
  sleeveType: optionalField,
  collar: optionalField,
  neckline: optionalField,
  waistband: optionalField,
  closures: optionalField,

  // --- construction --------------------------------------------------------
  pockets: z.array(SpecFieldSchema).max(8).default([]),
  seams: optionalField,
  panels: z.array(SpecFieldSchema).max(12).default([]),
  trims: z.array(SpecFieldSchema).max(10).default([]),
  decorativeElements: z.array(SpecFieldSchema).max(12).default([]),
  embroidery: optionalField,
  printing: optionalField,

  // --- material ------------------------------------------------------------
  materialEstimate: optionalField,
  materialWeight: optionalField,
  colorEstimate: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        /** Approximate only. An image cannot give a calibrated colour. */
        approximateHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        placement: z.string().max(160).optional(),
        confidence: ConfidenceKindSchema,
      }),
    )
    .max(8)
    .default([]),
  pattern: optionalField,
  finishing: optionalField,

  // --- execution -----------------------------------------------------------
  constructionNotes: z.array(ConstructionNoteSchema).max(20).default([]),
  measurements: MeasurementSetSchema.optional(),
  sizing: optionalField,

  /** 1..5. Drives price and which ateliers are eligible. */
  productionComplexity: z.number().int().min(1).max(5),
  estimatedLabourHours: z.number().int().min(1).max(200).optional(),

  warnings: z.array(SpecWarningSchema).max(20).default([]),

  /** Plain-language recap the customer reads before approving. */
  summary: z.string().min(1).max(1200),

  /** How each uploaded reference was actually used. Closes the loop on intent. */
  referenceUsage: z
    .array(
      z.object({
        referenceId: z.string().min(1),
        role: ReferenceRoleSchema,
        usedFor: z.string().min(1).max(300),
      }),
    )
    .max(8)
    .default([]),
});

export type DesignSpecification = z.infer<typeof DesignSpecificationSchema>;

/**
 * Canonical JSON: keys sorted recursively so that two logically identical specs
 * always produce the same hash regardless of property insertion order.
 */
export function canonicalJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, val]) => [k, walk(val)]));
  };
  return JSON.stringify(walk(value));
}

/** The hash production is held to. Quotes and jobs both pin to it. */
export function specHash(spec: DesignSpecification): string {
  return createHash("sha256").update(canonicalJson(spec)).digest("hex");
}

export function parseSpec(raw: unknown): DesignSpecification {
  return DesignSpecificationSchema.parse(raw);
}

export function parseSpecJson(json: string): DesignSpecification {
  return DesignSpecificationSchema.parse(JSON.parse(json));
}

export function safeParseSpec(raw: unknown) {
  return DesignSpecificationSchema.safeParse(raw);
}

// --------------------------------------------------------------------------
// Derived reads used by the UI and by pricing.
// --------------------------------------------------------------------------

export interface SpecFieldEntry {
  key: string;
  label: string;
  field: SpecField;
}

const FIELD_LABELS: Record<string, string> = {
  garmentType: "Tipo de peça",
  silhouette: "Silhueta",
  fit: "Caimento",
  length: "Comprimento",
  sleeveType: "Manga",
  collar: "Gola",
  neckline: "Decote",
  waistband: "Cós",
  closures: "Fechamento",
  seams: "Costuras",
  embroidery: "Bordado",
  printing: "Estampa",
  materialEstimate: "Material",
  materialWeight: "Gramatura",
  pattern: "Padronagem",
  finishing: "Acabamento",
  sizing: "Tamanho",
};

/** Flattens the single-value fields for rendering, in a stable reading order. */
export function listSpecFields(spec: DesignSpecification): SpecFieldEntry[] {
  const order = [
    "garmentType",
    "silhouette",
    "fit",
    "length",
    "sleeveType",
    "collar",
    "neckline",
    "waistband",
    "closures",
    "seams",
    "materialEstimate",
    "materialWeight",
    "pattern",
    "finishing",
    "embroidery",
    "printing",
    "sizing",
  ] as const;
  const out: SpecFieldEntry[] = [];
  for (const key of order) {
    const field = spec[key] as SpecField | undefined;
    if (field) out.push({ key, label: FIELD_LABELS[key] ?? key, field });
  }
  return out;
}

export function countByConfidence(spec: DesignSpecification): Record<string, number> {
  const counts: Record<string, number> = { OBSERVED: 0, INFERRED: 0, UNCERTAIN: 0, RECOMMENDED: 0 };
  const bump = (f?: SpecField) => {
    if (f) counts[f.confidence] = (counts[f.confidence] ?? 0) + 1;
  };
  for (const { field } of listSpecFields(spec)) bump(field);
  for (const p of spec.pockets) bump(p);
  for (const p of spec.panels) bump(p);
  for (const t of spec.trims) bump(t);
  for (const d of spec.decorativeElements) bump(d);
  for (const c of spec.colorEstimate) counts[c.confidence] = (counts[c.confidence] ?? 0) + 1;
  return counts;
}

/** A spec with a BLOCKING warning cannot be approved or quoted. */
export function blockingWarnings(spec: DesignSpecification): SpecWarning[] {
  return spec.warnings.filter((w) => w.severity === "BLOCKING");
}

export function isApprovable(spec: DesignSpecification): boolean {
  return blockingWarnings(spec).length === 0;
}

/**
 * Human-readable production sheet. This is what gets printed and taped to the
 * cutting table, so it states provenance inline rather than in a legend.
 */
export function renderProductionSheet(
  spec: DesignSpecification,
  meta: { reference: string; designTitle: string; version: number },
): string {
  const lines: string[] = [];
  const rule = "─".repeat(64);
  lines.push(rule);
  lines.push(`FICHA TÉCNICA DE PRODUÇÃO — ${meta.reference}`);
  lines.push(`${meta.designTitle}  ·  versão ${meta.version}`);
  lines.push(rule);
  lines.push("");
  lines.push("LEGENDA DE CONFIABILIDADE");
  lines.push("  [OBS] Observado na referência    [DED] Deduzido, confirme");
  lines.push("  [INC] Incerto, decisão pendente  [SUG] Sugerido pelo ateliê");
  lines.push("");

  const tag = (c: string) =>
    c === "OBSERVED" ? "[OBS]" : c === "INFERRED" ? "[DED]" : c === "UNCERTAIN" ? "[INC]" : "[SUG]";

  lines.push("1. PEÇA");
  for (const { label, field } of listSpecFields(spec)) {
    const edited = field.editedByCustomer ? " (definido pelo cliente)" : "";
    lines.push(`   ${tag(field.confidence)} ${label.padEnd(16)} ${field.value}${edited}`);
  }
  lines.push("");

  if (spec.colorEstimate.length > 0) {
    lines.push("2. CORES");
    lines.push("   Atenção: cor lida de imagem não é calibrada. Confirme contra a cartela física.");
    for (const c of spec.colorEstimate) {
      lines.push(
        `   ${tag(c.confidence)} ${c.name}${c.approximateHex ? ` ~${c.approximateHex}` : ""}${
          c.placement ? ` — ${c.placement}` : ""
        }`,
      );
    }
    lines.push("");
  }

  const details = [
    ["BOLSOS", spec.pockets],
    ["PAINÉIS", spec.panels],
    ["AVIAMENTOS", spec.trims],
    ["ELEMENTOS DECORATIVOS", spec.decorativeElements],
  ] as const;
  for (const [title, items] of details) {
    if (items.length === 0) continue;
    lines.push(`3. ${title}`);
    for (const item of items) lines.push(`   ${tag(item.confidence)} ${item.value}`);
    lines.push("");
  }

  if (spec.measurements) {
    const m = spec.measurements;
    lines.push("4. MEDIDAS (mm)");
    lines.push(`   Origem: ${m.source}   Tolerância acordada: ±${m.toleranceMm} mm`);
    const pairs: [string, number | undefined][] = [
      ["Altura", m.heightMm], ["Busto/Peito", m.chestMm], ["Cintura", m.waistMm],
      ["Quadril", m.hipMm], ["Ombro", m.shoulderMm], ["Manga", m.sleeveMm],
      ["Entrepernas", m.inseamMm], ["Lateral", m.outseamMm], ["Pescoço", m.neckMm],
      ["Coxa", m.thighMm], ["Punho", m.wristMm], ["Tronco", m.torsoMm],
    ];
    for (const [k, v] of pairs) if (v !== undefined) lines.push(`   ${k.padEnd(14)} ${v}`);
    lines.push("");
  }

  if (spec.constructionNotes.length > 0) {
    lines.push("5. NOTAS DE CONSTRUÇÃO");
    for (const n of spec.constructionNotes) {
      lines.push(`   ${tag(n.confidence)} ${n.topic}: ${n.note}${n.blocksProduction ? "  ** CONFIRMAR ANTES DE CORTAR **" : ""}`);
    }
    lines.push("");
  }

  if (spec.warnings.length > 0) {
    lines.push("6. ALERTAS");
    for (const w of spec.warnings) lines.push(`   (${w.severity}) ${w.message}`);
    lines.push("");
  }

  lines.push(rule);
  lines.push(`Complexidade: ${spec.productionComplexity}/5`);
  lines.push("Esta ficha é o contrato de produção. Divergências devem ser levantadas");
  lines.push("ANTES do corte, pelo canal de esclarecimento do pedido.");
  lines.push(rule);
  return lines.join("\n");
}
