import { cookies } from "next/headers";
import { db } from "../db";
import { AppError, notFound } from "../lib/errors";
import { log } from "../lib/logger";
import { randomToken, hashToken } from "../lib/crypto";
import { money, applyBasisPoints, type CurrencyCode } from "../lib/money";
import { env } from "../lib/env";

/**
 * A sacola.
 *
 * A decisão central deste arquivo, e o motivo de ele existir separado do
 * checkout: **a sacola não reserva estoque.** Nada. Nem por um segundo.
 *
 * Reservar no "adicionar à sacola" parece atencioso e é exatamente o vetor que
 * permite esvaziar um catálogo de graça: um script adiciona todo o estoque à
 * sacola e nunca compra. Aqui a disponibilidade é sempre lida ao vivo, e a
 * reserva só acontece no checkout, por uma janela curta, com prazo de validade
 * (ver StockReservation e releaseExpiredReservations).
 *
 * A sacola também expira. Uma sacola abandonada não fica pendurada para sempre
 * segurando um preço antigo — ela é varrida, e a pessoa vê o preço de hoje.
 */

const CART_COOKIE = "kaiju_cart";
const SECURE_CART_COOKIE = "__Host-kaiju_cart";

/** Sacola de quem está logado dura mais: há uma conta para voltar. */
const TTL_DAYS_AUTHENTICATED = 14;
/** Visitante anônimo: curto, porque é a via barata de abuso. */
const TTL_DAYS_ANONYMOUS = 3;

export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 20;

const isSecureOrigin = env.APP_URL.startsWith("https://");
const cartCookieName = (): string => (isSecureOrigin ? SECURE_CART_COOKIE : CART_COOKIE);

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  colorway: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  currency: CurrencyCode;
  madeToOrder: boolean;
  /** Categoria do produto. O checkout usa para estimar peso de frete. */
  category: string;
  /** Quantas unidades existem AGORA. Lido ao vivo, nunca reservado. */
  availableNow: number;
  /** Preencher quando a quantidade na sacola passou do que existe. */
  availabilityWarning?: string;
  /** Preencher quando o preço mudou desde que a peça entrou na sacola. */
  priceChangedFromCents?: number;
  addedAt: Date;
}

export interface CartView {
  id: string;
  lines: CartLine[];
  subtotalCents: number;
  currency: CurrencyCode;
  itemCount: number;
  expiresAt: Date;
  /** Avisos no nível da sacola: item esgotado, preço alterado, sacola perto de expirar. */
  notices: { code: string; message: string; action: string }[];
}

const CURRENCY: CurrencyCode = "BRL";

function ttlFor(userId: string | null): Date {
  const days = userId ? TTL_DAYS_AUTHENTICATED : TTL_DAYS_ANONYMOUS;
  return new Date(Date.now() + days * 86_400_000);
}

/**
 * Resolve a sacola atual, criando uma se necessário.
 *
 * Quem entra na conta com uma sacola anônima aberta tem as duas fundidas — em
 * vez de perder o que já tinha escolhido, que é a forma mais rápida de perder
 * uma venda que já estava ganha.
 */
