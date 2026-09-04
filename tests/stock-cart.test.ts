import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { publicReference, hashPassword } from "@/server/lib/crypto";
import {
  reserveStock, consumeReservations, releaseReservations,
  releaseExpiredReservations, reservationDeadline, detectReservationAbuse,
  heldStockSummary, RESERVATION_WINDOW_MINUTES,
} from "@/server/domain/stock";
import {
  addToCart, updateCartLine, removeCartLine, getCartView, sweepExpiredCarts,
  peekCartCount, closeCart, MAX_LINE_QUANTITY,
} from "@/server/domain/cart";
import { AppError } from "@/server/lib/errors";

/**
 * O estoque é onde um erro custa dinheiro real e silenciosamente.
 *
 * Estes testes fixam as três garantias que o desenho depende:
 *   · Reserva sempre tem prazo e sempre volta.
 *   · Liberar duas vezes não cria estoque do nada.
 *   · A sacola não segura absolutamente nada.
 */

let userId: string;
let variantId: string;
let madeToOrderVariantId: string;
let cartId: string;

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
  const hash = await hashPassword("uma senha bem longa para o teste");
  const user = await db.user.create({
    data: { email: "estoque@test.local", displayName: "Estoque", passwordHash: hash, roles: "CUSTOMER" },
  });
  userId = user.id;

  const stocked = await db.product.create({
    data: {
      slug: "camiseta-estoque", name: "Camiseta Estoque", description: "x",
      category: "TOPS", garmentType: "Camiseta", basePriceCents: 10_000,
      fulfilment: "STOCKED", published: true,
    },
  });
  const variant = await db.productVariant.create({
    data: { productId: stocked.id, sku: "EST-M", size: "M", colorway: "Preto", stockOnHand: 5 },
  });
  variantId = variant.id;

  const custom = await db.product.create({
    data: {
      slug: "jaqueta-sob-medida", name: "Jaqueta Sob Medida", description: "x",
      category: "OUTERWEAR", garmentType: "Jaqueta", basePriceCents: 50_000,
      fulfilment: "MADE_TO_ORDER", published: true,
    },
  });
  const customVariant = await db.productVariant.create({
    data: { productId: custom.id, sku: "SOB-M", size: "M", colorway: "Preto", stockOnHand: 0 },
  });
  madeToOrderVariantId = customVariant.id;

  const cart = await db.cart.create({
    data: { userId, currency: "BRL", expiresAt: new Date(Date.now() + 86_400_000) },
  });
  cartId = cart.id;
});

async function makeOrder(status = "PAYMENT_PENDING"): Promise<string> {
  const order = await db.order.create({
    data: { reference: publicReference("KJ"), userId, status, currency: "BRL", totalCents: 10_000 },
  });
  return order.id;
}

const stockOf = async (id: string) =>
  db.productVariant.findUniqueOrThrow({
    where: { id },
    select: { stockOnHand: true, stockReserved: true },
  });

// ========================================================== reserva ==========

describe("reserva de estoque", () => {
  it("segura unidades e registra o prazo", async () => {
    const orderId = await makeOrder();
    const expiresAt = reservationDeadline("PIX");

    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 2 }], expiresAt });
    });

    expect(await stockOf(variantId)).toEqual({ stockOnHand: 5, stockReserved: 2 });
    const reservation = await db.stockReservation.findFirstOrThrow({ where: { orderId } });
    expect(reservation.status).toBe("HELD");
    expect(reservation.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("não segura nada para peça sob medida — não há estoque a segurar", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({
        tx, orderId,
        requests: [{ variantId: madeToOrderVariantId, quantity: 3 }],
        expiresAt: reservationDeadline("PIX"),
      });
    });
    expect(await db.stockReservation.count({ where: { orderId } })).toBe(0);
    expect((await stockOf(madeToOrderVariantId)).stockReserved).toBe(0);
  });

  it("recusa quando não há unidades suficientes", async () => {
    const orderId = await makeOrder();
    await expect(
      db.$transaction(async (tx) => {
        await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 99 }], expiresAt: reservationDeadline("PIX") });
      }),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });

    // Nada foi segurado na tentativa falha.
    expect((await stockOf(variantId)).stockReserved).toBe(0);
  });

  it("dá janela mais longa ao boleto do que ao PIX", () => {
    expect(RESERVATION_WINDOW_MINUTES.BOLETO).toBeGreaterThan(RESERVATION_WINDOW_MINUTES.PIX);
    expect(reservationDeadline("BOLETO").getTime()).toBeGreaterThan(reservationDeadline("PIX").getTime());
  });
});

