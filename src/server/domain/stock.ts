import { db } from "../db";
import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { log, securityEvent } from "../lib/logger";
import { recordAudit } from "./audit";

/**
 * Reserva de estoque.
 *
 * ---------------------------------------------------------------------------
 * O ataque que este arquivo existe para impedir
 * ---------------------------------------------------------------------------
 * Incrementar `ProductVariant.stockReserved` na criação do pedido, sem nenhuma
 * liberação correspondente, permite esvaziar o catálogo de graça: um script
 * cria pedidos, nunca paga, e cada unidade fica travada para sempre. O estoque
 * some da loja sem uma única venda.
 *
 * A correção tem três partes, e as três precisam existir:
 *
 *   1. Toda reserva é uma LINHA COM PRAZO (`StockReservation`), não um contador
 *      anônimo. Dá para ver o que está preso, por qual pedido e até quando.
 *   2. Um job libera o que venceu e cancela o pedido atrás. Sem isso, o item 1
 *      é só contabilidade bonita de um estoque igualmente travado.
 *   3. A liberação é idempotente — protegida por `status: "HELD"` — porque a
 *      fila entrega ao menos uma vez, e decrementar duas vezes a mesma unidade
 *      criaria estoque do nada.
 *
 * A janela é curta de propósito. Ela custa uma venda ocasional de quem demorou
 * demais no cartão; travar o catálogo custa todas as outras.
 */

/** PIX e cartão confirmam em minutos. Boleto precisa de dias. */
export const RESERVATION_WINDOW_MINUTES = {
  PIX: 30,
  CARD: 60,
  BOLETO: 3 * 24 * 60,
} as const;

export type PaymentMethodForReservation = keyof typeof RESERVATION_WINDOW_MINUTES;

export function reservationDeadline(method: PaymentMethodForReservation, from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_WINDOW_MINUTES[method] * 60_000);
}

export interface ReservationRequest {
  variantId: string;
  quantity: number;
}

/**
 * Segura estoque para um pedido, dentro da transação do checkout.
 *
 * O `updateMany` condicional é o controle de concorrência: dois compradores
 * disputando a última unidade, exatamente um ganha. Uma leitura seguida de
 * escrita não daria essa garantia.
 */
export async function reserveStock(params: {
  tx: Prisma.TransactionClient;
  orderId: string;
  requests: ReservationRequest[];
  expiresAt: Date;
}): Promise<void> {
  for (const request of params.requests) {
    const variant = await params.tx.productVariant.findUnique({
      where: { id: request.variantId },
      select: { id: true, size: true, product: { select: { name: true, fulfilment: true } } },
    });
    if (!variant) throw new AppError("NOT_FOUND", "Peça não encontrada.");

    // Sob medida não tem estoque para segurar: cada peça é cortada depois.
    if (variant.product.fulfilment === "MADE_TO_ORDER") continue;

    const { count } = await params.tx.productVariant.updateMany({
      where: {
        id: request.variantId,
        // A condição É a garantia: só reserva se ainda houver o suficiente.
        stockOnHand: { gte: request.quantity },
        stockReserved: { lte: 999_999 },
      },
      data: { stockReserved: { increment: request.quantity } },
    });

    if (count === 0) {
      throw new AppError("OUT_OF_STOCK", `"${variant.product.name}" (${variant.size}) acabou de esgotar.`, {
        action: "Remova o item ou escolha outro tamanho para continuar.",
      });
    }

    // Confere a invariante depois do incremento. Sem isto, duas transações
    // concorrentes poderiam somar reservas acima do que existe fisicamente.
    const after = await params.tx.productVariant.findUniqueOrThrow({
      where: { id: request.variantId },
      select: { stockOnHand: true, stockReserved: true },
    });
    if (after.stockReserved > after.stockOnHand) {
      throw new AppError("OUT_OF_STOCK", `"${variant.product.name}" (${variant.size}) acabou de esgotar.`, {
        action: "Outra pessoa finalizou primeiro. Escolha outro tamanho ou peça sob medida.",
      });
    }

    await params.tx.stockReservation.create({
      data: {
        orderId: params.orderId,
        productVariantId: request.variantId,
        quantity: request.quantity,
        status: "HELD",
        expiresAt: params.expiresAt,
      },
    });
  }
}

/**
 * Converte reservas em venda quando o pagamento é confirmado.
 *
 * O estoque físico cai e a reserva deixa de existir — as duas coisas juntas,
 * senão a unidade some duas vezes ou nenhuma.
 */
export async function consumeReservations(orderId: string): Promise<number> {
  const held = await db.stockReservation.findMany({
    where: { orderId, status: "HELD" },
    select: { id: true, productVariantId: true, quantity: true },
  });
  if (held.length === 0) return 0;

  for (const reservation of held) {
    await db.$transaction([
      // Guarda em HELD: reprocessar o mesmo webhook não consome duas vezes.
      db.stockReservation.updateMany({
        where: { id: reservation.id, status: "HELD" },
        data: { status: "CONSUMED" },
      }),
      db.productVariant.update({
        where: { id: reservation.productVariantId },
        data: {
          stockOnHand: { decrement: reservation.quantity },
          stockReserved: { decrement: reservation.quantity },
        },
      }),
    ]);
  }

  await db.order.update({ where: { id: orderId }, data: { reservationExpiresAt: null } });
  log.info("stock.reservations_consumed", { orderId, count: held.length });
  return held.length;
}

/**
 * Devolve o estoque de um pedido que não vai acontecer.
 *
 * Idempotente por construção: o `updateMany` filtra por `status: "HELD"` e
 * `count` diz se ESTA chamada foi a que liberou. Sem essa guarda, uma segunda
 * execução da fila criaria estoque do nada.
 */