export async function resolveCart(userId: string | null): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(cartCookieName())?.value;
  const anonKeyHash = raw ? hashToken(raw) : null;

  const now = new Date();

  if (userId) {
    const existing = await db.cart.findFirst({
      where: { userId, closedAt: null, expiresAt: { gt: now } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const anonymous = anonKeyHash
      ? await db.cart.findFirst({
          where: { anonKeyHash, closedAt: null, userId: null, expiresAt: { gt: now } },
          include: { items: true },
        })
      : null;

    if (existing) {
      if (anonymous && anonymous.items.length > 0) {
        await mergeCarts(anonymous.id, existing.id);
      }
      await db.cart.update({ where: { id: existing.id }, data: { expiresAt: ttlFor(userId) } });
      return existing.id;
    }

    if (anonymous) {
      // Adota a sacola anônima em vez de descartá-la.
      await db.cart.update({
        where: { id: anonymous.id },
        data: { userId, anonKeyHash: null, expiresAt: ttlFor(userId) },
      });
      return anonymous.id;
    }

    const created = await db.cart.create({
      data: { userId, currency: CURRENCY, expiresAt: ttlFor(userId) },
    });
    return created.id;
  }

  if (anonKeyHash) {
    const existing = await db.cart.findFirst({
      where: { anonKeyHash, closedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (existing) {
      await db.cart.update({ where: { id: existing.id }, data: { expiresAt: ttlFor(null) } });
      return existing.id;
    }
  }

  // Cookie novo e opaco. Nada sobre a pessoa, só um identificador aleatório.
  const token = randomToken(24);
  const created = await db.cart.create({
    data: { anonKeyHash: hashToken(token), currency: CURRENCY, expiresAt: ttlFor(null) },
  });
  jar.set(cartCookieName(), token, {
    httpOnly: true,
    secure: isSecureOrigin,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_DAYS_ANONYMOUS * 86_400,
  });
  return created.id;
}

/** Funde a sacola de origem na de destino, somando quantidades sem duplicar linha. */
async function mergeCarts(sourceCartId: string, targetCartId: string): Promise<void> {
  const sourceItems = await db.cartItem.findMany({ where: { cartId: sourceCartId } });
  for (const item of sourceItems) {
    if (!item.productVariantId) continue;
    const existing = await db.cartItem.findFirst({
      where: { cartId: targetCartId, productVariantId: item.productVariantId },
    });
    if (existing) {
      await db.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(MAX_LINE_QUANTITY, existing.quantity + item.quantity) },
      });
    } else {
      const lineCount = await db.cartItem.count({ where: { cartId: targetCartId } });
      if (lineCount >= MAX_CART_LINES) break;
      await db.cartItem.create({
        data: {
          cartId: targetCartId,
          kind: item.kind,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          displayUnitPriceCents: item.displayUnitPriceCents,
        },
      });
    }
  }
  await db.cart.update({ where: { id: sourceCartId }, data: { closedAt: new Date() } });
  log.info("cart.merged", { sourceCartId, targetCartId, items: sourceItems.length });
}

/**
 * Adiciona uma peça.
 *
 * Não toca em estoque. A verificação de disponibilidade aqui é informativa: ela
 * evita que alguém adicione 10 unidades de algo que tem 2, mas não segura nada.
 * A garantia real acontece na transação do checkout.
 */
export async function addToCart(params: {
  cartId: string;
  variantId: string;
  quantity: number;
}): Promise<{ lineId: string; quantity: number }> {
  const quantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.trunc(params.quantity)));

  const variant = await db.productVariant.findFirst({
    where: { id: params.variantId, active: true, product: { published: true, deletedAt: null } },
    include: { product: { select: { fulfilment: true, name: true, basePriceCents: true } } },
  });
  if (!variant) throw notFound("Esta peça");

  const madeToOrder = variant.product.fulfilment === "MADE_TO_ORDER";
  const available = variant.stockOnHand - variant.stockReserved;

  if (!madeToOrder && available <= 0) {
    throw new AppError("OUT_OF_STOCK", `"${variant.product.name}" (${variant.size}) está esgotado.`, {
      action: "Escolha outro tamanho, ou peça esta peça sob medida nas suas medidas.",
    });
  }

  const existing = await db.cartItem.findFirst({
    where: { cartId: params.cartId, productVariantId: params.variantId },
  });

  const unitPriceCents = variant.product.basePriceCents + variant.priceDeltaCents;

  if (existing) {
    const nextQuantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + quantity);
    if (!madeToOrder && nextQuantity > available) {
      throw new AppError(
        "OUT_OF_STOCK",
        `Só temos ${available} unidade(s) de "${variant.product.name}" (${variant.size}).`,
        { action: "Ajuste a quantidade na sacola, ou peça a peça sob medida." },
      );
    }
    const updated = await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity, displayUnitPriceCents: unitPriceCents },
    });
    await touchCart(params.cartId);
    return { lineId: updated.id, quantity: updated.quantity };
  }

  const lineCount = await db.cartItem.count({ where: { cartId: params.cartId } });
  if (lineCount >= MAX_CART_LINES) {
    throw new AppError("PRECONDITION_FAILED", `A sacola comporta até ${MAX_CART_LINES} peças diferentes.`, {
      action: "Finalize o que já está aí, ou remova alguma peça antes de adicionar outra.",
    });
  }

  if (!madeToOrder && quantity > available) {
    throw new AppError(
      "OUT_OF_STOCK",
      `Só temos ${available} unidade(s) de "${variant.product.name}" (${variant.size}).`,
      { action: "Reduza a quantidade, ou peça esta peça sob medida." },
    );
  }

  try {
    const created = await db.cartItem.create({
      data: {
        cartId: params.cartId,
        kind: "CATALOG",
        productVariantId: params.variantId,
        quantity,
        displayUnitPriceCents: unitPriceCents,
      },
    });
    await touchCart(params.cartId);
    return { lineId: created.id, quantity: created.quantity };
  } catch (error) {
    // Corrida com outra aba da mesma pessoa. A constraint única resolve; aqui
    // só transformamos em incremento, que é o que ela queria de qualquer forma.
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return addToCart(params);
    }
    throw error;
  }
}