// ========================================================== consumo ==========

describe("consumo da reserva", () => {
  it("converte reserva em venda: baixa o físico e solta o preso", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 2 }], expiresAt: reservationDeadline("PIX") });
    });

    await consumeReservations(orderId);

    expect(await stockOf(variantId)).toEqual({ stockOnHand: 3, stockReserved: 0 });
    const reservation = await db.stockReservation.findFirstOrThrow({ where: { orderId } });
    expect(reservation.status).toBe("CONSUMED");
  });

  it("é idempotente — reprocessar o mesmo webhook não baixa duas vezes", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 2 }], expiresAt: reservationDeadline("PIX") });
    });

    expect(await consumeReservations(orderId)).toBe(1);
    expect(await consumeReservations(orderId)).toBe(0);

    expect(await stockOf(variantId)).toEqual({ stockOnHand: 3, stockReserved: 0 });
  });
});

// ======================================================== liberação ==========

describe("liberação da reserva", () => {
  it("devolve as unidades ao catálogo", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 3 }], expiresAt: reservationDeadline("PIX") });
    });
    expect((await stockOf(variantId)).stockReserved).toBe(3);

    await releaseReservations(orderId, "teste");

    expect(await stockOf(variantId)).toEqual({ stockOnHand: 5, stockReserved: 0 });
  });

  it("liberar duas vezes NÃO cria estoque do nada", async () => {
    // A fila entrega ao menos uma vez. Sem a guarda em HELD, a segunda execução
    // decrementaria de novo e o catálogo passaria a ter unidades inexistentes.
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 3 }], expiresAt: reservationDeadline("PIX") });
    });

    expect(await releaseReservations(orderId, "primeira")).toBe(1);
    expect(await releaseReservations(orderId, "segunda")).toBe(0);

    expect((await stockOf(variantId)).stockReserved).toBe(0);
  });

  it("libera em corrida sem contar duas vezes", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 2 }], expiresAt: reservationDeadline("PIX") });
    });

    const results = await Promise.all([
      releaseReservations(orderId, "a"),
      releaseReservations(orderId, "b"),
    ]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect((await stockOf(variantId)).stockReserved).toBe(0);
  });
});

// ==================================================== varredura ==============

