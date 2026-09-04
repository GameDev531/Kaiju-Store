import { describe, it, expect } from "vitest";
import { quoteDesign, RATE_CARD, quoteExpiry, QUOTE_TTL_DAYS } from "@/server/domain/pricing";
import { facetsFromQuery, normalizeQuery } from "@/server/domain/recommender";
import { planJobSplit } from "@/server/domain/matching";
import { CampaignRuleSchema } from "@/server/domain/rewards";
import { DesignSpecificationSchema, type DesignSpecification } from "@/server/domain/spec";

const spec = (overrides: Partial<DesignSpecification> = {}): DesignSpecification =>
  DesignSpecificationSchema.parse({
    schemaVersion: 1,
    garmentType: { value: "Jaqueta", confidence: "OBSERVED", editedByCustomer: false },
    category: "OUTERWEAR",
    productionComplexity: 3,
    summary: "Uma jaqueta de teste.",
    ...overrides,
  });

describe("quotation", () => {
  it("produces a total that equals the sum of its own breakdown", () => {
    const quote = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    const sum = quote.lines.reduce((s, l) => s + l.amountCents, 0);
    expect(sum).toBe(quote.totalCents);
  });

  it("keeps every figure an integer", () => {
    const quote = quoteDesign({ spec: spec({ productionComplexity: 5 }), quantity: 3, rush: true });
    for (const value of [quote.totalCents, quote.subtotalCents, quote.platformFeeCents, quote.producerPayoutCents]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const line of quote.lines) expect(Number.isInteger(line.amountCents)).toBe(true);
  });

  it("splits the production value without losing a cent to the atelier", () => {
    const quote = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    expect(quote.platformFeeCents + quote.producerPayoutCents).toBe(quote.subtotalCents);
  });

  it("is deterministic — the same spec always yields the same price", () => {
    const s = spec({ productionComplexity: 4 });
    const a = quoteDesign({ spec: s, quantity: 2, rush: true });
    const b = quoteDesign({ spec: s, quantity: 2, rush: true });
    expect(a.totalCents).toBe(b.totalCents);
    expect(a.lines).toEqual(b.lines);
  });

  it("charges more for higher complexity", () => {
    const cheap = quoteDesign({ spec: spec({ productionComplexity: 1 }), quantity: 1, rush: false });
    const dear = quoteDesign({ spec: spec({ productionComplexity: 5 }), quantity: 1, rush: false });
    expect(dear.totalCents).toBeGreaterThan(cheap.totalCents);
    expect(dear.productionDaysMax).toBeGreaterThan(cheap.productionDaysMax);
  });

  it("charges for embroidery and printing as named lines, not a hidden markup", () => {
    const plain = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    const embroidered = quoteDesign({
      spec: spec({ embroidery: { value: "Bordado nas costas", confidence: "OBSERVED", editedByCustomer: false } }),
      quantity: 1,
      rush: false,
    });
    expect(embroidered.totalCents).toBeGreaterThan(plain.totalCents);
    const line = embroidered.lines.find((l) => l.code === "TECHNIQUES");
    expect(line?.explanation).toContain("bordado");
  });

  it("shortens the window and raises the price for a rush order", () => {
    const normal = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    const rush = quoteDesign({ spec: spec(), quantity: 1, rush: true });
    expect(rush.totalCents).toBeGreaterThan(normal.totalCents);
    expect(rush.productionDaysMax).toBeLessThan(normal.productionDaysMax);
    expect(rush.lines.some((l) => l.code === "RUSH")).toBe(true);
  });

  it("does not pretend a batch of made-to-order pieces gets cheaper per unit", () => {
    const one = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    const three = quoteDesign({ spec: spec(), quantity: 3, rush: false });
    // Each piece is cut individually; there is no economy of scale to claim.
    expect(three.subtotalCents).toBe(one.subtotalCents * 3);
  });

  it("applies a wholesale discount as a visible negative line", () => {
    const retail = quoteDesign({ spec: spec(), quantity: 1, rush: false });
    const wholesale = quoteDesign({ spec: spec(), quantity: 1, rush: false, sellerDiscountBp: 3000 });
    expect(wholesale.totalCents).toBeLessThan(retail.totalCents);
    const line = wholesale.lines.find((l) => l.code === "SELLER_DISCOUNT");
    expect(line).toBeDefined();
    expect(line!.amountCents).toBeLessThan(0);
  });

  it("gives every line an explanation a customer can act on", () => {
    const quote = quoteDesign({ spec: spec({ productionComplexity: 4 }), quantity: 2, rush: true });
    for (const line of quote.lines) {
      expect(line.label.length, line.code).toBeGreaterThan(3);
      expect(line.explanation.length, line.code).toBeGreaterThan(10);
    }
  });

  it("expires a quote after the published window", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const expires = quoteExpiry(from);
    expect(expires.getTime() - from.getTime()).toBe(QUOTE_TTL_DAYS * 86_400_000);
  });

  it("never produces a negative total", () => {
    const quote = quoteDesign({ spec: spec({ productionComplexity: 1 }), quantity: 1, rush: false, sellerDiscountBp: 10_000 });
    expect(quote.totalCents).toBeGreaterThanOrEqual(0);
  });
});

