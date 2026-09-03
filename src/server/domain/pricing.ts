import type { DesignSpecification } from "./spec";
import { type CurrencyCode, type Money, money, add, applyBasisPoints, multiply, zero } from "../lib/money";

/**
 * Quotation engine.
 *
 * Every number below is an integer of minor units and every rate is basis
 * points, so a quote is reproducible to the cent from its inputs. The breakdown
 * is stored with the quote and shown to the customer in full — a made-to-order
 * price that arrives as one opaque number does not earn trust.
 */

export interface PriceLine {
  code: string;
  label: string;
  /** What this line is for, in the customer's language. */
  explanation: string;
  amountCents: number;
}

export interface Quote {
  currency: CurrencyCode;
  lines: PriceLine[];
  subtotalCents: number;
  aiFeeCents: number;
  serviceFeeCents: number;
  totalCents: number;
  productionDaysMin: number;
  productionDaysMax: number;
  /** What the atelier is offered for this job, before platform fee. */
  producerPayoutCents: number;
  platformFeeCents: number;
}

/**
 * Rate card. Kept as data so it can move to the database and be versioned per
 * campaign without touching the arithmetic.
 */
export const RATE_CARD = {
  currency: "BRL" as CurrencyCode,

  /** Base labour by garment category — the floor an atelier is paid for the cut. */
  baseByCategory: {
    TOPS: 9_000,
    OUTERWEAR: 24_000,
    BOTTOMS: 13_000,
    DRESSES: 19_000,
    KNITWEAR: 12_000,
    ACCESSORIES: 6_000,
  } as Record<DesignSpecification["category"], number>,

  /** Complexity multiplier in basis points, indexed 1..5. */
  complexityBp: [0, 10_000, 12_500, 16_000, 21_000, 28_000],

  /** Flat additions for techniques that need a specialist or a setup. */
  techniqueCents: {
    embroidery: 8_500,
    printing: 4_500,
    leather: 15_000,
    lining: 6_000,
    hardware: 3_500,
  },

  /** Estimated materials, per category, at medium quality. */
  materialsByCategory: {
    TOPS: 4_500,
    OUTERWEAR: 16_000,
    BOTTOMS: 8_000,
    DRESSES: 11_000,
    KNITWEAR: 7_500,
    ACCESSORIES: 3_000,
  } as Record<DesignSpecification["category"], number>,

  /** Platform take on the made-to-order flow. */
  platformFeeBp: 1_800,
  /** Charged once per custom design, covering analysis, review and the tech pack. */
  designServiceFeeCents: 3_900,
  /** Charged only when a paid AI analysis actually ran. */
  aiAnalysisFeeCents: 0,

  /** Production window in days, by complexity 1..5. */
  productionDays: [
    [0, 0],
    [7, 12],
    [10, 16],
    [14, 21],
    [18, 28],
    [24, 40],
  ] as [number, number][],

  /** Rush surcharge, applied to the whole subtotal. */
  rushBp: 3_500,
} as const;

export interface QuoteInput {
  spec: DesignSpecification;
  quantity: number;
  rush: boolean;
  currency?: CurrencyCode;
  /** Set when a metered AI analysis was billed for this design. */
  aiAnalysisBilled?: boolean;
  /** Wholesale discount in basis points, from an approved seller account. */
  sellerDiscountBp?: number;
}

