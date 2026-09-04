"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAuth, assertCsrf, rateLimitSubject } from "@/server/auth/session";
import { enforceRateLimit, RATE_LIMITS } from "@/server/lib/ratelimit";
import { toAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { resolveCart, addToCart, updateCartLine, removeCartLine, clearCart } from "@/server/domain/cart";
import { recordInteraction } from "@/server/domain/recommender";

export interface CartActionState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  /** Contagem atualizada, para o cabeçalho responder na hora. */
  itemCount?: number;
}

const failure = (error: unknown): CartActionState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("cart.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false, code: e.code, message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

const AddSchema = z.object({
  variantId: z.string().min(1, "Escolha um tamanho."),
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

export async function addToCartAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const auth = await getAuth();
    await assertCsrf("cart.add", formData.get("csrf"));
    // A sacola é gratuita e não reserva nada, mas ainda assim tem limite: sem
    // ele, um script enche o banco de linhas de carrinho de graça.
    await enforceRateLimit(RATE_LIMITS.write, await rateLimitSubject(auth), {
      ...(auth ? { userId: auth.user.id } : {}),
      route: "cart.add",
    });

    const parsed = AddSchema.safeParse({
      variantId: formData.get("variantId"),
      quantity: formData.get("quantity") ?? 1,
    });
    if (!parsed.success) {
      return {
        ok: false, code: "VALIDATION_FAILED",
        message: "Escolha um tamanho antes de adicionar.",
        action: "Selecione o tamanho na lista acima.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const cartId = await resolveCart(auth?.user.id ?? null);
    const result = await addToCart({ cartId, variantId: parsed.data.variantId, quantity: parsed.data.quantity });

    // Adicionar à sacola é um sinal forte de gosto — vale bem mais que uma
    // visualização e bem menos que uma compra.
    const { anonId } = await cartSubject(auth?.user.id ?? null);
    const productId = formData.get("productId");
    if (typeof productId === "string" && productId) {
      await recordInteraction({
        kind: "ADD_TO_CART",
        userId: auth?.user.id ?? null,
        anonId,
        productId,
      });
    }

    revalidatePath("/sacola");
    return {
      ok: true,
      message: "Adicionado à sacola.",
      action: "Nada foi reservado — o estoque só é separado quando você finaliza.",
      itemCount: result.quantity,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCartLineAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const auth = await getAuth();
    await assertCsrf("cart.update", formData.get("csrf"));

    const cartId = await resolveCart(auth?.user.id ?? null);
    await updateCartLine({
      cartId,
      lineId: String(formData.get("lineId") ?? ""),
      quantity: Number(formData.get("quantity") ?? 0),
    });

    revalidatePath("/sacola");
    return { ok: true, message: "Sacola atualizada." };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCartLineAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const auth = await getAuth();
    await assertCsrf("cart.remove", formData.get("csrf"));

    const cartId = await resolveCart(auth?.user.id ?? null);
    await removeCartLine({ cartId, lineId: String(formData.get("lineId") ?? "") });

    revalidatePath("/sacola");
    return { ok: true, message: "Peça removida." };
  } catch (error) {
    return failure(error);
  }
}

export async function clearCartAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const auth = await getAuth();
    await assertCsrf("cart.clear", formData.get("csrf"));

    const cartId = await resolveCart(auth?.user.id ?? null);
    const removed = await clearCart(cartId);

    revalidatePath("/sacola");
    return { ok: true, message: `${removed} peça(s) removida(s).`, itemCount: 0 };
  } catch (error) {
    return failure(error);
  }
}

/** Identificador pseudônimo de quem não tem conta, para o recomendador. */
async function cartSubject(userId: string | null): Promise<{ anonId: string | null }> {
  if (userId) return { anonId: null };
  const { readAnonId } = await import("@/server/auth/session");
  return { anonId: await readAnonId() };
}