describe("job splitting", () => {
  it("keeps a plain garment as a single job", () => {
    expect(planJobSplit(spec())).toHaveLength(1);
  });

  it("splits embroidery and printing into their own crafts", () => {
    const jobs = planJobSplit(
      spec({
        embroidery: { value: "Bordado dorsal", confidence: "OBSERVED", editedByCustomer: false },
        printing: { value: "Estampa frontal", confidence: "OBSERVED", editedByCustomer: false },
      }),
    );
    expect(jobs.map((j) => j.role)).toEqual(["PRIMARY", "EMBROIDERY", "PRINTING"]);
    for (const j of jobs) expect(j.reason.length).toBeGreaterThan(10);
  });

  it("splits out a 3D-printed component", () => {
    const jobs = planJobSplit(
      spec({
        decorativeElements: [{ value: "Placa impressa em 3D no ombro", confidence: "OBSERVED", editedByCustomer: false }],
      }),
    );
    expect(jobs.some((j) => j.role === "THREE_D")).toBe(true);
  });
});

describe("recommender query mapping", () => {
  it("normalises accents, case and punctuation", () => {
    expect(normalizeQuery("  Jaqueta TÉCNICA!! ")).toBe("jaqueta tecnica");
    expect(normalizeQuery("moletom  —  oversized")).toBe("moletom oversized");
  });

  it("maps a search into facets the scorer understands", () => {
    expect(facetsFromQuery("jaqueta techwear preta")).toEqual(
      expect.arrayContaining(["STYLE:techwear", "FIT:utility", "PALETTE:dark"]),
    );
    expect(facetsFromQuery("kimono japonês")).toEqual(expect.arrayContaining(["MOTIF:wafuku"]));
    expect(facetsFromQuery("roupa kawaii rosa")).toEqual(
      expect.arrayContaining(["PALETTE:pastel", "MOTIF:kawaii"]),
    );
  });

  it("returns nothing for a query with no signal, rather than guessing", () => {
    expect(facetsFromQuery("asdfghjkl")).toEqual([]);
  });

  it("bounds an absurdly long query", () => {
    expect(normalizeQuery("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("campaign rules", () => {
  it("parses the shipped rule with a settlement window", () => {
    const rule = CampaignRuleSchema.parse({
      kind: "PURCHASE_THRESHOLD",
      minItems: 3,
      windowDays: 90,
      settlementDays: 7,
    });
    expect(rule.minItems).toBe(3);
    // The anti-farming gate must never default to zero.
    expect(rule.settlementDays).toBe(7);
    expect(rule.excludeRewardItems).toBe(true);
  });

  it("rejects a rule that would grant on an unbounded window", () => {
    expect(CampaignRuleSchema.safeParse({ kind: "PURCHASE_THRESHOLD", windowDays: 10_000 }).success).toBe(false);
    expect(CampaignRuleSchema.safeParse({ kind: "PURCHASE_THRESHOLD", minItems: 0 }).success).toBe(false);
  });

  it("rejects an unknown rule kind rather than defaulting to one", () => {
    expect(CampaignRuleSchema.safeParse({ kind: "ANYTHING_GOES" }).success).toBe(false);
  });
});

describe("rate card sanity", () => {
  it("keeps the platform fee within a defensible marketplace range", () => {
    expect(RATE_CARD.platformFeeBp).toBeGreaterThan(0);
    expect(RATE_CARD.platformFeeBp).toBeLessThanOrEqual(3000); // ≤ 30%
  });

  it("has an entry for every complexity level", () => {
    for (let c = 1; c <= 5; c += 1) {
      expect(RATE_CARD.complexityBp[c]).toBeGreaterThan(0);
      expect(RATE_CARD.productionDays[c]![0]).toBeGreaterThan(0);
      expect(RATE_CARD.productionDays[c]![1]).toBeGreaterThan(RATE_CARD.productionDays[c]![0]);
    }
  });
});
