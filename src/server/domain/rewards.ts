import { z } from "zod";
import { db } from "../db";
import { AppError } from "../lib/errors";
import { log } from "../lib/logger";
import { recordAudit } from "./audit";

/**
 * Campaign rewards ("leve 3, ganhe uma miniatura").
 *
 * Every rule here is evaluated on the server against *settled* orders, and the
 * grant is written under a uniqueness constraint. Nothing about eligibility can
 * be asserted by a client, and nothing is granted from an order that has not
 * actually been paid for and kept.
 *
 * The abuse this defends against is specific and real: buy three pieces, claim
 * the collectible, refund the order. The `settlementDays` gate and the revoke
 * path exist for exactly that.
 */

export const CampaignRuleSchema = z.object({
  kind: z.literal("PURCHASE_THRESHOLD"),
  /** Minimum number of qualifying items across the window. */
  minItems: z.number().int().min(1).max(50).default(3),
  /** Or a minimum spend, whichever the campaign uses. */
  minSpendCents: z.number().int().min(0).default(0),
  /** Only these categories count, when set. */
  categories: z.array(z.string()).default([]),
  /** Rolling window in days over which purchases accumulate. */
  windowDays: z.number().int().min(1).max(365).default(90),
  /**
   * Days an order must be settled (delivered, no open dispute, not refunded)
   * before it counts. This is the anti-farming gate.
   */
  settlementDays: z.number().int().min(0).max(90).default(7),
  /** Custom items and rewards themselves never count towards a threshold. */
  excludeRewardItems: z.boolean().default(true),
});
export type CampaignRule = z.infer<typeof CampaignRuleSchema>;

export interface EligibilityResult {
  eligible: boolean;
  qualifyingItems: number;
  qualifyingSpendCents: number;
  /** Everything the customer needs to understand where they stand. */
  progress: { label: string; current: number; target: number }[];
  blockedReason?: string;
}

/**
 * Computes eligibility from the database. Never accepts a count, a total, or a
 * flag from the caller — those all come from settled order rows.
 */
export async function evaluateEligibility(
  campaignId: string,
  userId: string,
): Promise<EligibilityResult> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { rewards: true },
  });
  if (!campaign) throw new AppError("NOT_FOUND", "Campanha não encontrada.");

  const rule = CampaignRuleSchema.parse(JSON.parse(campaign.ruleJson));
  const now = new Date();

  if (!campaign.active || campaign.startsAt > now || campaign.endsAt < now) {
    return {
      eligible: false,
      qualifyingItems: 0,
      qualifyingSpendCents: 0,
      progress: [],
      blockedReason: "Esta campanha não está ativa no momento.",
    };
  }

  const windowStart = new Date(now.getTime() - rule.windowDays * 86_400_000);
  const settlementCutoff = new Date(now.getTime() - rule.settlementDays * 86_400_000);

  // Only orders that are actually settled count: delivered or completed, placed
  // long enough ago, never refunded, with no open dispute.
  const orders = await db.order.findMany({
    where: {
      userId,
      status: { in: ["DELIVERED", "COMPLETED"] },
      placedAt: { gte: windowStart, lte: settlementCutoff },
    },
    include: {
      items: { include: { product: { select: { category: true } } } },
      refunds: { where: { status: { in: ["PENDING", "SUCCEEDED"] } }, select: { id: true } },
      disputes: { where: { status: { in: ["OPEN", "INVESTIGATING", "AWAITING_EVIDENCE"] } }, select: { id: true } },
    },
  });

  let qualifyingItems = 0;
  let qualifyingSpendCents = 0;

  for (const order of orders) {
    if (order.refunds.length > 0 || order.disputes.length > 0) continue;
    for (const item of order.items) {
      if (rule.excludeRewardItems && item.kind === "REWARD") continue;
      if (rule.categories.length > 0) {
        const category = item.product?.category;
        if (!category || !rule.categories.includes(category)) continue;
      }
      qualifyingItems += item.quantity;
      qualifyingSpendCents += item.totalPriceCents;
    }
  }

  const alreadyGranted = await db.rewardGrant.count({
    where: { campaignId, userId, status: { in: ["GRANTED", "RESERVED", "SHIPPED"] } },
  });

  const progress = [
    ...(rule.minItems > 0
      ? [{ label: "Peças qualificadas", current: Math.min(qualifyingItems, rule.minItems), target: rule.minItems }]
      : []),
    ...(rule.minSpendCents > 0
      ? [{ label: "Valor acumulado", current: Math.min(qualifyingSpendCents, rule.minSpendCents), target: rule.minSpendCents }]
      : []),
  ];

  if (alreadyGranted >= campaign.maxGrantsPerUser) {
    return {
      eligible: false, qualifyingItems, qualifyingSpendCents, progress,
      blockedReason: "Você já recebeu o máximo desta campanha.",
    };
  }
  if (campaign.maxGrantsTotal !== null && campaign.grantedCount >= campaign.maxGrantsTotal) {
    return {
      eligible: false, qualifyingItems, qualifyingSpendCents, progress,
      blockedReason: "Os itens desta campanha se esgotaram.",
    };
  }

  const meetsItems = rule.minItems === 0 || qualifyingItems >= rule.minItems;
  const meetsSpend = rule.minSpendCents === 0 || qualifyingSpendCents >= rule.minSpendCents;

  return {
    eligible: meetsItems && meetsSpend,
    qualifyingItems,
    qualifyingSpendCents,
    progress,
    ...(meetsItems && meetsSpend
      ? {}
      : {
          blockedReason: `Faltam ${Math.max(0, rule.minItems - qualifyingItems)} peça(s) entregues e sem devolução para completar.`,
        }),
  };
}

