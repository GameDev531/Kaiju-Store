import { describe, it, expect } from "vitest";
import {
  money, add, subtract, multiply, applyBasisPoints, allocateEvenly,
  allocateByWeights, parseAmountToCents, formatCents, clampAtZero,
} from "@/server/lib/money";

/**
 * Money tests exist to prove one property above all: no code path can create or
 * destroy a cent. Every allocation must sum exactly to its input, and every rate
 * application must be reproducible.
 */
describe("money", () => {
  it("refuses a non-integer amount rather than silently rounding", () => {
    expect(() => money(19.99, "BRL")).toThrow(RangeError);
    expect(() => money(Number.NaN, "BRL")).toThrow(RangeError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, "BRL")).toThrow(RangeError);
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(100, "BRL"), money(100, "USD"))).toThrow(TypeError);
    expect(() => subtract(money(100, "BRL"), money(50, "USD"))).toThrow(TypeError);
  });

  it("refuses a fractional quantity in multiply", () => {
    expect(() => multiply(money(1000, "BRL"), 1.5)).toThrow(TypeError);
  });

  describe("applyBasisPoints", () => {
    it("computes rates exactly where floats would drift", () => {
      // 0.15 * 3333 in float is 499.95000000000005; integer maths gives 500.
      expect(applyBasisPoints(money(3333, "BRL"), 1500).cents).toBe(500);
      expect(applyBasisPoints(money(10_000, "BRL"), 1800).cents).toBe(1800);
      expect(applyBasisPoints(money(1, "BRL"), 5000).cents).toBe(1); // HALF_UP
    });

    it("honours the rounding mode", () => {
      expect(applyBasisPoints(money(1, "BRL"), 5000, "DOWN").cents).toBe(0);
      expect(applyBasisPoints(money(1, "BRL"), 5000, "UP").cents).toBe(1);
      expect(applyBasisPoints(money(1, "BRL"), 5000, "HALF_EVEN").cents).toBe(0);
      expect(applyBasisPoints(money(3, "BRL"), 5000, "HALF_EVEN").cents).toBe(2);
    });

    it("handles negative amounts symmetrically", () => {
      expect(applyBasisPoints(money(-3333, "BRL"), 1500).cents).toBe(-500);
    });

    it("rejects fractional basis points", () => {
      expect(() => applyBasisPoints(money(100, "BRL"), 12.5)).toThrow(TypeError);
    });
  });

  describe("allocateEvenly", () => {
    it("never loses or invents a cent", () => {
      for (const total of [100, 101, 1, 7, 9999, 12_345]) {
        for (const parts of [1, 2, 3, 7, 11]) {
          const split = allocateEvenly(money(total, "BRL"), parts);
          expect(split).toHaveLength(parts);
          expect(split.reduce((s, m) => s + m.cents, 0)).toBe(total);
        }
      }
    });

    it("distributes the remainder to the earliest parts", () => {
      expect(allocateEvenly(money(100, "BRL"), 3).map((m) => m.cents)).toEqual([34, 33, 33]);
    });

    it("handles negatives without losing the sign", () => {
      const split = allocateEvenly(money(-100, "BRL"), 3);
      expect(split.reduce((s, m) => s + m.cents, 0)).toBe(-100);
    });

    it("rejects a non-positive part count", () => {
      expect(() => allocateEvenly(money(100, "BRL"), 0)).toThrow(RangeError);
    });
  });

  describe("allocateByWeights", () => {
    it("sums exactly to the total for any weighting", () => {
      const cases: [number, number[]][] = [
        [1000, [1, 1, 1]],
        [999, [5, 3, 2]],
        [10_000, [7, 11, 13, 17]],
        [1, [1, 1, 1, 1]],
        [12_345, [0, 1]],
      ];
      for (const [total, weights] of cases) {
        const split = allocateByWeights(money(total, "BRL"), weights);
        expect(split.reduce((s, m) => s + m.cents, 0)).toBe(total);
        expect(split).toHaveLength(weights.length);
      }
    });

    it("falls back to an even split when every weight is zero", () => {
      const split = allocateByWeights(money(100, "BRL"), [0, 0, 0]);
      expect(split.reduce((s, m) => s + m.cents, 0)).toBe(100);
    });

    it("rejects negative weights", () => {
      expect(() => allocateByWeights(money(100, "BRL"), [-1, 2])).toThrow(RangeError);
    });
  });

  describe("parseAmountToCents", () => {
    it("parses Brazilian and US formats to the same cents", () => {
      expect(parseAmountToCents("129,90", "BRL")).toBe(12_990);
      expect(parseAmountToCents("129.90", "BRL")).toBe(12_990);
      expect(parseAmountToCents("R$ 1.299,90", "BRL")).toBe(129_990);
      expect(parseAmountToCents("1,299.90", "USD")).toBe(129_990);
      expect(parseAmountToCents("0,01", "BRL")).toBe(1);
    });

    it("rejects garbage instead of coercing it to zero", () => {
      expect(() => parseAmountToCents("abc", "BRL")).toThrow(RangeError);
      expect(() => parseAmountToCents("", "BRL")).toThrow(RangeError);
      expect(() => parseAmountToCents("1.2345", "BRL")).toThrow(RangeError);
    });

    it("rejects an ambiguous amount rather than guessing at it", () => {
      // In pt-BR the comma is the decimal separator, so "1,234" reads as three
      // decimal places — which BRL does not have. Guessing "one thousand two
      // hundred thirty four" would be a 100x error on a real charge, so the
      // parser refuses and the caller has to ask the user.
      expect(() => parseAmountToCents("1,234", "BRL")).toThrow(RangeError);
      // Unambiguous in either convention.
      expect(parseAmountToCents("1.234,56", "BRL")).toBe(123_456);
    });
  });

  it("clamps negative totals to zero for discount application", () => {
    expect(clampAtZero(money(-500, "BRL")).cents).toBe(0);
    expect(clampAtZero(money(500, "BRL")).cents).toBe(500);
  });

  it("formats for display without ever feeding the string back in", () => {
    expect(formatCents(12_990, "BRL")).toContain("129,90");
  });
});