describe("varredura de reservas vencidas", () => {
  async function expiredOrder(quantity: number, status = "PAYMENT_PENDING"): Promise<string> {
    const orderId = await makeOrder(status);
    await db.$transaction(async (tx) => {
      await reserveStock({
        tx, orderId, requests: [{ variantId, quantity }],
        expiresAt: new Date(Date.now() - 60_000), // já vencida
      });
    });
    return orderId;
  }

  it("devolve o estoque e cancela o pedido não pago", async () => {
    const orderId = await expiredOrder(3);
    expect((await stockOf(variantId)).stockReserved).toBe(3);

    const result = await releaseExpiredReservations();

    expect(result.reservationsReleased).toBe(1);
    expect(result.unitsReturned).toBe(3);
    expect(result.ordersCancelled).toBe(1);
    expect((await stockOf(variantId)).stockReserved).toBe(0);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CANCELLED");
    // O motivo é escrito para o cliente, não para o log.
    expect(order.cancelReason).toMatch(/prazo|pagamento/i);
  });

  it("NÃO libera reserva de pedido que foi pago na janela da corrida", async () => {
    const orderId = await expiredOrder(2);
    // O pagamento entra entre a leitura e a varredura.
    await db.payment.create({
      data: {
        orderId, provider: "mock", providerRef: `ref-${Date.now()}`, method: "PIX",
        status: "CAPTURED", currency: "BRL", amountCents: 10_000,
      },
    });

    await releaseExpiredReservations();

    // Consumida, não liberada: a venda é legítima.
    const reservation = await db.stockReservation.findFirstOrThrow({ where: { orderId } });
    expect(reservation.status).toBe("CONSUMED");
    expect(await stockOf(variantId)).toEqual({ stockOnHand: 3, stockReserved: 0 });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).not.toBe("CANCELLED");
  });

  it("não toca em reserva que ainda está no prazo", async () => {
    const orderId = await makeOrder();
    await db.$transaction(async (tx) => {
      await reserveStock({ tx, orderId, requests: [{ variantId, quantity: 2 }], expiresAt: reservationDeadline("PIX") });
    });

    const result = await releaseExpiredReservations();
    expect(result.reservationsReleased).toBe(0);
    expect((await stockOf(variantId)).stockReserved).toBe(2);
  });

  it("fecha o ataque completo: N pedidos abandonados devolvem TODO o estoque", async () => {
    // O cenário exato que motivou este desenho — um script cria pedidos e some.
    for (let i = 0; i < 5; i += 1) await expiredOrder(1);
    expect((await stockOf(variantId)).stockReserved).toBe(5);
    // Catálogo aparentemente esgotado.
    const before = await stockOf(variantId);
    expect(before.stockOnHand - before.stockReserved).toBe(0);

    await releaseExpiredReservations();

    const after = await stockOf(variantId);
    expect(after.stockReserved).toBe(0);
    // Cinco unidades disponíveis de novo, sem nenhuma venda ter acontecido.
    expect(after.stockOnHand - after.stockReserved).toBe(5);
  });

  it("sinaliza a conta que abandona pedidos em massa", async () => {
    // O padrão real do ataque ao longo de um dia: cria, abandona, o estoque
    // volta pela varredura, e o script repete. Cada ciclo é legítimo em
    // isolamento; é a repetição que denuncia.
    for (let i = 0; i < 6; i += 1) {
      await expiredOrder(1);
      await releaseExpiredReservations();
    }

    const flagged = await detectReservationAbuse(24, 5);
    expect(flagged).toBe(1);

    const signal = await db.fraudSignal.findFirstOrThrow({ where: { userId, kind: "VELOCITY" } });
    expect(signal.detail).toMatch(/abandonados/i);

    // Um sinal por janela, não um por varredura.
    expect(await detectReservationAbuse(24, 5)).toBe(0);
  });

  it("expõe ao admin o que está preso agora", async () => {
    await expiredOrder(2);
    const summary = await heldStockSummary();
    expect(summary.totalUnitsHeld).toBe(2);
    expect(summary.overdue).toBe(1);
  });
});

// ============================================================ sacola =========

