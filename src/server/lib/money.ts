/**
 * Money is an integer count of minor units plus an ISO-4217 code. Full stop.
 *
 * There is no Money type in this codebase that can hold 19.99 — only 1999 and
 * "BRL". Every rounding decision is explicit and every operation that could
 * lose a cent either distributes the remainder or throws.
 */

export type CurrencyCode = "BRL" | "USD" | "EUR";

export const CURRENCIES: Record<CurrencyCode, { minorUnits: number; symbol: string; locale: string }> = {
  BRL: { minorUnits: 2, symbol: "R$", locale: "pt-BR" },
  USD: { minorUnits: 2, symbol: "$", locale: "en-US" },
  EUR: { minorUnits: 2, symbol: "€", locale: "de-DE" },
};

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, v);
}

export interface Money {
  readonly cents: number;
  readonly currency: CurrencyCode;
}

export function money(cents: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Money must be a safe integer of minor units, received ${cents}`);
  }
  return Object.freeze({ cents, currency });
}

export const zero = (currency: CurrencyCode): Money => money(0, currency);

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(...values: Money[]): Money {
  const [first, ...rest] = values;
  if (!first) throw new TypeError("add() needs at least one Money");
  let total = first.cents;
  for (const v of rest) {
    assertSameCurrency(first, v);
    total += v.cents;
  }
  return money(total, first.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.cents - b.cents, a.currency);
}

export function multiply(a: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new TypeError("multiply() takes an integer quantity; use applyBasisPoints for rates");
  }
  return money(a.cents * factor, a.currency);
}

/** Never below zero — used for discounts that must not create negative totals. */
export function clampAtZero(a: Money): Money {
  return a.cents < 0 ? zero(a.currency) : a;
}

export type Rounding = "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP";

function roundQuotient(numerator: number, denominator: number, mode: Rounding): number {
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const remainder = n - q * denominator;
  if (remainder === 0) return sign * q;

  switch (mode) {
    case "DOWN":
      return sign * q;
    case "UP":
      return sign * (q + 1);
    case "HALF_UP":
      return sign * (remainder * 2 >= denominator ? q + 1 : q);
    case "HALF_EVEN": {
      const twice = remainder * 2;
      if (twice > denominator) return sign * (q + 1);
      if (twice < denominator) return sign * q;
      return sign * (q % 2 === 0 ? q : q + 1);
    }
  }
}

/**
 * Rates are basis points (1 bp = 0.01%). 1500 bp = 15%.
 * Integer maths throughout: no 0.15 * 3333 = 499.95000000000005.
 */
export function applyBasisPoints(a: Money, bp: number, mode: Rounding = "HALF_UP"): Money {
  if (!Number.isInteger(bp)) throw new TypeError("Basis points must be an integer");
  return money(roundQuotient(a.cents * bp, 10_000, mode), a.currency);
}

export function percentOf(a: Money, bp: number, mode: Rounding = "HALF_UP"): Money {
  return applyBasisPoints(a, bp, mode);
}

/**
 * Split a total into n parts without losing or inventing a cent.
 * The remainder is distributed one minor unit at a time, largest-remainder first
 * by index, so the sum of the result is always exactly the input.
 */
export function allocateEvenly(total: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError("parts must be a positive integer");
  const base = Math.trunc(total.cents / parts);
  let remainder = total.cents - base * parts;
  const step = remainder < 0 ? -1 : 1;
  remainder = Math.abs(remainder);
  const out: Money[] = [];
  for (let i = 0; i < parts; i += 1) {
    const extra = i < remainder ? step : 0;
    out.push(money(base + extra, total.currency));
  }
  return out;
}

/**
 * Split by integer weights (e.g. splitting shipping across order items by value).
 * Guarantees the parts sum to the total exactly.
 */
export function allocateByWeights(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new RangeError("weights must not be empty");
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new RangeError("weights must be non-negative integers");
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return allocateEvenly(total, weights.length);

  const raw = weights.map((w) => Math.trunc((total.cents * w) / sum));
  let assigned = raw.reduce((a, b) => a + b, 0);
  const remainders = weights.map((w, i) => ({
    i,
    rem: total.cents * w - raw[i]! * sum,
  }));
  remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);

  const out = [...raw];
  let cursor = 0;
  while (assigned < total.cents) {
    const target = remainders[cursor % remainders.length]!;
    out[target.i] = out[target.i]! + 1;
    assigned += 1;
    cursor += 1;
  }
  return out.map((c) => money(c, total.currency));
}

/** Display only. Never feed a formatted string back into a calculation. */
export function formatMoney(m: Money, locale?: string): string {
  const meta = CURRENCIES[m.currency];
  return new Intl.NumberFormat(locale ?? meta.locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: meta.minorUnits,
    maximumFractionDigits: meta.minorUnits,
  }).format(m.cents / 10 ** meta.minorUnits);
}

export function formatCents(cents: number, currency: CurrencyCode, locale?: string): string {
  return formatMoney(money(cents, currency), locale);
}

/** Parses "129,90" / "129.90" / "R$ 129,90" into cents. Rejects anything else. */
export function parseAmountToCents(input: string, currency: CurrencyCode): number {
  const meta = CURRENCIES[currency];
  const cleaned = input.replace(/[^\d,.-]/g, "").trim();
  if (cleaned === "" || !/^-?[\d.,]+$/.test(cleaned)) {
    throw new RangeError(`Cannot parse "${input}" as an amount`);
  }
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSep = lastComma > lastDot ? "," : lastDot > lastComma ? "." : "";
  let intPart = cleaned;
  let fracPart = "";
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep);
    intPart = cleaned.slice(0, idx);
    fracPart = cleaned.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (fracPart.length > meta.minorUnits) {
    throw new RangeError(`Too many decimal places for ${currency}`);
  }
  const negative = intPart.startsWith("-");
  const digits = `${intPart.replace("-", "") || "0"}${fracPart.padEnd(meta.minorUnits, "0")}`;
  const cents = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(cents)) throw new RangeError("Amount out of range");
  return negative ? -cents : cents;
}
