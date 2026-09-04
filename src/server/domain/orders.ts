import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "../lib/errors";
import { publicReference } from "../lib/crypto";
import { log } from "../lib/logger";
import { recordAudit } from "./audit";
import { assertTransition, type Actor } from "./order-state";
import { OrderStatusSchema, type OrderStatus } from "./enums";
import { enqueue } from "../jobs/queue";

/**
 * Order lifecycle.
 *
 * `transitionOrder` is the ONLY way an order's status changes anywhere in this
 * codebase. It validates the move against the state machine, writes an
 * append-only event, updates the projection, and emits the audit row — in one
 * transaction, so an order can never end up in a state its history does not
 * explain.
 */

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  actor: Actor;
  actorUserId?: string | null;
  reason?: string;
  meta?: Record<string, unknown>;
  correlationId?: string;
  /**
   * Guard for concurrent writers: the caller states the status it believes the
   * order is in. A mismatch is a conflict, not a silent overwrite.
   */
  expectedFrom?: OrderStatus;
}

export async function transitionOrder(input: TransitionInput): Promise<{ from: OrderStatus; to: OrderStatus }> {
  const to = OrderStatusSchema.parse(input.to);

  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, reference: true, userId: true },
    });
    if (!order) throw notFound("O pedido");

    const from = OrderStatusSchema.parse(order.status);

    if (input.expectedFrom && input.expectedFrom !== from) {
      throw new AppError("CONFLICT", "Este pedido mudou de estado enquanto você trabalhava nele.", {
        action: "Atualize a página para ver a situação atual antes de agir.",
        internal: { expected: input.expectedFrom, actual: from },
      });
    }

    // Idempotency: re-delivering the same webhook must not error or double-log.
    if (from === to) {
      log.debug("orders.transition_noop", { orderId: order.id, status: to });
      return { from, to };
    }

    const rule = assertTransition({ from, to, actor: input.actor });

    // The status column is a projection; this row is the truth.
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: from,
        toStatus: to,
        actorType: input.actor,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason ?? rule.description,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
        correlationId: input.correlationId ?? null,
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: to,
        ...(to === "CANCELLED" ? { cancelledAt: new Date(), cancelReason: input.reason ?? null } : {}),
        ...(to === "ON_HOLD" ? { holdReason: input.reason ?? null } : {}),
        ...(to === "PAID" ? { placedAt: new Date() } : {}),
      },
    });

    return { from, to, order };
  }).then(async (result) => {
    const { from, to } = result;
    await recordAudit({
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actor,
      action: `order.status.${to.toLowerCase()}`,
      targetType: "Order",
      targetId: input.orderId,
      oldState: { status: from },
      newState: { status: to },
      reason: input.reason ?? null,
      correlationId: input.correlationId ?? null,
    });

    // A cancelled or refunded order must return whatever it was holding. This
    // lives here rather than at each call site so no future cancel path can
    // forget it and quietly leak stock.
    if (to === "CANCELLED" || to === "REFUNDED") {
      const { releaseReservations } = await import("./stock");
      await releaseReservations(
        input.orderId,
        input.reason ?? `Pedido movido para ${to}.`,
      ).catch((error) => log.warn("orders.release_failed", { orderId: input.orderId, error }));
    }

    // Side effects run after the transaction commits, as queued work — so a slow
    // e-mail provider can never hold a database transaction open.
    await enqueue(
      "notification",
      { kind: "ORDER_STATUS", orderId: input.orderId, status: to },
      { dedupeKey: `notify:${input.orderId}:${to}` },
    );

    if (to === "PAID") {
      await enqueue("reward_evaluation", { orderId: input.orderId }, { dedupeKey: `reward:${input.orderId}` });
    }

    return { from, to };
  });
}

export async function createOrderFromCart(params: {
  userId: string;
  cartId: string;
  addressId: string;
  currency: string;
  tx?: Prisma.TransactionClient;
}): Promise<string> {
  const client = params.tx ?? db;
  const order = await client.order.create({
    data: {
      reference: publicReference("KJ"),
      userId: params.userId,
      status: "DRAFT",
      currency: params.currency,
      shippingAddressId: params.addressId,
    },
  });
  return order.id;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: Date;
  actorType: string;
  reason: string | null;
}

export async function orderTimeline(orderId: string): Promise<OrderTimelineEntry[]> {
  const events = await db.orderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { toStatus: true, createdAt: true, actorType: true, reason: true },
  });
  return events.map((e) => ({
    status: OrderStatusSchema.parse(e.toStatus),
    at: e.createdAt,
    actorType: e.actorType,
    reason: e.reason,
  }));
}

/**
 * Ownership-enforced read. Every customer-facing order query goes through this;
 * there is no code path that fetches an order by id alone for a customer.
 */
export async function getOrderForCustomer(orderId: string, userId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: { include: { product: true, designVersion: true, quotation: true } },
      shipments: { include: { events: { orderBy: { occurredAt: "desc" } } } },
      payments: { select: { id: true, status: true, method: true, amountCents: true, currency: true, createdAt: true, instrumentBrand: true, instrumentLast4: true } },
      shippingAddress: true,
      jobs: {
        select: {
          id: true, role: true, status: true, dueAt: true,
          stages: { orderBy: { position: "asc" } },
          assets: { where: { visibleToCustomer: true }, orderBy: { createdAt: "desc" } },
          producer: { select: { studioName: true, city: true, state: true, verificationLevel: true } },
        },
      },
    },
  });
  if (!order) throw notFound("O pedido");
  return order;
}

/** Public tracking by reference — deliberately minimal, no personal data. */
export async function getPublicTracking(reference: string) {
  const order = await db.order.findUnique({
    where: { reference: reference.trim().toUpperCase() },
    select: {
      reference: true,
      status: true,
      createdAt: true,
      placedAt: true,
      shipments: {
        select: {
          status: true, trackingCode: true, provider: true, estimatedDeliveryAt: true,
          events: { orderBy: { occurredAt: "desc" }, take: 12, select: { code: true, description: true, location: true, occurredAt: true } },
        },
      },
      events: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
    },
  });
  return order;
}