describe("sacola", () => {
  it("NÃO reserva estoque — a garantia central do desenho", async () => {
    await addToCart({ cartId, variantId, quantity: 3 });
    // Nada preso. A sacola é rascunho, não compromisso.
    expect(await stockOf(variantId)).toEqual({ stockOnHand: 5, stockReserved: 0 });
    expect(await db.stockReservation.count()).toBe(0);
  });

  it("soma quantidade em vez de duplicar a linha", async () => {
    await addToCart({ cartId, variantId, quantity: 2 });
    await addToCart({ cartId, variantId, quantity: 1 });

    const lines = await db.cartItem.findMany({ where: { cartId } });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
  });

  it("recusa mais unidades do que existem", async () => {
    await expect(addToCart({ cartId, variantId, quantity: 99 })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("aceita qualquer quantidade de peça sob medida — nada é tirado de estoque", async () => {
    const result = await addToCart({ cartId, variantId: madeToOrderVariantId, quantity: 4 });
    expect(result.quantity).toBe(4);
  });

  it("limita a quantidade por linha", async () => {
    await db.productVariant.update({ where: { id: madeToOrderVariantId }, data: { stockOnHand: 0 } });
    const result = await addToCart({ cartId, variantId: madeToOrderVariantId, quantity: 999 });
    expect(result.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("remove a linha quando a quantidade vai a zero", async () => {
    const { lineId } = await addToCart({ cartId, variantId, quantity: 2 });
    await updateCartLine({ cartId, lineId, quantity: 0 });
    expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
  });

  it("não deixa mexer na linha de outra sacola", async () => {
    const other = await db.cart.create({
      data: { currency: "BRL", anonKeyHash: `outro-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const { lineId } = await addToCart({ cartId, variantId, quantity: 1 });

    await expect(updateCartLine({ cartId: other.id, lineId, quantity: 5 })).rejects.toThrow(AppError);
    await expect(removeCartLine({ cartId: other.id, lineId })).rejects.toThrow(AppError);
  });

  it("mostra preço ao vivo e avisa quando ele mudou", async () => {
    await addToCart({ cartId, variantId, quantity: 1 });
    // O preço sobe enquanto a sacola está aberta.
    await db.productVariant.update({ where: { id: variantId }, data: { priceDeltaCents: 5_000 } });

    const view = await getCartView(cartId);
    expect(view.lines[0]!.unitPriceCents).toBe(15_000);
    expect(view.lines[0]!.priceChangedFromCents).toBe(10_000);
    expect(view.notices.some((n) => n.code === "PRICE_CHANGED")).toBe(true);
  });

  it("avisa quando a peça esgotou enquanto a sacola estava aberta", async () => {
    await addToCart({ cartId, variantId, quantity: 3 });
    await db.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 1 } });

    const view = await getCartView(cartId);
    expect(view.lines[0]!.availabilityWarning).toMatch(/Restam 1/);
  });

  it("remove sozinha a peça que saiu do catálogo", async () => {
    await addToCart({ cartId, variantId, quantity: 1 });
    await db.productVariant.update({ where: { id: variantId }, data: { active: false } });

    const view = await getCartView(cartId);
    expect(view.lines).toHaveLength(0);
    expect(view.notices.some((n) => n.code === "ITEM_UNAVAILABLE")).toBe(true);
    // Removida de verdade, não só escondida.
    expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
  });

  it("varre sacolas vencidas", async () => {
    await addToCart({ cartId, variantId, quantity: 1 });
    await db.cart.update({ where: { id: cartId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await sweepExpiredCarts()).toBe(1);
    expect(await db.cartItem.count({ where: { cartId } })).toBe(0);
    // Varrer a sacola não devolve estoque nenhum, porque ela não segurava nada.
    expect((await stockOf(variantId)).stockReserved).toBe(0);
  });
});

// ============================================ contador do cabeçalho ==========

/**
 * O contador aparece em TODA página. Se ele criasse a sacola, abrir a home
 * geraria uma linha no banco por visitante — e um cookie por visitante que
 * nunca pediu nada.
 */
describe("contador da sacola no cabeçalho", () => {
  it("conta as unidades, não as linhas", async () => {
    await addToCart({ cartId, variantId, quantity: 3 });
    await addToCart({ cartId, variantId: madeToOrderVariantId, quantity: 2 });
    expect(await peekCartCount(userId)).toBe(5);
  });

  it("não cria sacola nenhuma para quem ainda não tem", async () => {
    const outro = await db.user.create({
      data: {
        email: `sem-sacola-${Date.now()}@kaiju.local`,
        passwordHash: await hashPassword("kaiju-desenvolvimento-2026"),
        displayName: "Sem Sacola",
      },
    });
    const antes = await db.cart.count();

    expect(await peekCartCount(outro.id)).toBe(0);
    expect(await db.cart.count(), "olhar o contador criou uma sacola").toBe(antes);
  });

  it("ignora sacola já fechada — a que virou pedido não conta mais", async () => {
    await addToCart({ cartId, variantId, quantity: 2 });
    expect(await peekCartCount(userId)).toBe(2);

    await closeCart(cartId);
    expect(await peekCartCount(userId)).toBe(0);
    // Fechar preserva as linhas para auditoria; não é o mesmo que apagar.
    expect(await db.cartItem.count({ where: { cartId } })).toBe(1);
  });

  it("ignora sacola vencida", async () => {
    await addToCart({ cartId, variantId, quantity: 1 });
    await db.cart.update({ where: { id: cartId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await peekCartCount(userId)).toBe(0);
  });
});