export async function updateCartLine(params: {
  cartId: string;
  lineId: string;
  quantity: number;
}): Promise<void> {
  const quantity = Math.trunc(params.quantity);

  if (quantity <= 0) {
    await removeCartLine({ cartId: params.cartId, lineId: params.lineId });
    return;
  }
  if (quantity > MAX_LINE_QUANTITY) {
    throw new AppError("VALIDATION_FAILED", `Máximo de ${MAX_LINE_QUANTITY} unidades por peça.`, {
      action: `Para um pedido maior, fale com a gente sobre o programa de revenda.`,
    });
  }

  // Escopo pela sacola: um id de linha de outra sacola não casa com nada.
  const line = await db.cartItem.findFirst({
    where: { id: params.lineId, cartId: params.cartId },
    include: { productVariant: { include: { product: { select: { fulfilment: true, name: true } } } } },
  });
  if (!line) throw notFound("Este item da sacola");

  const variant = line.productVariant;
  if (variant && variant.product.fulfilment !== "MADE_TO_ORDER") {
    const available = variant.stockOnHand - variant.stockReserved;
    if (quantity > available) {
      throw new AppError(
        "OUT_OF_STOCK",
        `Só temos ${available} unidade(s) de "${variant.product.name}" (${variant.size}).`,
        { action: "Ajuste a quantidade para continuar." },
      );
    }
  }

  await db.cartItem.update({ where: { id: line.id }, data: { quantity } });
  await touchCart(params.cartId);
}

export async function removeCartLine(params: { cartId: string; lineId: string }): Promise<void> {
  const { count } = await db.cartItem.deleteMany({
    where: { id: params.lineId, cartId: params.cartId },
  });
  if (count === 0) throw notFound("Este item da sacola");
  await touchCart(params.cartId);
}

/**
 * Fecha a sacola depois que ela virou pedido.
 *
 * Fechar em vez de apagar: as linhas continuam existindo para auditoria, e a
 * próxima visita abre uma sacola nova em vez de reaproveitar a que já foi paga.
 */
export async function closeCart(cartId: string): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { closedAt: new Date() } });
}

export async function clearCart(cartId: string): Promise<number> {
  const { count } = await db.cartItem.deleteMany({ where: { cartId } });
  await touchCart(cartId);
  return count;
}

/** Estender a validade quando a pessoa mexe na sacola é o comportamento esperado. */
async function touchCart(cartId: string): Promise<void> {
  const cart = await db.cart.findUnique({ where: { id: cartId }, select: { userId: true } });
  await db.cart.update({
    where: { id: cartId },
    data: { expiresAt: ttlFor(cart?.userId ?? null) },
  });
}

/**
 * Lê a sacola com disponibilidade e preço ao vivo.
 *
 * Nunca confia no preço gravado na linha. Ele existe apenas para detectar que o
 * preço mudou e avisar — cobrar um valor antigo porque a sacola ficou aberta é
 * um erro que o cliente descobre no extrato.
 */
