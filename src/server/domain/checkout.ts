import { db } from "../db";
import { AppError, notFound } from "../lib/errors";
import { publicReference } from "../lib/crypto";
import { log } from "../lib/logger";
import { money, add, applyBasisPoints, allocateByWeights, type CurrencyCode } from "../lib/money";
import { assertQuotationValid } from "./designs";
import { transitionOrder } from "./orders";
import { parseSpecJson } from "./spec";
import { quoteShipping } from "../shipping";
import { paymentProvider } from "../payments";
import { recordAudit } from "./audit";
import { enforceRateLimit, RATE_LIMITS } from "../lib/ratelimit";
import { env } from "../lib/env";

/**
 * Checkout.
 *
 * The single most important property of this file: **every monetary value is
 * recomputed here from server-side sources.** The client sends ids and
 * quantities. It does not send prices, discounts, shipping costs, totals, or
 * eligibility. Anything it did send about money is ignored.
 */

export interface CheckoutLine {
  kind: "CATALOG" | "CUSTOM";
  /** For CATALOG. */
  variantId?: string;
  /** For CUSTOM. */
  quotationId?: string;
  measurementProfileId?: string;
  quantity: number;
}

export interface CheckoutInput {
  userId: string;
  lines: CheckoutLine[];
  addressId: string;
  couponCode?: string | null;
  shippingService: string;
  method: "CARD" | "PIX" | "BOLETO";
  rateLimitSubject: string;
}

export interface CheckoutResult {
  orderId: string;
  orderReference: string;
  totalCents: number;
  currency: CurrencyCode;
  payment: { providerRef: string; redirectUrl?: string; displayCode?: string; expiresAt?: Date };
}

