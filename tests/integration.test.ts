import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { hashPassword, publicReference } from "@/server/lib/crypto";
import { transitionOrder, getOrderForCustomer, getPublicTracking } from "@/server/domain/orders";
import { getJobForProducer, acceptJob } from "@/server/domain/production";
import { applyCoupon } from "@/server/domain/checkout";
import { evaluateEligibility, grantReward, revokeGrantsForOrder } from "@/server/domain/rewards";
import { applyCarrierEvents } from "@/server/shipping";
import { checkRateLimit } from "@/server/lib/ratelimit";
import { recordInteraction, rebuildTasteProfile, recommend, forgetTasteData } from "@/server/domain/recommender";
import { AppError } from "@/server/lib/errors";

/**
 * Integration tests against a real database.
 *
 * These cover the properties that unit tests structurally cannot: multi-tenancy
 * isolation, idempotency under duplicate delivery, and concurrency under a race.
 * A fresh SQLite file is created per run so the suite never depends on, or
 * damages, development data.
 */

let customerA: string;
let customerB: string;
let producerA: string;
let producerB: string;

/**
 * Truncates every table in dependency-free order.
 *
 * Hand-maintaining a delete order breaks silently every time a relation is
 * added, so instead foreign keys are suspended for the wipe and re-enabled
 * immediately after. This is a test-database-only operation on a file this
 * suite created itself.
 */
