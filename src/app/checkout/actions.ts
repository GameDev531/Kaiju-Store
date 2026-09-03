"use server";

import { z } from "zod";
import { requireAuth, assertCsrf, rateLimitSubject } from "@/server/auth/session";
import { checkout, applyCoupon } from "@/server/domain/checkout";
import { toAppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";

export interface CheckoutState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
  fields?: Record<string, string>;
  redirectTo?: string;
  /** PIX copy-and-paste code, when that method was chosen. */
  displayCode?: string;
  discount?: { label: string; amountCents: number };
}

const failure = (error: unknown): CheckoutState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("checkout.action.unhandled", { error: e.internal ?? e });
  return {
    ok: false,
    code: e.code,
    message: e.message,
    ...(e.action ? { action: e.action } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  };
};

const CheckoutSchema = z.object({
  quotationId: z.string().min(1),
  addressId: z.string().min(1, "Escolha um endereço de entrega."),
  measurementProfileId: z.string().min(1, "Escolha o perfil de medidas desta peça."),
  shippingService: z.string().min(1, "Escolha uma forma de entrega."),
  method: z.enum(["CARD", "PIX", "BOLETO"]),
  couponCode: z.string().trim().max(40).optional(),
});

/**
 * The client sends ids and a payment method. It does not send a price, a
 * discount, a shipping cost, or a total — every one of those is computed
 * server-side in `checkout()` from database rows.
 */
export async function checkoutAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("checkout.submit", formData.get("csrf"));

    const parsed = CheckoutSchema.safeParse({
      quotationId: formData.get("quotationId"),
      addressId: formData.get("addressId"),
      measurementProfileId: formData.get("measurementProfileId"),
      shippingService: formData.get("shippingService"),
      method: formData.get("method"),
      couponCode: formData.get("couponCode") || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Faltam informações para concluir o pedido.",
        action: "Complete os campos destacados.",
        fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
      };
    }

    const result = await checkout({
      userId: auth.user.id,
      lines: [
        {
          kind: "CUSTOM",
          quotationId: parsed.data.quotationId,
          measurementProfileId: parsed.data.measurementProfileId,
          quantity: 1,
        },
      ],
      addressId: parsed.data.addressId,
      couponCode: parsed.data.couponCode ?? null,
      shippingService: parsed.data.shippingService,
      method: parsed.data.method,
      rateLimitSubject: await rateLimitSubject(auth),
    });

    return {
      ok: true,
      message: "Pedido criado.",
      redirectTo: result.payment.redirectUrl ?? `/pedido/${result.orderReference}`,
      ...(result.payment.displayCode ? { displayCode: result.payment.displayCode } : {}),
    };
  } catch (error) {
    return failure(error);
  }
}

/** Validates a coupon without committing to a purchase. */
export async function previewCouponAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("checkout.coupon", formData.get("csrf"));
    const code = String(formData.get("couponCode") ?? "");
    const subtotal = Number(formData.get("subtotalCents") ?? 0);

    // The subtotal here is only used for the "minimum spend" preview message.
    // The binding calculation happens again, from the database, at checkout.
    const applied = await applyCoupon(code, auth.user.id, Math.max(0, Math.trunc(subtotal)));
    return {
      ok: true,
      message: `Cupom aplicado: ${applied.label}`,
      discount: { label: applied.label, amountCents: applied.discountCents },
    };
  } catch (error) {
    return failure(error);
  }
}