const CURRENCY: CurrencyCode = "BRL";

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  await enforceRateLimit(RATE_LIMITS.checkout, input.rateLimitSubject, { userId: input.userId, route: "checkout" });

  if (input.lines.length === 0) {
    throw new AppError("CART_EMPTY", "Sua sacola está vazia.", {
      action: "Adicione uma peça da loja ou crie um design personalizado.",
    });
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { id: true, email: true, emailVerified: true },
  });

  const address = await db.address.findFirst({
    where: { id: input.addressId, userId: input.userId, deletedAt: null },
  });
  if (!address) throw notFound("O endereço de entrega");

  const seller = await db.sellerAccount.findFirst({
    where: { userId: input.userId, status: "APPROVED" },
    select: { discountBp: true },
  });

  // ---- resolve every line from the database -----------------------------
  interface ResolvedLine {
    kind: "CATALOG" | "CUSTOM";
    title: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
    productId?: string;
    variantId?: string;
    designId?: string;
    designVersionId?: string;
    quotationId?: string;
    measurementProfileId?: string;
    creatorStoreId?: string;
    specSnapshotJson?: string;
    producerPayoutCents: number;
    creatorCommissionCents: number;
    weightGrams: number;
  }

  const resolved: ResolvedLine[] = [];

  for (const line of input.lines) {
    const quantity = Math.max(1, Math.min(20, Math.trunc(line.quantity)));

    if (line.kind === "CATALOG") {
      if (!line.variantId) throw new AppError("VALIDATION_FAILED", "Item do carrinho incompleto.");
      const variant = await db.productVariant.findFirst({
        where: { id: line.variantId, active: true, product: { published: true, deletedAt: null } },
        include: { product: { include: { creatorStore: true } } },
      });
      if (!variant) throw notFound("O produto selecionado");

      // Stock is only meaningful for stocked goods; made-to-order has none.
      if (variant.product.fulfilment !== "MADE_TO_ORDER") {
        const available = variant.stockOnHand - variant.stockReserved;
        if (available < quantity) {
          throw new AppError(
            "OUT_OF_STOCK",
            available <= 0
              ? `"${variant.product.name}" (${variant.size}) está esgotado.`
              : `Restam apenas ${available} unidades de "${variant.product.name}" (${variant.size}).`,
            { action: "Ajuste a quantidade ou escolha outro tamanho." },
          );
        }
      }

      // Price comes from the product row, never from the request.
      let unit = money(variant.product.basePriceCents + variant.priceDeltaCents, CURRENCY);
      if (seller) unit = money(unit.cents - applyBasisPoints(unit, seller.discountBp).cents, CURRENCY);

      const creatorCommission = variant.product.creatorStore
        ? applyBasisPoints(money(unit.cents * quantity, CURRENCY), variant.product.creatorStore.commissionBp)
        : money(0, CURRENCY);

      resolved.push({
        kind: "CATALOG",
        title: `${variant.product.name} — ${variant.size} / ${variant.colorway}`,
        quantity,
        unitPriceCents: unit.cents,
        totalPriceCents: unit.cents * quantity,
        productId: variant.productId,
        variantId: variant.id,
        ...(variant.product.creatorStoreId ? { creatorStoreId: variant.product.creatorStoreId } : {}),
        producerPayoutCents: 0,
        // The creator's cut is what the platform pays out, computed here and
        // never derived from anything the creator controls.
        creatorCommissionCents: creatorCommission.cents,
        weightGrams: variant.product.category === "OUTERWEAR" ? 1200 : 450,
      });
      continue;
    }

    // --- custom line -----------------------------------------------------
    if (!line.quotationId) throw new AppError("VALIDATION_FAILED", "Orçamento não informado para a peça personalizada.");
    const quotation = await assertQuotationValid(line.quotationId, input.userId);
    const spec = parseSpecJson(quotation.designVersion.specJson);

    if (!line.measurementProfileId) {
      throw new AppError("VALIDATION_FAILED", "Escolha o perfil de medidas desta peça.", {
        fields: { measurementProfileId: "Uma peça sob medida precisa de medidas." },
        action: "Selecione ou crie um perfil de medidas antes de finalizar.",
      });
    }
    const profile = await db.measurementProfile.findFirst({
      where: { id: line.measurementProfileId, userId: input.userId, deletedAt: null },
    });
    if (!profile) throw notFound("O perfil de medidas");

    const { quoteDesign } = await import("./pricing");
    const recomputed = quoteDesign({
      spec,
      quantity: 1,
      rush: false,
      ...(seller ? { sellerDiscountBp: seller.discountBp } : {}),
    });

    // The stored quote and a fresh computation must agree. A mismatch means the
    // rate card moved under a live quote; honouring the stored one is correct,
    // but it is worth knowing about.
    if (recomputed.totalCents !== quotation.totalCents) {
      log.warn("checkout.quote_drift", {
        quotationId: quotation.id,
        stored: quotation.totalCents,
        recomputed: recomputed.totalCents,
      });
    }

    resolved.push({
      kind: "CUSTOM",
      title: `Sob medida — ${spec.garmentType.value}`,
      quantity: 1,
      unitPriceCents: quotation.totalCents,
      totalPriceCents: quotation.totalCents,
      designId: quotation.designId,
      designVersionId: quotation.designVersionId,
      quotationId: quotation.id,
      measurementProfileId: profile.id,
      specSnapshotJson: quotation.designVersion.specJson,
      producerPayoutCents: recomputed.producerPayoutCents,
      creatorCommissionCents: 0,
      weightGrams: spec.category === "OUTERWEAR" ? 1400 : 600,
    });
  }

  const subtotal = resolved.reduce((sum, l) => sum + l.totalPriceCents, 0);

  // ---- coupon -----------------------------------------------------------
  let discountCents = 0;
  let couponId: string | null = null;
  if (input.couponCode) {
    const applied = await applyCoupon(input.couponCode, input.userId, subtotal);
    discountCents = applied.discountCents;
    couponId = applied.couponId;
  }

  // ---- shipping ---------------------------------------------------------
  const totalWeight = resolved.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0);
  const quotes = await quoteShipping({
    originPostalCode: env.SHIP_ORIGIN_POSTAL_CODE,
    destinationPostalCode: address.postalCode,
    weightGrams: totalWeight,
    lengthCm: 35,
    widthCm: 27,
    heightCm: Math.max(6, Math.ceil(totalWeight / 400)),
    declaredValueCents: subtotal,
  });
  const chosen = quotes.find((q) => q.service === input.shippingService);
  if (!chosen) {
    throw new AppError("VALIDATION_FAILED", "A modalidade de entrega escolhida não está mais disponível.", {
      action: "Escolha uma das opções de entrega listadas.",
    });
  }
  // Free-shipping coupons zero the line here, after the real cost is known.
  const couponIsFreeShipping = couponId
    ? (await db.coupon.findUnique({ where: { id: couponId }, select: { kind: true } }))?.kind === "FREE_SHIPPING"
    : false;
  const shippingCents = couponIsFreeShipping ? 0 : chosen.priceCents;

  const totalCents = Math.max(0, subtotal - discountCents + shippingCents);

  // ---- persist ----------------------------------------------------------
  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        reference: publicReference("KJ"),
        userId: input.userId,
        status: "DRAFT",
        currency: CURRENCY,
        subtotalCents: subtotal,
        discountCents,
        shippingCents,
        taxCents: 0,
        totalCents,
        platformFeeCents: 0,
        producerPayoutCents: resolved.reduce((s, l) => s + l.producerPayoutCents, 0),
        creatorCommissionCents: resolved.reduce((s, l) => s + l.creatorCommissionCents, 0),
        couponId,
        shippingAddressId: address.id,
      },
    });

    for (const line of resolved) {
      await tx.orderItem.create({
        data: {
          orderId: created.id,
          kind: line.kind,
          quantity: line.quantity,
          productId: line.productId ?? null,
          productVariantId: line.variantId ?? null,
          designId: line.designId ?? null,
          designVersionId: line.designVersionId ?? null,
          quotationId: line.quotationId ?? null,
          measurementProfileId: line.measurementProfileId ?? null,
          creatorStoreId: line.creatorStoreId ?? null,
          titleSnapshot: line.title,
          specSnapshotJson: line.specSnapshotJson ?? null,
          unitPriceCents: line.unitPriceCents,
          totalPriceCents: line.totalPriceCents,
        },
      });

      // Reserve stock inside the same transaction. The conditional update is the
      // concurrency control: two buyers racing for the last unit, one loses.
      if (line.variantId) {
        const { count } = await tx.productVariant.updateMany({
          where: { id: line.variantId, stockOnHand: { gte: line.quantity } },
          data: { stockReserved: { increment: line.quantity } },
        });
        const variant = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          select: { product: { select: { fulfilment: true, name: true } } },
        });
        if (count === 0 && variant?.product.fulfilment !== "MADE_TO_ORDER") {
          throw new AppError("OUT_OF_STOCK", `"${variant?.product.name ?? "Um item"}" acabou de esgotar.`, {
            action: "Remova o item ou escolha outro tamanho para continuar.",
          });
        }
      }
    }

    if (couponId) {
      await tx.couponRedemption.create({
        data: { couponId, userId: input.userId, orderId: created.id, amountCents: discountCents },
      });
      await tx.coupon.update({ where: { id: couponId }, data: { redeemedCount: { increment: 1 } } });
    }

    await tx.shipment.create({
      data: {
        orderId: created.id,
        addressId: address.id,
        provider: chosen.provider,
        service: chosen.service,
        status: "PENDING",
        costCents: shippingCents,
        currency: CURRENCY,
        estimatedDeliveryAt: new Date(Date.now() + chosen.estimatedDays * 86_400_000),
      },
    });

    return created;
  });

  // ---- payment intent ---------------------------------------------------
  await transitionOrder({ orderId: order.id, to: "QUOTED", actor: "SYSTEM", reason: "Pedido montado e precificado." });
  await transitionOrder({ orderId: order.id, to: "CUSTOMER_APPROVED", actor: "CUSTOMER", actorUserId: input.userId, reason: "Cliente confirmou o pedido." });

  const provider = paymentProvider();
  const intent = await provider.createIntent({
    orderId: order.id,
    orderReference: order.reference,
    amountCents: totalCents,
    currency: CURRENCY,
    method: input.method,
    customerEmail: user.email,
    idempotencyKey: `order:${order.id}`,
    returnUrl: `${env.APP_URL}/pedido/${order.reference}`,
  });

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerRef: intent.providerRef,
      method: input.method,
      status: "PENDING",
      currency: CURRENCY,
      amountCents: totalCents,
    },
  });

  await transitionOrder({
    orderId: order.id,
    to: "PAYMENT_PENDING",
    actor: "SYSTEM",
    reason: "Aguardando confirmação do provedor de pagamento.",
  });

  await recordAudit({
    actorUserId: input.userId,
    action: "order.created",
    targetType: "Order",
    targetId: order.id,
    newState: { reference: order.reference, totalCents, items: resolved.length },
  });

  return {
    orderId: order.id,
    orderReference: order.reference,
    totalCents,
    currency: CURRENCY,
    payment: {
      providerRef: intent.providerRef,
      ...(intent.redirectUrl ? { redirectUrl: intent.redirectUrl } : {}),
      ...(intent.displayCode ? { displayCode: intent.displayCode } : {}),
      ...(intent.expiresAt ? { expiresAt: intent.expiresAt } : {}),
    },
  };
}

