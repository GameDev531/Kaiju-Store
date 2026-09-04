"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireAuth, assertCsrf } from "@/server/auth/session";
import { toAppError, AppError } from "@/server/lib/errors";
import { log } from "@/server/lib/logger";
import { transitionOrder } from "@/server/domain/orders";
import { recordAudit } from "@/server/domain/audit";
import type { DeliverButtonState } from "@/components/ui/deliver-button";

const failure = (error: unknown): DeliverButtonState => {
  const e = toAppError(error);
  if (e.code === "INTERNAL_ERROR") log.error("order.action.unhandled", { error: e.internal ?? e });
  return { ok: false, code: e.code, message: e.message, ...(e.action ? { action: e.action } : {}) };
};

/**
 * O cliente confirma que recebeu a peça e que ela está de acordo.
 *
 * Fecha o pedido antes do fim da janela de 7 dias. É voluntário: quem não
 * clicar tem o pedido fechado automaticamente no prazo, sem perder direito
 * nenhum. Confirmar cedo não abre mão da política de trocas — a página diz isso
 * antes do clique, porque um botão que renuncia a um direito sem avisar é
 * uma armadilha.
 */
export async function confirmDeliveryAction(
  _prev: DeliverButtonState,
  formData: FormData,
): Promise<DeliverButtonState> {
  try {
    const auth = await requireAuth();
    await assertCsrf("order.confirm_delivery", formData.get("csrf"));

    const orderId = String(formData.get("orderId") ?? "");

    // Escopo pelo dono: um id de pedido de outra conta não casa com nada.
    const order = await db.order.findFirst({
      where: { id: orderId, userId: auth.user.id },
      select: { id: true, reference: true, status: true },
    });
    if (!order) throw new AppError("NOT_FOUND", "Pedido não encontrado.");

    if (order.status === "COMPLETED") {
      // Clique repetido, ou duas abas abertas. Não é erro.
      return {
        ok: true,
        message: "Este pedido já estava confirmado.",
        action: "Obrigado — está tudo certo por aqui.",
      };
    }

    if (order.status !== "DELIVERED") {
      throw new AppError("PRECONDITION_FAILED", "Este pedido ainda não consta como entregue.", {
        action: "Assim que a transportadora confirmar a entrega, o botão aparece aqui.",
      });
    }

    await transitionOrder({
      orderId: order.id,
      to: "COMPLETED",
      actor: "CUSTOMER",
      actorUserId: auth.user.id,
      reason: "Cliente confirmou o recebimento da peça.",
    });

    await recordAudit({
      actorUserId: auth.user.id,
      action: "order.delivery_confirmed",
      targetType: "Order",
      targetId: order.id,
      newState: { status: "COMPLETED" },
    });

    revalidatePath(`/pedido/${order.reference}`);
    return {
      ok: true,
      message: "Recebimento confirmado.",
      action:
        "Se aparecer qualquer divergência em relação à ficha que você aprovou, ainda dá para abrir um chamado — confirmar o recebimento não encerra a política de trocas.",
    };
  } catch (error) {
    return failure(error);
  }
}