async function truncateAll(): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
  `;
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  try {
    for (const { name } of tables) {
      await db.$executeRawUnsafe(`DELETE FROM "${name}"`);
    }
  } finally {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

beforeEach(async () => {
  await truncateAll();

  const hash = await hashPassword("uma senha de teste bem longa");
  const [a, b, pa, pb] = await Promise.all([
    db.user.create({ data: { email: "a@test.local", displayName: "A", passwordHash: hash, roles: "CUSTOMER" } }),
    db.user.create({ data: { email: "b@test.local", displayName: "B", passwordHash: hash, roles: "CUSTOMER" } }),
    db.user.create({ data: { email: "pa@test.local", displayName: "PA", passwordHash: hash, roles: "PRODUCER" } }),
    db.user.create({ data: { email: "pb@test.local", displayName: "PB", passwordHash: hash, roles: "PRODUCER" } }),
  ]);
  customerA = a.id;
  customerB = b.id;

  const [p1, p2] = await Promise.all([
    db.producer.create({
      data: { userId: pa.id, studioName: "Ateliê A", city: "SP", state: "SP", status: "ACTIVE", verificationLevel: "VERIFIED", weeklyCapacity: 5, maxComplexity: 5 },
    }),
    db.producer.create({
      data: { userId: pb.id, studioName: "Ateliê B", city: "RJ", state: "RJ", status: "ACTIVE", verificationLevel: "VERIFIED", weeklyCapacity: 5, maxComplexity: 5 },
    }),
  ]);
  producerA = p1.id;
  producerB = p2.id;
});

async function makeOrder(userId: string, status = "DRAFT"): Promise<string> {
  const order = await db.order.create({
    data: { reference: publicReference("KJ"), userId, status, currency: "BRL", totalCents: 50_000, subtotalCents: 50_000 },
  });
  await db.orderItem.create({
    data: { orderId: order.id, kind: "CUSTOM", titleSnapshot: "Peça de teste", unitPriceCents: 50_000, totalPriceCents: 50_000 },
  });
  return order.id;
}

// ============================================================ isolation ======

describe("customer isolation (IDOR / BOLA)", () => {
  it("does not return another customer's order by id", async () => {
    const orderId = await makeOrder(customerA);
    await expect(getOrderForCustomer(orderId, customerB)).rejects.toThrow(AppError);
    // And the owner can still read it, so the guard is not simply breaking reads.
    await expect(getOrderForCustomer(orderId, customerA)).resolves.toBeTruthy();
  });

  it("leaks no personal data through the public tracking endpoint", async () => {
    const orderId = await makeOrder(customerA, "SHIPPED");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const tracking = await getPublicTracking(order.reference);
    expect(tracking).toBeTruthy();
    const serialised = JSON.stringify(tracking);
    // No identity, no address, no money.
    expect(serialised).not.toContain(customerA);
    expect(serialised).not.toContain("a@test.local");
    expect(serialised).not.toMatch(/totalCents|subtotalCents/);
  });
});

describe("producer isolation", () => {
  it("does not let a producer open a job assigned to another producer", async () => {
    const orderId = await makeOrder(customerA, "PAID");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, producerId: producerA, status: "ACCEPTED", payoutCents: 30_000 },
    });

    await expect(getJobForProducer(job.id, producerA)).resolves.toBeTruthy();
    await expect(getJobForProducer(job.id, producerB)).rejects.toThrow(AppError);
  });

  it("never exposes customer identity to the assigned producer", async () => {
    const orderId = await makeOrder(customerA, "PAID");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, producerId: producerA, status: "ACCEPTED", payoutCents: 30_000 },
    });

    const view = await getJobForProducer(job.id, producerA);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("a@test.local");
    expect(serialised).not.toContain(customerA);
  });
});

// ========================================================== concurrency ======

describe("job acceptance race", () => {
  it("lets exactly one producer win a contested job", async () => {
    const orderId = await makeOrder(customerA, "PRODUCER_PENDING");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, status: "OFFERED", payoutCents: 30_000 },
    });
    const expiresAt = new Date(Date.now() + 3_600_000);
    await db.jobOffer.createMany({
      data: [
        { jobId: job.id, producerId: producerA, score: 80, status: "OFFERED", expiresAt },
        { jobId: job.id, producerId: producerB, score: 75, status: "OFFERED", expiresAt },
      ],
    });

    const results = await Promise.allSettled([
      acceptJob(job.id, producerA),
      acceptJob(job.id, producerB),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("JOB_ALREADY_TAKEN");
    // And the loser is told what to do next, not just refused.
    expect((rejected.reason as AppError).action).toBeTruthy();

    const after = await db.productionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.producerId).not.toBeNull();
    expect(after.status).toBe("ACCEPTED");
  });

  it("refuses a producer already at their weekly capacity", async () => {
    await db.producer.update({ where: { id: producerA }, data: { weeklyCapacity: 1, activeJobCount: 1 } });
    const orderId = await makeOrder(customerA, "PRODUCER_PENDING");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, status: "OFFERED", payoutCents: 10_000 },
    });
    await db.jobOffer.create({
      data: { jobId: job.id, producerId: producerA, score: 90, status: "OFFERED", expiresAt: new Date(Date.now() + 3_600_000) },
    });

    await expect(acceptJob(job.id, producerA)).rejects.toMatchObject({ code: "CAPACITY_EXCEEDED" });
  });

  it("refuses an unverified producer even with a live offer", async () => {
    await db.producer.update({ where: { id: producerA }, data: { verificationLevel: "UNVERIFIED" } });
    const orderId = await makeOrder(customerA, "PRODUCER_PENDING");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, status: "OFFERED", payoutCents: 10_000 },
    });
    await db.jobOffer.create({
      data: { jobId: job.id, producerId: producerA, score: 90, status: "OFFERED", expiresAt: new Date(Date.now() + 3_600_000) },
    });

    await expect(acceptJob(job.id, producerA)).rejects.toMatchObject({ code: "PRODUCER_NOT_VERIFIED" });
  });

  it("refuses an expired offer", async () => {
    const orderId = await makeOrder(customerA, "PRODUCER_PENDING");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });
    const job = await db.productionJob.create({
      data: { reference: publicReference("JOB"), orderId, orderItemId: item.id, status: "OFFERED", payoutCents: 10_000 },
    });
    await db.jobOffer.create({
      data: { jobId: job.id, producerId: producerA, score: 90, status: "OFFERED", expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(acceptJob(job.id, producerA)).rejects.toMatchObject({ code: "JOB_ALREADY_TAKEN" });
  });
});

// ======================================================= state machine =======

describe("order transitions in the database", () => {
  it("records an append-only event for every status change", async () => {
    const orderId = await makeOrder(customerA);
    await transitionOrder({ orderId, to: "QUOTED", actor: "SYSTEM" });
    await transitionOrder({ orderId, to: "CUSTOMER_APPROVED", actor: "CUSTOMER", actorUserId: customerA });

    const events = await db.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["QUOTED", "CUSTOMER_APPROVED"]);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CUSTOMER_APPROVED");
  });

  it("treats a repeated transition as a no-op rather than an error or a duplicate", async () => {
    // This is what makes a re-delivered webhook safe.
    const orderId = await makeOrder(customerA, "PAYMENT_PENDING");
    await transitionOrder({ orderId, to: "PAID", actor: "PROVIDER_WEBHOOK" });
    await transitionOrder({ orderId, to: "PAID", actor: "PROVIDER_WEBHOOK" });

    const events = await db.orderEvent.findMany({ where: { orderId, toStatus: "PAID" } });
    expect(events).toHaveLength(1);
  });

  it("refuses an illegal transition and leaves the order untouched", async () => {
    const orderId = await makeOrder(customerA, "DRAFT");
    await expect(
      transitionOrder({ orderId, to: "SHIPPED", actor: "CUSTOMER", actorUserId: customerA }),
    ).rejects.toMatchObject({ code: "ILLEGAL_STATE_TRANSITION" });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("DRAFT");
    expect(await db.orderEvent.count({ where: { orderId } })).toBe(0);
  });

  it("detects a concurrent modification via the expected-from guard", async () => {
    const orderId = await makeOrder(customerA, "PAID");
    await expect(
      transitionOrder({ orderId, to: "PRODUCER_PENDING", actor: "SYSTEM", expectedFrom: "DRAFT" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("writes an audit row for each transition", async () => {
    const orderId = await makeOrder(customerA);
    await transitionOrder({ orderId, to: "QUOTED", actor: "SYSTEM", reason: "teste" });
    const audit = await db.auditLog.findMany({ where: { targetType: "Order", targetId: orderId } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.oldStateJson).toContain("DRAFT");
    expect(audit[0]!.newStateJson).toContain("QUOTED");
  });
});

// ============================================================= coupons =======

describe("coupon abuse controls", () => {
  async function makeCoupon(overrides: Record<string, unknown> = {}) {
    return db.coupon.create({
      data: {
        code: "TESTE10", kind: "PERCENT", valueBp: 1000, active: true,
        maxPerUser: 1, minSubtotalCents: 0, ...overrides,
      },
    });
  }

  it("applies a percentage discount with exact integer arithmetic", async () => {
    await makeCoupon();
    const result = await applyCoupon("TESTE10", customerA, 33_333);
    expect(result.discountCents).toBe(3333);
  });

  it("is case-insensitive on the code but not on the rules", async () => {
    await makeCoupon();
    await expect(applyCoupon("teste10", customerA, 10_000)).resolves.toBeTruthy();
  });

  it("refuses a second use by the same account", async () => {
    const coupon = await makeCoupon();
    const orderId = await makeOrder(customerA);
    await db.couponRedemption.create({
      data: { couponId: coupon.id, userId: customerA, orderId, amountCents: 1000 },
    });
    await expect(applyCoupon("TESTE10", customerA, 10_000)).rejects.toMatchObject({ code: "COUPON_INVALID" });
    // A different account is unaffected.
    await expect(applyCoupon("TESTE10", customerB, 10_000)).resolves.toBeTruthy();
  });

  it("refuses a coupon past its global redemption cap", async () => {
    await makeCoupon({ code: "LIMITADO", maxRedemptions: 5, redeemedCount: 5 });
    await expect(applyCoupon("LIMITADO", customerA, 10_000)).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" });
  });

  it("refuses an expired coupon and one that has not started", async () => {
    await makeCoupon({ code: "EXPIRADO", endsAt: new Date(Date.now() - 86_400_000) });
    await makeCoupon({ code: "FUTURO", startsAt: new Date(Date.now() + 86_400_000) });
    await expect(applyCoupon("EXPIRADO", customerA, 10_000)).rejects.toThrow(AppError);
    await expect(applyCoupon("FUTURO", customerA, 10_000)).rejects.toThrow(AppError);
  });

  it("enforces the minimum spend", async () => {
    await makeCoupon({ code: "MINIMO", minSubtotalCents: 20_000 });
    await expect(applyCoupon("MINIMO", customerA, 10_000)).rejects.toThrow(AppError);
    await expect(applyCoupon("MINIMO", customerA, 25_000)).resolves.toBeTruthy();
  });

  it("never discounts more than the subtotal on a fixed coupon", async () => {
    await makeCoupon({ code: "FIXO", kind: "FIXED", valueCents: 100_000 });
    const result = await applyCoupon("FIXO", customerA, 5_000);
    expect(result.discountCents).toBe(5_000);
  });

  it("refuses an unknown or inactive code", async () => {
    await makeCoupon({ code: "DESATIVADO", active: false });
    await expect(applyCoupon("NAOEXISTE", customerA, 10_000)).rejects.toThrow(AppError);
    await expect(applyCoupon("DESATIVADO", customerA, 10_000)).rejects.toThrow(AppError);
  });
});

// ============================================================= rewards =======

describe("reward farming controls", () => {
  async function makeCampaign(settlementDays = 7) {
    const campaign = await db.campaign.create({
      data: {
        slug: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Leve 3",
        description: "teste",
        ruleJson: JSON.stringify({
          kind: "PURCHASE_THRESHOLD", minItems: 3, minSpendCents: 0,
          categories: [], windowDays: 90, settlementDays, excludeRewardItems: true,
        }),
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000),
        active: true,
        maxGrantsPerUser: 1,
      },
    });
    await db.reward.create({
      data: { campaignId: campaign.id, name: "Miniatura", kind: "MINIATURE_3D", inventoryTotal: 10 },
    });
    return campaign.id;
  }

  async function settledOrder(userId: string, items: number, daysAgo: number) {
    const order = await db.order.create({
      data: {
        reference: publicReference("KJ"), userId, status: "DELIVERED", currency: "BRL",
        totalCents: 30_000, subtotalCents: 30_000,
        placedAt: new Date(Date.now() - daysAgo * 86_400_000),
      },
    });
    for (let i = 0; i < items; i += 1) {
      await db.orderItem.create({
        data: { orderId: order.id, kind: "CATALOG", quantity: 1, titleSnapshot: `item ${i}`, unitPriceCents: 10_000, totalPriceCents: 10_000 },
      });
    }
    return order.id;
  }

  it("does not qualify an order that has not settled yet", async () => {
    const campaignId = await makeCampaign(7);
    await settledOrder(customerA, 3, 1); // delivered yesterday
    const result = await evaluateEligibility(campaignId, customerA);
    expect(result.eligible).toBe(false);
    expect(result.qualifyingItems).toBe(0);
  });

  it("qualifies once the settlement window has passed", async () => {
    const campaignId = await makeCampaign(7);
    await settledOrder(customerA, 3, 30);
    const result = await evaluateEligibility(campaignId, customerA);
    expect(result.eligible).toBe(true);
    expect(result.qualifyingItems).toBe(3);
  });

  it("excludes a refunded order from the count", async () => {
    const campaignId = await makeCampaign(7);
    const orderId = await settledOrder(customerA, 3, 30);
    const payment = await db.payment.create({
      data: { orderId, provider: "mock", providerRef: `ref-${Date.now()}`, method: "PIX", status: "CAPTURED", currency: "BRL", amountCents: 30_000 },
    });
    await db.refund.create({
      data: { orderId, paymentId: payment.id, amountCents: 30_000, currency: "BRL", reason: "DEFECT", status: "SUCCEEDED" },
    });

    const result = await evaluateEligibility(campaignId, customerA);
    expect(result.eligible).toBe(false);
  });

  it("excludes an order with an open dispute", async () => {
    const campaignId = await makeCampaign(7);
    const orderId = await settledOrder(customerA, 3, 30);
    await db.dispute.create({
      data: { orderId, openedByUserId: customerA, category: "DEFECT", description: "x", status: "OPEN" },
    });
    expect((await evaluateEligibility(campaignId, customerA)).eligible).toBe(false);
  });

  it("grants exactly once for a qualifying order, even under a race", async () => {
    const campaignId = await makeCampaign(7);
    const orderId = await settledOrder(customerA, 3, 30);

    const results = await Promise.allSettled([
      grantReward({ campaignId, userId: customerA, qualifyingOrderId: orderId }),
      grantReward({ campaignId, userId: customerA, qualifyingOrderId: orderId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const grants = await db.rewardGrant.count({ where: { campaignId, userId: customerA } });
    expect(grants).toBe(1);
  });

  it("revokes the grant when the qualifying order is later refunded", async () => {
    const campaignId = await makeCampaign(7);
    const orderId = await settledOrder(customerA, 3, 30);
    await grantReward({ campaignId, userId: customerA, qualifyingOrderId: orderId });

    const revoked = await revokeGrantsForOrder(orderId, "Pedido reembolsado");
    expect(revoked).toBe(1);

    const grant = await db.rewardGrant.findFirstOrThrow({ where: { qualifyingOrderId: orderId } });
    expect(grant.status).toBe("REVOKED");
    // Inventory goes back, and a fraud signal is recorded for review.
    const reward = await db.reward.findFirstOrThrow({ where: { campaignId } });
    expect(reward.inventoryGranted).toBe(0);
    expect(await db.fraudSignal.count({ where: { orderId, kind: "REWARD_FARMING" } })).toBe(1);
  });

  it("does not let one customer's purchases qualify another", async () => {
    const campaignId = await makeCampaign(7);
    await settledOrder(customerA, 3, 30);
    expect((await evaluateEligibility(campaignId, customerB)).eligible).toBe(false);
  });
});

// ============================================================ shipping =======

describe("carrier event idempotency", () => {
  it("ignores a duplicate carrier event on replay", async () => {
    const orderId = await makeOrder(customerA, "SHIPPED");
    const shipment = await db.shipment.create({
      data: { orderId, provider: "manual", trackingCode: "BR000000001", status: "IN_TRANSIT" },
    });

    const events = [{
      externalId: "carrier-evt-1", code: "IN_TRANSIT", description: "Objeto em trânsito",
      occurredAt: new Date(), status: "IN_TRANSIT" as const,
    }];

    expect(await applyCarrierEvents(shipment.id, events)).toBe(1);
    // The carrier resends its whole history — this must be a no-op.
    expect(await applyCarrierEvents(shipment.id, events)).toBe(0);
    expect(await db.shipmentEvent.count({ where: { shipmentId: shipment.id } })).toBe(1);
  });

  it("moves the order to DELIVERED on a delivery event", async () => {
    const orderId = await makeOrder(customerA, "SHIPPED");
    const shipment = await db.shipment.create({
      data: { orderId, provider: "manual", trackingCode: "BR000000002", status: "IN_TRANSIT" },
    });
    await applyCarrierEvents(shipment.id, [{
      externalId: "d-1", code: "DELIVERED", description: "Entregue", occurredAt: new Date(), status: "DELIVERED",
    }]);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("DELIVERED");
    const updated = await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(updated.deliveredAt).not.toBeNull();
  });

  it("holds the order when the carrier reports a loss", async () => {
    const orderId = await makeOrder(customerA, "SHIPPED");
    const shipment = await db.shipment.create({
      data: { orderId, provider: "manual", trackingCode: "BR000000003", status: "IN_TRANSIT" },
    });
    await applyCarrierEvents(shipment.id, [{
      externalId: "l-1", code: "LOST", description: "Extraviado", occurredAt: new Date(), status: "LOST",
    }]);
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("ON_HOLD");
    expect(order.holdReason).toContain("extravio");
  });
});

// ========================================================== rate limits ======

describe("rate limiting", () => {
  it("allows a burst up to the limit and then blocks", async () => {
    const rule = { name: "test_rule", limit: 3, windowSeconds: 60, blockSeconds: 60 };
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(rule, "subject-1")).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(rule, "subject-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts subjects independently", async () => {
    const rule = { name: "test_rule_2", limit: 1, windowSeconds: 60 };
    expect((await checkRateLimit(rule, "s-a")).allowed).toBe(true);
    expect((await checkRateLimit(rule, "s-a")).allowed).toBe(false);
    expect((await checkRateLimit(rule, "s-b")).allowed).toBe(true);
  });

  it("stores only a keyed hash, never the raw subject", async () => {
    await checkRateLimit({ name: "test_rule_3", limit: 5, windowSeconds: 60 }, "203.0.113.42");
    const buckets = await db.rateLimitBucket.findMany();
    for (const bucket of buckets) expect(bucket.key).not.toContain("203.0.113.42");
  });
});

// ========================================================= recommender =======

describe("recommender", () => {
  async function makeProduct(slug: string, tags: [string, string][]) {
    const product = await db.product.create({
      data: {
        slug, name: slug, description: "x", category: "TOPS", garmentType: "Camiseta",
        basePriceCents: 10_000, published: true,
      },
    });
    for (const [kind, value] of tags) {
      await db.productTag.create({ data: { productId: product.id, kind, value } });
    }
    return product.id;
  }

  it("ranks by facet affinity built from actual behaviour", async () => {
    const viewed = await makeProduct("tech-1", [["STYLE", "techwear"], ["PALETTE", "dark"]]);
    const sibling = await makeProduct("tech-2", [["STYLE", "techwear"], ["PALETTE", "dark"]]);
    const unrelated = await makeProduct("pastel-1", [["STYLE", "minimal"], ["PALETTE", "pastel"]]);

    for (let i = 0; i < 5; i += 1) {
      await recordInteraction({ kind: "VIEW", userId: customerA, productId: viewed });
    }
    await recordInteraction({ kind: "PURCHASE", userId: customerA, productId: viewed });
    await rebuildTasteProfile({ userId: customerA });

    // Exclude the piece they already engaged with; a sibling sharing its facets
    // must surface, and the unrelated piece must not outrank it.
    const results = await recommend({ userId: customerA, limit: 5, excludeProductIds: [viewed] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.productId).toBe(sibling);
    expect(results[0]!.matchedFacets).toContain("STYLE:techwear");
    // Zero-overlap products are filtered out entirely rather than padded in.
    expect(results.map((r) => r.productId)).not.toContain(unrelated);
  });

  it("gives every recommendation a reason a customer can read", async () => {
    const a = await makeProduct("r-1", [["STYLE", "techwear"]]);
    const b = await makeProduct("r-2", [["STYLE", "techwear"]]);
    await recordInteraction({ kind: "PURCHASE", userId: customerA, productId: a });
    await rebuildTasteProfile({ userId: customerA });

    const results = await recommend({ userId: customerA, limit: 5 });
    for (const r of results) expect(r.reason.length).toBeGreaterThan(5);
    expect(b).toBeTruthy();
  });

  it("keeps one customer's behaviour out of another's profile", async () => {
    const product = await makeProduct("iso-1", [["STYLE", "techwear"]]);
    await recordInteraction({ kind: "PURCHASE", userId: customerA, productId: product });
    await rebuildTasteProfile({ userId: customerA });
    await rebuildTasteProfile({ userId: customerB });

    const a = await db.tasteProfile.findUnique({ where: { userId: customerA } });
    const b = await db.tasteProfile.findUnique({ where: { userId: customerB } });
    expect(JSON.parse(a!.affinityJson)).toHaveProperty("STYLE:techwear");
    expect(JSON.parse(b!.affinityJson)).toEqual({});
  });

  it("actually deletes behavioural data when asked", async () => {
    const product = await makeProduct("del-1", [["STYLE", "techwear"]]);
    await recordInteraction({ kind: "VIEW", userId: customerA, productId: product });
    await rebuildTasteProfile({ userId: customerA });
    expect(await db.interactionEvent.count({ where: { userId: customerA } })).toBeGreaterThan(0);

    await forgetTasteData({ userId: customerA });

    expect(await db.interactionEvent.count({ where: { userId: customerA } })).toBe(0);
    expect(await db.tasteProfile.findUnique({ where: { userId: customerA } })).toBeNull();
  });

  it("falls back to newest work instead of a fabricated 'trending' list", async () => {
    await makeProduct("cold-1", [["STYLE", "techwear"]]);
    const results = await recommend({ userId: customerB, limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.reason).toBe("Novidade do ateliê");
  });
});