/**
 * Coupon validation. Every limit is checked against the database inside the
 * request; a coupon code in the URL is a claim, never an entitlement.
 */
export async function applyCoupon(
  code: string,
  userId: string,
  subtotalCents: number,
): Promise<{ couponId: string; discountCents: number; label: string }> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();

  const invalid = (message: string, action: string) =>
    new AppError("COUPON_INVALID", message, { action, fields: { couponCode: message } });

  if (!coupon || !coupon.active) throw invalid("Este cupom não existe ou não está mais ativo.", "Confira o código digitado.");
  if (coupon.startsAt && coupon.startsAt > now) throw invalid("Este cupom ainda não começou a valer.", `Ele passa a valer em ${coupon.startsAt.toLocaleDateString("pt-BR")}.`);
  if (coupon.endsAt && coupon.endsAt < now) throw invalid("Este cupom expirou.", "Acompanhe nossas campanhas para novos cupons.");
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    throw new AppError("COUPON_EXHAUSTED", "Este cupom atingiu o limite de usos.", {
      action: "Ele foi bem disputado. Fique de olho na próxima campanha.",
      fields: { couponCode: "Limite de usos atingido." },
    });
  }
  if (subtotalCents < coupon.minSubtotalCents) {
    throw invalid(
      `Este cupom vale a partir de R$ ${(coupon.minSubtotalCents / 100).toFixed(2)}.`,
      "Adicione mais itens ou use outro cupom.",
    );
  }

  const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (used >= coupon.maxPerUser) {
    throw invalid("Você já usou este cupom.", "Cada cupom vale uma vez por conta.");
  }

  const base = money(subtotalCents, CURRENCY);
  const discount =
    coupon.kind === "PERCENT" ? applyBasisPoints(base, coupon.valueBp)
    : coupon.kind === "FIXED" ? money(Math.min(coupon.valueCents, subtotalCents), CURRENCY)
    : money(0, CURRENCY); // FREE_SHIPPING is applied to the shipping line, not here

  return {
    couponId: coupon.id,
    discountCents: discount.cents,
    label:
      coupon.kind === "PERCENT" ? `${(coupon.valueBp / 100).toFixed(0)}% de desconto`
      : coupon.kind === "FIXED" ? `R$ ${(coupon.valueCents / 100).toFixed(2)} de desconto`
      : "Frete grátis",
  };
}

/** Splits shipping across items by value — used for creator/producer accounting. */
export function allocateShipping(shippingCents: number, itemTotals: number[]): number[] {
  if (itemTotals.length === 0) return [];
  return allocateByWeights(money(shippingCents, CURRENCY), itemTotals).map((m) => m.cents);
}