export function quoteDesign(input: QuoteInput): Quote {
  const currency = input.currency ?? RATE_CARD.currency;
  const spec = input.spec;
  const quantity = Math.max(1, Math.trunc(input.quantity));
  const complexity = Math.min(5, Math.max(1, spec.productionComplexity));

  const lines: PriceLine[] = [];
  const push = (code: string, label: string, explanation: string, amount: Money) => {
    if (amount.cents !== 0) lines.push({ code, label, explanation, amountCents: amount.cents });
  };

  // --- labour ------------------------------------------------------------
  const base = money(RATE_CARD.baseByCategory[spec.category] ?? 10_000, currency);
  const labour = applyBasisPoints(base, RATE_CARD.complexityBp[complexity] ?? 10_000);
  push(
    "LABOUR",
    "Mão de obra do ateliê",
    `Modelagem, corte e costura de ${spec.garmentType.value.toLowerCase()} com complexidade ${complexity}/5.`,
    labour,
  );

  // --- materials ---------------------------------------------------------
  let materials = money(RATE_CARD.materialsByCategory[spec.category] ?? 5_000, currency);
  const materialText = spec.materialEstimate?.value.toLowerCase() ?? "";
  if (/couro/.test(materialText) && !/sint/.test(materialText)) {
    materials = add(materials, money(RATE_CARD.techniqueCents.leather, currency));
  }
  push("MATERIALS", "Materiais", "Tecido, aviamentos e linha, na estimativa do ateliê.", materials);

  // --- techniques --------------------------------------------------------
  let techniques = zero(currency);
  const techniqueNotes: string[] = [];
  if (spec.embroidery) {
    techniques = add(techniques, money(RATE_CARD.techniqueCents.embroidery, currency));
    techniqueNotes.push("bordado");
  }
  if (spec.printing) {
    techniques = add(techniques, money(RATE_CARD.techniqueCents.printing, currency));
    techniqueNotes.push("estampa");
  }
  const decorText = spec.decorativeElements.map((d) => d.value.toLowerCase()).join(" ");
  if (/ferragen|corrente|fivela|tacha|rebite/.test(decorText)) {
    techniques = add(techniques, money(RATE_CARD.techniqueCents.hardware, currency));
    techniqueNotes.push("ferragens");
  }
  if (/forro|forrad/.test(spec.constructionNotes.map((n) => n.note.toLowerCase()).join(" "))) {
    techniques = add(techniques, money(RATE_CARD.techniqueCents.lining, currency));
    techniqueNotes.push("forro");
  }
  push(
    "TECHNIQUES",
    "Técnicas especiais",
    techniqueNotes.length > 0
      ? `Inclui ${techniqueNotes.join(", ")} — cada uma exige preparo e, às vezes, um especialista.`
      : "Nenhuma técnica adicional.",
    techniques,
  );

  const perUnit = add(labour, materials, techniques);
  const unitsSubtotal = multiply(perUnit, quantity);

  if (quantity > 1) {
    lines.push({
      code: "QUANTITY",
      label: `Quantidade: ${quantity} peças`,
      explanation: "Cada peça é feita sob medida individualmente — não há economia de escala em lote pequeno.",
      amountCents: unitsSubtotal.cents - perUnit.cents,
    });
  }

  // --- rush --------------------------------------------------------------
  let subtotal = unitsSubtotal;
  if (input.rush) {
    const rush = applyBasisPoints(unitsSubtotal, RATE_CARD.rushBp);
    push("RUSH", "Prazo reduzido", "O ateliê reorganiza a fila para adiantar sua peça.", rush);
    subtotal = add(subtotal, rush);
  }

  // --- fees --------------------------------------------------------------
  const serviceFee = money(RATE_CARD.designServiceFeeCents, currency);
  push(
    "DESIGN_SERVICE",
    "Serviço de design",
    "Análise das referências, ficha técnica revisável e acompanhamento da produção.",
    serviceFee,
  );

  const aiFee = input.aiAnalysisBilled
    ? money(RATE_CARD.aiAnalysisFeeCents, currency)
    : zero(currency);
  push("AI_ANALYSIS", "Análise por IA", "Leitura assistida das suas referências.", aiFee);

  let total = add(subtotal, serviceFee, aiFee);

  // --- wholesale ---------------------------------------------------------
  if (input.sellerDiscountBp && input.sellerDiscountBp > 0) {
    const discount = applyBasisPoints(total, input.sellerDiscountBp);
    lines.push({
      code: "SELLER_DISCOUNT",
      label: "Desconto revendedor",
      explanation: "Aplicado à sua conta de revenda aprovada.",
      amountCents: -discount.cents,
    });
    total = money(total.cents - discount.cents, currency);
  }

  // --- split -------------------------------------------------------------
  // The platform fee is taken on the production value, not on the service fee
  // or on materials the atelier has to actually buy.
  const platformFee = applyBasisPoints(subtotal, RATE_CARD.platformFeeBp);
  const producerPayout = money(subtotal.cents - platformFee.cents, currency);

  const [daysMin, daysMax] = RATE_CARD.productionDays[complexity] ?? [14, 24];
  const rushFactor = input.rush ? 0.7 : 1;

  return {
    currency,
    lines,
    subtotalCents: subtotal.cents,
    aiFeeCents: aiFee.cents,
    serviceFeeCents: serviceFee.cents,
    totalCents: total.cents,
    productionDaysMin: Math.max(5, Math.round(daysMin * rushFactor)),
    productionDaysMax: Math.max(7, Math.round(daysMax * rushFactor)),
    producerPayoutCents: producerPayout.cents,
    platformFeeCents: platformFee.cents,
  };
}

/** Quotes are honoured for 7 days; fabric prices move. */
export const QUOTE_TTL_DAYS = 7;

export const quoteExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + QUOTE_TTL_DAYS * 86_400_000);