/**
 * Grants a reward.
 *
 * The unique constraint on (campaignId, qualifyingOrderId) plus the inventory
 * check inside the transaction mean two concurrent requests cannot both win.
 */
export async function grantReward(params: {
  campaignId: string;
  userId: string;
  qualifyingOrderId: string;
  rewardId?: string;
}): Promise<{ grantId: string; rewardName: string }> {
  const eligibility = await evaluateEligibility(params.campaignId, params.userId);
  if (!eligibility.eligible) {
    throw new AppError("REWARD_NOT_ELIGIBLE", eligibility.blockedReason ?? "Você ainda não atende aos requisitos desta campanha.", {
      action: "A página da campanha mostra exatamente o que falta.",
    });
  }

  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({
      where: { id: params.campaignId },
      include: { rewards: true },
    });

    const reward = params.rewardId
      ? campaign.rewards.find((r) => r.id === params.rewardId)
      : campaign.rewards.find((r) => r.inventoryTotal - r.inventoryGranted - r.inventoryReserved > 0);

    if (!reward) {
      throw new AppError("REWARD_OUT_OF_STOCK", "Este item da campanha acabou.", {
        action: "Veja os outros itens disponíveis na campanha.",
      });
    }

    const available = reward.inventoryTotal - reward.inventoryGranted - reward.inventoryReserved;
    if (available <= 0) {
      throw new AppError("REWARD_OUT_OF_STOCK", `"${reward.name}" está esgotado.`, {
        action: "Escolha outro item da campanha.",
      });
    }

    let grant;
    try {
      grant = await tx.rewardGrant.create({
        data: {
          campaignId: params.campaignId,
          rewardId: reward.id,
          userId: params.userId,
          qualifyingOrderId: params.qualifyingOrderId,
          status: "GRANTED",
          settlementCheckedAt: new Date(),
        },
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        throw new AppError("CONFLICT", "Este pedido já gerou um item desta campanha.", {
          action: "Confira a sua coleção — ele já está lá.",
        });
      }
      throw error;
    }

    await tx.reward.update({
      where: { id: reward.id },
      data: { inventoryGranted: { increment: 1 } },
    });
    await tx.campaign.update({
      where: { id: params.campaignId },
      data: { grantedCount: { increment: 1 } },
    });

    return { grantId: grant.id, rewardName: reward.name };
  });
}

/**
 * The other half of the anti-farming design: if a qualifying order is later
 * refunded or disputed, the grant is revoked rather than quietly kept.
 */
export async function revokeGrantsForOrder(orderId: string, reason: string): Promise<number> {
  const grants = await db.rewardGrant.findMany({
    where: { qualifyingOrderId: orderId, status: { in: ["GRANTED", "RESERVED"] } },
    select: { id: true, rewardId: true, campaignId: true, userId: true },
  });

  for (const grant of grants) {
    await db.$transaction([
      db.rewardGrant.update({ where: { id: grant.id }, data: { status: "REVOKED", revokeReason: reason } }),
      db.reward.update({ where: { id: grant.rewardId }, data: { inventoryGranted: { decrement: 1 } } }),
      db.campaign.update({ where: { id: grant.campaignId }, data: { grantedCount: { decrement: 1 } } }),
    ]);
    await db.fraudSignal.create({
      data: { userId: grant.userId, orderId, kind: "REWARD_FARMING", score: 40, detail: reason, action: "LOGGED" },
    });
    await recordAudit({
      action: "reward.revoked",
      targetType: "RewardGrant",
      targetId: grant.id,
      reason,
      newState: { status: "REVOKED" },
    });
  }

  if (grants.length > 0) log.info("rewards.revoked", { orderId, count: grants.length });
  return grants.length;
}

/** Runs from the queue after an order is paid: checks every active campaign. */
export async function evaluateActiveCampaignsForUser(userId: string, orderId: string): Promise<void> {
  const campaigns = await db.campaign.findMany({
    where: { active: true, startsAt: { lte: new Date() }, endsAt: { gte: new Date() } },
    select: { id: true, name: true },
  });

  for (const campaign of campaigns) {
    const eligibility = await evaluateEligibility(campaign.id, userId).catch(() => null);
    if (!eligibility?.eligible) continue;
    try {
      const { rewardName } = await grantReward({ campaignId: campaign.id, userId, qualifyingOrderId: orderId });
      const { enqueue } = await import("../jobs/queue");
      await enqueue("notification", {
        kind: "REWARD_GRANTED",
        userId,
        campaignName: campaign.name,
        rewardName,
      });
    } catch (error) {
      // Out of stock or already granted are normal outcomes, not failures.
      log.debug("rewards.grant_skipped", { campaignId: campaign.id, userId, error });
    }
  }
}
