import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { hashPassword } from "@/server/lib/crypto";
import { createDesign, attachReference, analyseDesign, reviseSpec, approveVersion, createQuotation, assertQuotationValid } from "@/server/domain/designs";
import { checkout } from "@/server/domain/checkout";
import { transitionOrder, getOrderForCustomer } from "@/server/domain/orders";
import { dispatchOrderToProducers, acceptJob, advanceStage, submitQualityCheck } from "@/server/domain/production";
import { parseSpecJson, specHash, isApprovable } from "@/server/domain/spec";
import { storeImage } from "@/server/storage";
import { drainQueues } from "@/server/jobs/handlers";
import { AppError } from "@/server/lib/errors";

/**
 * The full journey, through the real domain layer against a real database.
 *
 * This is the test that proves the product actually works rather than that its
 * pieces type-check: imagine → analyse → revise → approve → quote → pay →
 * dispatch → accept → produce → QC → deliver.
 *
 * It also proves the guarantees that only appear end to end: that the spec the
 * atelier receives is byte-identical to the one the customer approved, and that
 * a quote cannot survive a change to the spec it was priced from.
 */

function pngFixture(width = 1200, height = 1600): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13);
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(width, 0);
  dims.writeUInt32BE(height, 4);
  return Buffer.concat([header, len, Buffer.from("IHDR", "ascii"), dims, Buffer.alloc(60_000, 0x5a)]);
}

let customerId: string;
let addressId: string;
let profileId: string;
let producerId: string;