export async function releaseReservations(orderId: string, reason: string): Promise<number> {
  const held = await db.stockReservation.findMany({
    where: { orderId, status: "HELD" },
    select: { id: true, productVariantId: true, quantity: true },
  });
  if (held.length === 0) return 0;

  let released = 0;
  for (const reservation of held) {
    const { count } = await db.stockReservation.updateMany({
      where: { id: reservation.id, status: "HELD" },
      data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason.slice(0, 200) },
    });
    // Só devolve ao estoque se esta chamada realmente venceu a corrida.
    if (count === 1) {
      await db.productVariant.update({
        where: { id: reservation.productVariantId },
        data: { stockReserved: { decrement: reservation.quantity } },
      });
      released += 1;
    }
  }

  if (released > 0) {
    log.info("stock.reservations_released", { orderId, released, reason });
    await recordAudit({
      action: "stock.reservations_released",
      targetType: "Order",
      targetId: orderId,
      newState: { released },
      reason,
    });
  }
  return released;
}

export interface SweepResult {
  ordersCancelled: number;
  reservationsReleased: number;
  unitsReturned: number;
}

/**
 * Varre reservas vencidas: libera o estoque e cancela o pedido por trás.
 *
 * Este é o job sem o qual todo o resto é decorativo. Roda a cada poucos minutos.
 */
export async function releaseExpiredReservations(limit = 200): Promise<SweepResult> {
  const now = new Date();

  const expired = await db.stockReservation.findMany({
    where: { status: "HELD", expiresAt: { lt: now } },
    take: limit,
    select: { orderId: true, quantity: true },
  });
  if (expired.length === 0) return { ordersCancelled: 0, reservationsReleased: 0, unitsReturned: 0 };

  const orderIds = [...new Set(expired.map((r) => r.orderId))];
  const result: SweepResult = { ordersCancelled: 0, reservationsReleased: 0, unitsReturned: 0 };

  const { transitionOrder } = await import("./orders");

  for (const orderId of orderIds) {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, reference: true, userId: true, payments: { select: { status: true } } },
    });
    if (!order) continue;

    // Se o pagamento entrou entre a varredura e agora, o pedido é legítimo:
    // consome a reserva em vez de liberar. A janela é pequena mas existe.
    const settled = order.payments.some((p) => p.status === "CAPTURED" || p.status === "AUTHORIZED");
    if (settled || order.status === "PAID" || order.status === "PRODUCER_PENDING") {
      await consumeReservations(orderId);
      continue;
    }

    const units = expired.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.quantity, 0);
    const released = await releaseReservations(
      orderId,
      "Prazo de pagamento expirado — estoque devolvido ao catálogo.",
    );
    result.reservationsReleased += released;
    result.unitsReturned += units;

    if (order.status === "PAYMENT_PENDING" || order.status === "CUSTOMER_APPROVED") {
      await transitionOrder({
        orderId,
        to: "CANCELLED",
        actor: "SYSTEM",
        reason:
          "O prazo para o pagamento acabou e as peças voltaram para o catálogo. Você pode refazer o pedido a qualquer momento.",
      }).catch((error) => log.warn("stock.cancel_skipped", { orderId, error }));
      result.ordersCancelled += 1;
    }
  }

  if (result.reservationsReleased > 0) {
    log.info("stock.expired_sweep", { ...result });
  }
  return result;
}

/**
 * Detecta o padrão de abuso: muitos pedidos criados e nenhum pago.
 *
 * Liberar o estoque conserta o sintoma. Isto registra a causa, para que a
 * operação possa agir sobre a conta antes de virar rotina.
 */
export async function detectReservationAbuse(windowHours = 24, threshold = 5): Promise<number> {
  const since = new Date(Date.now() - windowHours * 3_600_000);

  const abandoned = await db.order.groupBy({
    by: ["userId"],
    where: {
      createdAt: { gte: since },
      status: "CANCELLED",
      cancelReason: { contains: "prazo para o pagamento" },
    },
    _count: { _all: true },
  });

  let flagged = 0;
  for (const row of abandoned) {
    if (row._count._all < threshold) continue;

    const existing = await db.fraudSignal.findFirst({
      where: { userId: row.userId, kind: "VELOCITY", createdAt: { gte: since } },
      select: { id: true },
    });
    if (existing) continue; // um sinal por janela, não um por varredura

    await db.fraudSignal.create({
      data: {
        userId: row.userId,
        kind: "VELOCITY",
        score: Math.min(100, 40 + row._count._all * 5),
        detail: `${row._count._all} pedidos criados e abandonados sem pagamento em ${windowHours}h. Possível tentativa de travar estoque.`,
        action: row._count._all >= threshold * 2 ? "CHALLENGED" : "LOGGED",
      },
    });
    securityEvent("fraud.signal", {
      userId: row.userId,
      kind: "reservation_abuse",
      abandonedOrders: row._count._all,
    });
    flagged += 1;
  }

  return flagged;
}

/** Visão para o admin: o que está preso agora e por quê. */
export async function heldStockSummary(): Promise<{
  totalUnitsHeld: number;
  reservations: number;
  expiringSoon: number;
  overdue: number;
}> {
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60_000);

  const [aggregate, expiringSoon, overdue] = await Promise.all([
    db.stockReservation.aggregate({ where: { status: "HELD" }, _sum: { quantity: true }, _count: { _all: true } }),
    db.stockReservation.count({ where: { status: "HELD", expiresAt: { gte: now, lt: soon } } }),
    db.stockReservation.count({ where: { status: "HELD", expiresAt: { lt: now } } }),
  ]);

  return {
    totalUnitsHeld: aggregate._sum.quantity ?? 0,
    reservations: aggregate._count._all,
    expiringSoon,
    overdue,
  };
}
