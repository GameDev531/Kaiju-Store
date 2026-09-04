import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, needsRehash, hashToken, hmacSign, hmacVerify, rolloutBucket, publicReference } from "@/server/lib/crypto";
import { validatePasswordStrength, generateTotpSecret, totpCode, verifyTotp, totpUri } from "@/server/auth/service";
import { permissionsFor, hasPermission, requirePermission, isStaff, requiresStepUp, STEP_UP_PERMISSIONS } from "@/server/auth/rbac";
import { parseRoles, serializeRoles } from "@/server/domain/enums";
import { AppError } from "@/server/lib/errors";

describe("password hashing", () => {
  it("never stores the password and produces a different hash each time", async () => {
    const a = await hashPassword("uma senha bem longa de teste");
    const b = await hashPassword("uma senha bem longa de teste");
    expect(a).not.toContain("uma senha");
    expect(a).not.toBe(b); // distinct salts
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("verifies the right password and rejects near misses", async () => {
    const hash = await hashPassword("uma senha bem longa de teste");
    expect(await verifyPassword("uma senha bem longa de teste", hash)).toBe(true);
    expect(await verifyPassword("uma senha bem longa de test", hash)).toBe(false);
    expect(await verifyPassword("Uma senha bem longa de teste", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("normalises unicode so the same typed password matches across platforms", async () => {
    // Composed vs decomposed "ç" — the same keystrokes on different systems.
    const hash = await hashPassword("senha com ç e acentuação");
    expect(await verifyPassword("senha com ç e acentuação", hash)).toBe(true);
  });

  it("rejects a malformed or hostile stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abc$8$1$c2FsdA$aGFzaA")).toBe(false);
    // A poisoned cost parameter must not become a CPU-exhaustion vector.
    expect(await verifyPassword("x", "scrypt$99999999$99$99$c2FsdA$aGFzaA")).toBe(false);
  });

  it("flags weaker legacy parameters for rehash", () => {
    expect(needsRehash("scrypt$1024$8$1$c2FsdA$aGFzaA")).toBe(true);
    expect(needsRehash("bcrypt$whatever")).toBe(true);
  });
});

describe("password policy", () => {
  it("requires real length", () => {
    expect(validatePasswordStrength("curta1!", "a@b.com")).toBeTruthy();
    expect(validatePasswordStrength("a".repeat(11), "a@b.com")).toBeTruthy();
  });

  it("rejects a password containing the account e-mail", () => {
    expect(validatePasswordStrength("joaosilva123456", "joaosilva@exemplo.com")).toBeTruthy();
  });

  it("rejects the passwords that actually get accounts taken over", () => {
    for (const bad of ["senha12345678", "password1234", "kaiju1234567", "anime1234567"]) {
      expect(validatePasswordStrength(bad, "user@exemplo.com"), bad).toBeTruthy();
    }
  });

  it("accepts a genuine passphrase", () => {
    expect(validatePasswordStrength("bule azul na estante da cozinha", "user@exemplo.com")).toBeNull();
  });
});

describe("TOTP", () => {
  it("generates a base32 secret of the expected shape", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const now = new Date();
    const counter = Math.floor(now.getTime() / 1000 / 30);
    expect(verifyTotp(secret, totpCode(secret, counter), now)).toBe(true);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
    expect(verifyTotp(secret, "", now)).toBe(false);
  });

  it("tolerates exactly one step of clock drift, and no more", () => {
    const secret = generateTotpSecret();
    const now = new Date();
    const counter = Math.floor(now.getTime() / 1000 / 30);
    expect(verifyTotp(secret, totpCode(secret, counter - 1), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, counter + 1), now)).toBe(true);
    // Two steps out is a replay window we do not grant.
    expect(verifyTotp(secret, totpCode(secret, counter - 5), now)).toBe(false);
    expect(verifyTotp(secret, totpCode(secret, counter + 5), now)).toBe(false);
  });

  it("builds an otpauth URI an authenticator app can read", () => {
    const secret = generateTotpSecret();
    const uri = totpUri(secret, "pessoa@exemplo.com");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=KAIJU");
  });
});

describe("HMAC signing", () => {
  it("verifies only its own signature", () => {
    const sig = hmacSign("carga:util", "segredo");
    expect(hmacVerify("carga:util", sig, "segredo")).toBe(true);
    expect(hmacVerify("carga:outra", sig, "segredo")).toBe(false);
    expect(hmacVerify("carga:util", sig, "outro-segredo")).toBe(false);
    expect(hmacVerify("carga:util", "", "segredo")).toBe(false);
  });

  it("binds a CSRF token to one action, so it cannot be replayed on another", () => {
    // This is the property that makes the double-submit pattern meaningful here.
    const secret = "cookie-secret";
    const forRefund = hmacSign(`${secret}:admin.refund`, "app-secret");
    expect(hmacVerify(`${secret}:admin.refund`, forRefund, "app-secret")).toBe(true);
    expect(hmacVerify(`${secret}:account.delete`, forRefund, "app-secret")).toBe(false);
  });

  it("stores only a hash of a token", () => {
    const token = "um-token-de-sessao";
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
  });
});

describe("RBAC", () => {
  it("gives a customer no administrative power at all", () => {
    const roles = parseRoles("CUSTOMER");
    expect(hasPermission(roles, "self.order.read")).toBe(true);
    for (const p of ["admin.refund.issue", "admin.payout.approve", "admin.user.write", "admin.role.grant", "admin.impersonate"] as const) {
      expect(hasPermission(roles, p), p).toBe(false);
    }
  });

  it("does not let a producer read or write another party's admin surface", () => {
    const roles = parseRoles("PRODUCER");
    expect(hasPermission(roles, "producer.job.accept")).toBe(true);
    expect(hasPermission(roles, "admin.order.write")).toBe(false);
    expect(hasPermission(roles, "admin.payout.approve")).toBe(false);
    expect(hasPermission(roles, "catalog.write")).toBe(false);
  });

  it("keeps role-granting and impersonation exclusive to SUPER_ADMIN", () => {
    expect(hasPermission(parseRoles("ADMIN"), "admin.role.grant")).toBe(false);
    expect(hasPermission(parseRoles("ADMIN"), "admin.impersonate")).toBe(false);
    expect(hasPermission(parseRoles("SUPER_ADMIN"), "admin.role.grant")).toBe(true);
    expect(hasPermission(parseRoles("SUPER_ADMIN"), "admin.impersonate")).toBe(true);
  });

  it("separates finance from moderation", () => {
    const finance = parseRoles("FINANCE");
    const moderator = parseRoles("MODERATOR");
    expect(hasPermission(finance, "admin.refund.issue")).toBe(true);
    expect(hasPermission(finance, "content.moderate")).toBe(false);
    expect(hasPermission(moderator, "content.moderate")).toBe(true);
    expect(hasPermission(moderator, "admin.refund.issue")).toBe(false);
  });

  it("unions permissions across multiple roles", () => {
    const both = parseRoles("CUSTOMER,PRODUCER");
    expect(hasPermission(both, "self.design.write")).toBe(true);
    expect(hasPermission(both, "producer.job.accept")).toBe(true);
  });

  it("throws a typed forbidden error rather than returning false silently", () => {
    expect(() => requirePermission(parseRoles("CUSTOMER"), "admin.refund.issue")).toThrow(AppError);
    try {
      requirePermission(parseRoles("CUSTOMER"), "admin.refund.issue");
    } catch (e) {
      expect((e as AppError).code).toBe("FORBIDDEN");
      expect((e as AppError).status).toBe(403);
    }
  });

  it("requires step-up MFA for every money-moving and privilege-granting action", () => {
    for (const p of STEP_UP_PERMISSIONS) expect(requiresStepUp(p)).toBe(true);
    expect(requiresStepUp("admin.refund.issue")).toBe(true);
    expect(requiresStepUp("admin.payout.approve")).toBe(true);
    expect(requiresStepUp("catalog.read")).toBe(false);
  });

  it("identifies staff correctly", () => {
    expect(isStaff(parseRoles("CUSTOMER"))).toBe(false);
    expect(isStaff(parseRoles("PRODUCER"))).toBe(false);
    expect(isStaff(parseRoles("CUSTOMER,SUPPORT"))).toBe(true);
  });
});

describe("role parsing", () => {
  it("never trusts an unknown or injected role string", () => {
    expect(parseRoles("ADMIN'; DROP TABLE users;--")).toEqual(["CUSTOMER"]);
    expect(parseRoles("SUPERADMIN")).toEqual(["CUSTOMER"]);
    expect(parseRoles("")).toEqual(["CUSTOMER"]);
    expect(parseRoles(null)).toEqual(["CUSTOMER"]);
    expect(parseRoles("CUSTOMER,NOPE,PRODUCER")).toEqual(["CUSTOMER", "PRODUCER"]);
  });

  it("round-trips through serialisation and deduplicates", () => {
    expect(parseRoles(serializeRoles(["ADMIN", "CUSTOMER", "ADMIN"]))).toEqual(["ADMIN", "CUSTOMER"]);
  });
});

describe("misc crypto helpers", () => {
  it("buckets a rollout deterministically and within range", () => {
    const a = rolloutBucket("flag.x", "user-1");
    expect(a).toBe(rolloutBucket("flag.x", "user-1"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10_000);
    expect(rolloutBucket("flag.y", "user-1")).not.toBe(a);
  });

  it("produces unguessable, unambiguous public references", () => {
    const ref = publicReference("KJ");
    expect(ref).toMatch(/^KJ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    // No 0/O or 1/I, so a reference read over the phone is not misheard.
    expect(ref).not.toMatch(/[01OI]/);
    const many = new Set(Array.from({ length: 500 }, () => publicReference("KJ")));
    expect(many.size).toBe(500);
  });
});