async function truncateAll(): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
  `;
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  try {
    for (const { name } of tables) await db.$executeRawUnsafe(`DELETE FROM "${name}"`);
  } finally {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

beforeEach(async () => {
  await truncateAll();
  const hash = await hashPassword("uma senha longa de teste para jornada");

  const customer = await db.user.create({
    data: { email: "jornada@test.local", displayName: "Cliente Jornada", passwordHash: hash, roles: "CUSTOMER", emailVerified: new Date() },
  });
  customerId = customer.id;

  const address = await db.address.create({
    data: {
      userId: customerId, label: "Casa", recipient: "Cliente Jornada",
      line1: "Rua Teste, 1", city: "São Paulo", state: "SP", postalCode: "01310100", isDefault: true,
    },
  });
  addressId = address.id;

  const profile = await db.measurementProfile.create({
    data: {
      userId: customerId, name: "Meu corpo", isDefault: true, source: "SELF_REPORTED",
      heightMm: 1750, chestMm: 1000, waistMm: 860, hipMm: 1010,
      shoulderMm: 460, sleeveMm: 620, neckMm: 390,
    },
  });
  profileId = profile.id;

  const producerUser = await db.user.create({
    data: { email: "atelie.jornada@test.local", displayName: "Ateliê Jornada", passwordHash: hash, roles: "CUSTOMER,PRODUCER" },
  });
  const producer = await db.producer.create({
    data: {
      userId: producerUser.id, studioName: "Ateliê Jornada", city: "São Paulo", state: "SP",
      status: "ACTIVE", verificationLevel: "TRUSTED", verifiedAt: new Date(),
      weeklyCapacity: 5, maxComplexity: 5, qualityScore: 800,
    },
  });
  producerId = producer.id;
  await db.producerSpecialization.createMany({
    data: [
      { producerId, kind: "GARMENT", value: "OUTERWEAR", skillLevel: 5 },
      { producerId, kind: "TECHNIQUE", value: "EMBROIDERY", skillLevel: 4 },
    ],
  });
});

describe("full journey: imagine → translate → approve → build → deliver", () => {
  it("carries one garment from an idea to a delivered order", async () => {
    // ---- 1. The customer describes what they want -------------------------
    const designId = await createDesign({
      userId: customerId,
      title: "Jaqueta bomber da minha cabeça",
      briefText:
        "Quero uma jaqueta bomber preta, bem oversized, em sarja pesada. " +
        "Manga raglan, gola de ribana, zíper na frente e bolso embutido. Bordado pequeno no peito.",
    });
    expect(designId).toBeTruthy();

    // ---- 2. References, each with a declared role -------------------------
    const silhouette = await storeImage({
      buffer: pngFixture(1400, 1800), declaredName: "silhueta.png",
      purpose: "REFERENCE", ownerUserId: customerId,
    });
    const sleeves = await storeImage({
      buffer: pngFixture(1000, 1000), declaredName: "manga.png",
      purpose: "REFERENCE", ownerUserId: customerId,
    });

    for (const [file, role, caption] of [
      [silhouette, "SILHOUETTE", "o formato geral"],
      [sleeves, "SLEEVES", "só o punho"],
    ] as const) {
      const reference = await db.referenceImage.create({
        data: { userId: customerId, fileId: file.fileId, role, caption },
      });
      await attachReference({ designId, userId: customerId, referenceImageId: reference.id, role });
    }

    const withRefs = await db.designReference.count({ where: { designId } });
    expect(withRefs).toBe(2);

    // ---- 3. Analysis produces a spec awaiting review ----------------------
    await db.design.update({ where: { id: designId }, data: { measurementProfileId: profileId } });
    const analysis = await analyseDesign({
      designId, userId: customerId, rateLimitSubject: `user:${customerId}`,
    });
    expect(analysis.version).toBe(1);

    const v1 = await db.designVersion.findUniqueOrThrow({ where: { id: analysis.versionId } });
    expect(v1.authoredBy).toBe("AI");
    // The AI's output is never pre-approved.
    expect(v1.approvedAt).toBeNull();

    const spec1 = parseSpecJson(v1.specJson);
    expect(spec1.garmentType.value).toContain("Jaqueta");
    // Fabric was named by the customer, so it is observed — but the analyser
    // must not claim to have read it from the image.
    expect(spec1.materialEstimate?.confidence).toBe("OBSERVED");
    expect(spec1.referenceUsage).toHaveLength(2);
    // Measurements were supplied, so nothing blocks approval.
    expect(isApprovable(spec1)).toBe(true);

    // ---- 4. The customer corrects a line ---------------------------------
    const revised = await reviseSpec({
      designId,
      userId: customerId,
      spec: {
        ...spec1,
        collar: { value: "Gola de ribana canelada, 4 cm", confidence: "OBSERVED", editedByCustomer: true },
      },
      changeSummary: "Especifiquei a gola",
    });
    expect(revised.version).toBe(2);
    // Editing never overwrites: v1 is still there.
    expect(await db.designVersion.count({ where: { designId } })).toBe(2);

    // ---- 5. Approval freezes and signs the version -----------------------
    const { specHash: approvedHash } = await approveVersion({
      designId, versionId: revised.versionId, userId: customerId,
    });
    expect(approvedHash).toMatch(/^[0-9a-f]{64}$/);

    const v2 = await db.designVersion.findUniqueOrThrow({ where: { id: revised.versionId } });
    expect(v2.approvedAt).not.toBeNull();
    expect(specHash(parseSpecJson(v2.specJson))).toBe(approvedHash);

    // ---- 6. Quotation, bound to that hash --------------------------------
    const quotationId = await createQuotation({
      designId, versionId: revised.versionId, userId: customerId, quantity: 1, rush: false,
    });
    const quote = await assertQuotationValid(quotationId, customerId);
    expect(quote.totalCents).toBeGreaterThan(0);
    expect(quote.specHash).toBe(approvedHash);
    // The breakdown must sum to the total shown.
    const lines = JSON.parse(quote.breakdownJson) as { amountCents: number }[];
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(quote.totalCents);

    // ---- 7. Checkout: the client sends ids, the server prices ------------
    const result = await checkout({
      userId: customerId,
      lines: [{ kind: "CUSTOM", quotationId, measurementProfileId: profileId, quantity: 1 }],
      addressId,
      shippingService: "STANDARD",
      method: "PIX",
      rateLimitSubject: `user:${customerId}`,
    });
    expect(result.orderReference).toMatch(/^KJ-/);
    expect(result.totalCents).toBeGreaterThan(quote.totalCents); // + shipping

    const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order.status).toBe("PAYMENT_PENDING");
    expect(order.subtotalCents).toBe(quote.totalCents);

    // ---- 8. Payment confirmed by the provider, not the browser -----------
    await db.payment.updateMany({
      where: { orderId: result.orderId },
      data: { status: "CAPTURED", capturedAt: new Date() },
    });
    await transitionOrder({
      orderId: result.orderId, to: "PAID", actor: "PROVIDER_WEBHOOK",
      reason: "Pagamento confirmado pelo provedor.",
    });

    // ---- 9. Dispatch to matched ateliers ---------------------------------
    const jobsCreated = await dispatchOrderToProducers(result.orderId);
    expect(jobsCreated).toBeGreaterThan(0);

    const job = await db.productionJob.findFirstOrThrow({
      where: { orderId: result.orderId, role: "PRIMARY" },
    });
    expect(job.status).toBe("OFFERED");
    expect(job.payoutCents).toBeGreaterThan(0);

    const offer = await db.jobOffer.findFirstOrThrow({ where: { jobId: job.id, producerId } });
    expect(offer.status).toBe("OFFERED");

    // ---- 10. The atelier receives EXACTLY the approved spec --------------
    const jobVersion = await db.designVersion.findUniqueOrThrow({ where: { id: job.designVersionId! } });
    expect(jobVersion.id).toBe(revised.versionId);
    expect(specHash(parseSpecJson(jobVersion.specJson))).toBe(approvedHash);

    // ---- 11. Acceptance and production -----------------------------------
    await acceptJob(job.id, producerId);
    const accepted = await db.productionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(accepted.producerId).toBe(producerId);

    // Walk the atelier's real path: every stage the job was given.
    const stages = await db.productionStage.findMany({
      where: { jobId: job.id }, orderBy: { position: "asc" },
    });
    expect(stages.length).toBeGreaterThan(3);

    for (const stage of stages) {
      if (stage.stage === "QC" || stage.stage === "PACKED") continue;
      await advanceStage({ jobId: job.id, producerId, stage: stage.stage as "SEWING", status: "IN_PROGRESS" });
      await advanceStage({ jobId: job.id, producerId, stage: stage.stage as "SEWING", status: "DONE" });
    }

    const midway = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(["SEWING", "CUTTING", "MATERIALS_PREPARATION", "FINISHING"]).toContain(midway.status);

    // ---- 12. Quality control against the approved numbers ----------------
    const target = parseSpecJson(jobVersion.specJson).measurements!;
    const qc = await submitQualityCheck({
      jobId: job.id,
      producerId,
      // Within the ±15 mm tolerance the customer agreed to.
      measured: { chestMm: (target.chestMm ?? 1000) + 8, waistMm: (target.waistMm ?? 860) - 5 },
      checklist: { measurements: true, seams: true, finishing: true, symmetry: true, hardware: true, print: true, fabric: true, pressing: true },
      inspectorUserId: customerId,
    });
    expect(qc.result).toBe("PASS");
    expect(qc.failures).toHaveLength(0);

    // Recording the check is what puts the order into quality control — the
    // producer does not have to remember a separate step.
    const afterQc = await db.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(afterQc.status).toBe("QUALITY_CONTROL");

    // ---- 13. Ship and deliver --------------------------------------------
    await transitionOrder({ orderId: result.orderId, to: "READY_TO_SHIP", actor: "PRODUCER", reason: "Aprovado no CQ." });
    await transitionOrder({ orderId: result.orderId, to: "SHIPPED", actor: "PRODUCER", reason: "Postado." });
    await transitionOrder({ orderId: result.orderId, to: "DELIVERED", actor: "PROVIDER_WEBHOOK", reason: "Entregue." });

    const final = await getOrderForCustomer(result.orderId, customerId);
    expect(final.status).toBe("DELIVERED");
    expect(final.items).toHaveLength(1);
    // The order item carries an immutable snapshot of what was actually bought.
    expect(final.items[0]!.specSnapshotJson).toBeTruthy();
    expect(specHash(parseSpecJson(final.items[0]!.specSnapshotJson!))).toBe(approvedHash);

    // ---- 14. The history explains every state it passed through ----------
    const events = await db.orderEvent.findMany({
      where: { orderId: result.orderId }, orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.toStatus)).toContain("PAID");
    expect(events.map((e) => e.toStatus)).toContain("DELIVERED");
    for (const event of events) expect(event.reason).toBeTruthy();

    // ---- 15. Queued side effects run without error -----------------------
    const processed = await drainQueues("journey-test", 50);
    expect(processed).toBeGreaterThan(0);

    // Uploaded references got a scan verdict; nothing stays PENDING forever.
    const files = await db.storedFile.findMany({ where: { ownerUserId: customerId } });
    expect(files).toHaveLength(2);
    for (const file of files) expect(file.scanStatus).toBe("CLEAN");
  }, 60_000);

  it("refuses a quote whose spec changed after pricing", async () => {
    const designId = await createDesign({ userId: customerId, title: "Teste", briefText: "camiseta preta em algodão" });
    await db.design.update({ where: { id: designId }, data: { measurementProfileId: profileId } });
    const analysis = await analyseDesign({ designId, userId: customerId, rateLimitSubject: `user:${customerId}` });

    await approveVersion({ designId, versionId: analysis.versionId, userId: customerId });
    const quotationId = await createQuotation({
      designId, versionId: analysis.versionId, userId: customerId, quantity: 1, rush: false,
    });
    await expect(assertQuotationValid(quotationId, customerId)).resolves.toBeTruthy();

    // Someone alters the approved version's content out from under the quote.
    const version = await db.designVersion.findUniqueOrThrow({ where: { id: analysis.versionId } });
    const tampered = parseSpecJson(version.specJson);
    await db.designVersion.update({
      where: { id: analysis.versionId },
      data: {
        specJson: JSON.stringify({
          ...tampered,
          materialEstimate: { value: "Couro italiano", confidence: "OBSERVED", editedByCustomer: false },
        }),
      },
    });

    // The quote no longer matches what would be produced, and is refused.
    await expect(assertQuotationValid(quotationId, customerId)).rejects.toMatchObject({ code: "SPEC_CHANGED" });
  }, 30_000);

  it("blocks approval when the customer has no measurements", async () => {
    const designId = await createDesign({ userId: customerId, title: "Sem medidas", briefText: "calça cargo em sarja" });
    // Deliberately not attaching a measurement profile.
    const analysis = await analyseDesign({ designId, userId: customerId, rateLimitSubject: `user:${customerId}` });

    const spec = parseSpecJson(
      (await db.designVersion.findUniqueOrThrow({ where: { id: analysis.versionId } })).specJson,
    );
    expect(isApprovable(spec)).toBe(false);

    await expect(
      approveVersion({ designId, versionId: analysis.versionId, userId: customerId }),
    ).rejects.toMatchObject({ code: "SPEC_NOT_APPROVED" });
  }, 30_000);

  it("refuses to quote a version the customer never approved", async () => {
    const designId = await createDesign({ userId: customerId, title: "Não aprovado", briefText: "moletom cinza" });
    await db.design.update({ where: { id: designId }, data: { measurementProfileId: profileId } });
    const analysis = await analyseDesign({ designId, userId: customerId, rateLimitSubject: `user:${customerId}` });

    await expect(
      createQuotation({ designId, versionId: analysis.versionId, userId: customerId, quantity: 1, rush: false }),
    ).rejects.toMatchObject({ code: "SPEC_NOT_APPROVED" });
  }, 30_000);

  it("refuses to attach another customer's reference to a design", async () => {
    const hash = await hashPassword("outra senha bem longa de teste");
    const other = await db.user.create({
      data: { email: "outro@test.local", displayName: "Outro", passwordHash: hash, roles: "CUSTOMER" },
    });
    const theirFile = await storeImage({
      buffer: pngFixture(800, 800), declaredName: "deles.png", purpose: "REFERENCE", ownerUserId: other.id,
    });
    const theirReference = await db.referenceImage.create({
      data: { userId: other.id, fileId: theirFile.fileId, role: "OVERALL" },
    });

    const designId = await createDesign({ userId: customerId, title: "Meu design", briefText: "jaqueta" });

    // The classic IDOR here: attach someone else's upload by id.
    await expect(
      attachReference({ designId, userId: customerId, referenceImageId: theirReference.id, role: "OVERALL" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }, 30_000);
});