export async function getCartView(cartId: string, sellerDiscountBp = 0): Promise<CartView> {
  const cart = await db.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          productVariant: {
            include: { product: { select: { id: true, slug: true, name: true, category: true, basePriceCents: true, fulfilment: true, published: true, deletedAt: true } } },
          },
        },
      },
    },
  });
  if (!cart) throw notFound("A sacola");

  const lines: CartLine[] = [];
  const notices: CartView["notices"] = [];
  const orphanLineIds: string[] = [];

  for (const item of cart.items) {
    const variant = item.productVariant;
    // Peça despublicada ou removida enquanto a sacola estava aberta.
    if (!variant || !variant.active || !variant.product.published || variant.product.deletedAt) {
      orphanLineIds.push(item.id);
      notices.push({
        code: "ITEM_UNAVAILABLE",
        message: "Uma peça saiu do catálogo enquanto sua sacola estava aberta e foi removida.",
        action: "Se você quer exatamente aquela peça, podemos fazê-la sob medida.",
      });
      continue;
    }

    const madeToOrder = variant.product.fulfilment === "MADE_TO_ORDER";
    const availableNow = madeToOrder
      ? Number.MAX_SAFE_INTEGER
      : variant.stockOnHand - variant.stockReserved;

    let unitPriceCents = variant.product.basePriceCents + variant.priceDeltaCents;
    if (sellerDiscountBp > 0) {
      const discount = applyBasisPoints(money(unitPriceCents, CURRENCY), sellerDiscountBp);
      unitPriceCents -= discount.cents;
    }

    const line: CartLine = {
      id: item.id,
      variantId: variant.id,
      productId: variant.product.id,
      slug: variant.product.slug,
      name: variant.product.name,
      size: variant.size,
      colorway: variant.colorway,
      quantity: item.quantity,
      unitPriceCents,
      totalPriceCents: unitPriceCents * item.quantity,
      currency: CURRENCY,
      madeToOrder,
      category: variant.product.category,
      availableNow: madeToOrder ? item.quantity : availableNow,
      addedAt: item.createdAt,
    };

    if (!madeToOrder && item.quantity > availableNow) {
      line.availabilityWarning =
        availableNow <= 0
          ? "Esgotou enquanto sua sacola estava aberta."
          : `Restam ${availableNow} — ajuste a quantidade para finalizar.`;
    }
    if (item.displayUnitPriceCents !== unitPriceCents && item.displayUnitPriceCents > 0) {
      line.priceChangedFromCents = item.displayUnitPriceCents;
    }

    lines.push(line);
  }

  if (orphanLineIds.length > 0) {
    await db.cartItem.deleteMany({ where: { id: { in: orphanLineIds } } });
  }

  if (lines.some((l) => l.priceChangedFromCents !== undefined)) {
    notices.push({
      code: "PRICE_CHANGED",
      message: "O preço de uma peça mudou desde que você a colocou na sacola.",
      action: "O valor mostrado agora é o que será cobrado. Nunca cobramos o preço antigo sem avisar.",
    });
  }

  const hoursToExpiry = (cart.expiresAt.getTime() - Date.now()) / 3_600_000;
  if (hoursToExpiry < 24 && hoursToExpiry > 0 && lines.length > 0) {
    notices.push({
      code: "CART_EXPIRING",
      message: "Esta sacola expira em menos de um dia.",
      action: "Sacolas expiram para que o estoque não fique parado. Nada foi reservado — finalize quando quiser, no preço do dia.",
    });
  }

  return {
    id: cart.id,
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.totalPriceCents, 0),
    currency: CURRENCY,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    expiresAt: cart.expiresAt,
    notices,
  };
}

/**
 * Contagem para o cabeçalho, sem efeito colateral.
 *
 * `resolveCart` cria a sacola e grava cookie — coisas que o React proíbe
 * durante o render de um layout, e que de qualquer forma não deveriam
 * acontecer só porque alguém abriu a página inicial. Esta função apenas
 * *olha*: se não há sacola, a resposta é zero.
 */
export async function peekCartCount(userId: string | null): Promise<number> {
  const now = new Date();
  let cart: { id: string } | null = null;

  if (userId) {
    cart = await db.cart.findFirst({
      where: { userId, closedAt: null, expiresAt: { gt: now } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
  } else {
    const raw = (await cookies()).get(cartCookieName())?.value;
    if (!raw) return 0;
    cart = await db.cart.findFirst({
      where: { anonKeyHash: hashToken(raw), closedAt: null, userId: null, expiresAt: { gt: now } },
      select: { id: true },
    });
  }

  if (!cart) return 0;
  return cartItemCount(cart.id);
}

/** Contagem para o cabeçalho. Consulta barata, chamada em toda página. */
export async function cartItemCount(cartId: string): Promise<number> {
  const result = await db.cartItem.aggregate({
    where: { cartId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Varre sacolas expiradas.
 *
 * Roda na fila. Como a sacola não segura estoque, isto não libera nada — é
 * higiene de dados e privacidade: sacola abandonada é histórico de navegação
 * que ninguém pediu para guardar.
 */
export async function sweepExpiredCarts(limit = 500): Promise<number> {
  const expired = await db.cart.findMany({
    where: { expiresAt: { lt: new Date() }, closedAt: null },
    take: limit,
    select: { id: true },
  });
  if (expired.length === 0) return 0;

  const ids = expired.map((c) => c.id);
  await db.cartItem.deleteMany({ where: { cartId: { in: ids } } });
  await db.cart.updateMany({ where: { id: { in: ids } }, data: { closedAt: new Date() } });

  log.info("cart.swept_expired", { count: expired.length });
  return expired.length;
}
