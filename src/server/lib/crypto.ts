import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHmac,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters. N=2^16 with r=8 costs ~64 MB and ~100ms on a modern core,
 * which is the right order of magnitude for an interactive login. Bumping N
 * later is safe: the cost parameters travel inside every stored hash, so old
 * hashes keep verifying and get re-hashed on next successful login.
 */
const SCRYPT = { N: 1 << 16, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 } as const;

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("password must be a non-empty string");
  }
  // Normalise so the same typed password matches across platforms/keyboards.
  const normalized = password.normalize("NFKC");
  const salt = randomBytes(16);
  const derived = await scrypt(normalized, salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters: a poisoned hash row must not become a DoS vector.
  if (N > 1 << 20 || r > 32 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64url");
    expected = Buffer.from(parts[5]!, "base64url");
  } catch {
    return false;
  }
  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** True when a stored hash used weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < SCRYPT.N || Number(parts[2]) < SCRYPT.r;
}

/** 32 bytes of CSPRNG entropy, URL-safe. Used for session and one-time tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Opaque tokens are stored only as SHA-256. A database read cannot resurrect a
 * live session cookie or a password-reset link.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Pseudonymous, non-reversible IP/UA fingerprints for abuse controls.
 * Keyed so a database leak cannot be rainbow-tabled back to visitor IPs.
 */
export function keyedHash(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function hmacSign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function hmacVerify(payload: string, signature: string, secret: string): boolean {
  const expected = hmacSign(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Stable 0..9999 bucket for percentage feature rollouts. Deterministic per
 * (key, subject) so a user does not flip between buckets on every request.
 */
export function rolloutBucket(key: string, subject: string): number {
  const digest = createHash("sha256").update(`${key}:${subject}`).digest();
  return ((digest[0]! << 8) | digest[1]!) % 10_000;
}

/** Human-readable, non-sequential public reference (e.g. KJ-7Q4M-2XPD). */
export function publicReference(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 3) out += "-";
  }
  return `${prefix}-${out}`;
}
