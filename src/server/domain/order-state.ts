import type { OrderStatus } from "./enums";
import { TERMINAL_STATUSES } from "./enums";
import { illegalTransition } from "../lib/errors";

/**
 * The order state machine.
 *
 * This table is the single authority on what an order may do next. UI copy,
 * producer actions, webhooks and admin tools all funnel through `assertTransition`
 * — there is no code path that writes `order.status` directly.
 *
 * `actors` names who may cause the transition. A customer cannot mark their own
 * order SHIPPED, and a producer cannot mark it REFUNDED, no matter what the
 * request body says.
 */

export type Actor = "SYSTEM" | "CUSTOMER" | "PRODUCER" | "ADMIN" | "PROVIDER_WEBHOOK";

interface TransitionRule {
  to: OrderStatus;
  actors: readonly Actor[];
  /** Short reason shown in the audit trail and, when relevant, to the customer. */
  description: string;
}

const T = (to: OrderStatus, actors: readonly Actor[], description: string): TransitionRule => ({
  to,
  actors,
  description,
});

/** Anywhere-to-here escapes available to staff, applied on top of the table. */
const ADMIN_ESCAPES: readonly TransitionRule[] = [
  T("ON_HOLD", ["ADMIN"], "Produção pausada pela operação"),
  T("DISPUTED", ["ADMIN", "CUSTOMER"], "Análise aberta sobre o pedido"),
  T("CANCELLED", ["ADMIN"], "Cancelado pela operação"),
];

const TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
  DRAFT: [
    T("QUOTED", ["SYSTEM"], "Orçamento calculado"),
    T("CANCELLED", ["CUSTOMER", "ADMIN"], "Rascunho descartado"),
  ],
  QUOTED: [
    // Approving the quote freezes the spec version. This is the point of no return
    // for design edits — after it, changes create a new version and a new quote.
    T("CUSTOMER_APPROVED", ["CUSTOMER"], "Cliente aprovou a ficha técnica e o orçamento"),
    T("DRAFT", ["CUSTOMER"], "Cliente voltou a editar o design"),
    T("CANCELLED", ["CUSTOMER", "ADMIN"], "Orçamento recusado"),
  ],
  CUSTOMER_APPROVED: [
    T("PAYMENT_PENDING", ["SYSTEM"], "Pagamento iniciado"),
    T("CANCELLED", ["CUSTOMER", "ADMIN"], "Cancelado antes do pagamento"),
  ],
  PAYMENT_PENDING: [
    // Only the provider webhook (signature-verified) may declare money received.
    T("PAID", ["PROVIDER_WEBHOOK", "ADMIN"], "Pagamento confirmado pelo provedor"),
    T("CUSTOMER_APPROVED", ["SYSTEM", "PROVIDER_WEBHOOK"], "Pagamento não concluído; pedido devolvido para nova tentativa"),
    T("CANCELLED", ["CUSTOMER", "ADMIN", "SYSTEM"], "Pagamento expirado ou cancelado"),
  ],
  PAID: [
    T("PRODUCER_PENDING", ["SYSTEM"], "Ficha enviada para ateliês compatíveis"),
    T("ON_HOLD", ["ADMIN"], "Retido para checagem antifraude"),
    T("REFUNDED", ["ADMIN"], "Reembolsado antes de iniciar produção"),
  ],
  PRODUCER_PENDING: [
    T("PRODUCER_ACCEPTED", ["PRODUCER", "ADMIN"], "Ateliê aceitou a produção"),
    T("REQUIRES_CUSTOMER_ACTION", ["PRODUCER"], "Ateliê pediu esclarecimento ao cliente"),
    T("ON_HOLD", ["ADMIN", "SYSTEM"], "Nenhum ateliê compatível disponível"),
    T("REFUNDED", ["ADMIN"], "Reembolsado por falta de ateliê"),
  ],
  PRODUCER_ACCEPTED: [
    T("MATERIALS_PREPARATION", ["PRODUCER"], "Separação de materiais iniciada"),
    T("REQUIRES_CUSTOMER_ACTION", ["PRODUCER"], "Dúvida sobre a ficha técnica"),
    T("PRODUCER_PENDING", ["ADMIN"], "Reatribuído a outro ateliê"),
  ],
  MATERIALS_PREPARATION: [
    T("CUTTING", ["PRODUCER"], "Corte iniciado"),
    T("REQUIRES_CUSTOMER_ACTION", ["PRODUCER"], "Conflito de material relatado"),
    T("REQUIRES_PRODUCER_ACTION", ["ADMIN"], "Pendência com o ateliê"),
  ],
  CUTTING: [
    T("SEWING", ["PRODUCER"], "Costura iniciada"),
    T("REQUIRES_CUSTOMER_ACTION", ["PRODUCER"], "Dúvida durante o corte"),
  ],
  SEWING: [
    T("FINISHING", ["PRODUCER"], "Acabamento iniciado"),
    T("REQUIRES_CUSTOMER_ACTION", ["PRODUCER"], "Dúvida durante a costura"),
  ],
  FINISHING: [T("QUALITY_CONTROL", ["PRODUCER"], "Enviado para controle de qualidade")],
  QUALITY_CONTROL: [
    T("READY_TO_SHIP", ["PRODUCER", "ADMIN"], "Aprovado no controle de qualidade"),
    // A failed QC goes back to the maker, it does not go to the customer.
    T("REQUIRES_PRODUCER_ACTION", ["ADMIN", "SYSTEM"], "Reprovado no controle de qualidade"),
  ],
  READY_TO_SHIP: [
    T("SHIPPED", ["PRODUCER", "ADMIN", "SYSTEM"], "Postado"),
    T("REQUIRES_PRODUCER_ACTION", ["ADMIN"], "Problema na embalagem ou etiqueta"),
  ],
  SHIPPED: [
    T("DELIVERED", ["PROVIDER_WEBHOOK", "ADMIN"], "Entrega confirmada pela transportadora"),
    T("ON_HOLD", ["ADMIN", "SYSTEM"], "Extravio ou falha de entrega em investigação"),
  ],
  DELIVERED: [
    T("COMPLETED", ["SYSTEM", "CUSTOMER"], "Janela de contestação encerrada"),
    T("DISPUTED", ["CUSTOMER", "ADMIN"], "Cliente relatou um problema"),
  ],
  COMPLETED: [T("DISPUTED", ["ADMIN"], "Reaberto pela operação")],
  REQUIRES_CUSTOMER_ACTION: [
    // Returns to whichever stage it came from — the caller passes the resume target.
    T("PRODUCER_ACCEPTED", ["CUSTOMER", "ADMIN"], "Cliente respondeu"),
    T("MATERIALS_PREPARATION", ["CUSTOMER", "ADMIN"], "Cliente respondeu"),
    T("CUTTING", ["CUSTOMER", "ADMIN"], "Cliente respondeu"),
    T("SEWING", ["CUSTOMER", "ADMIN"], "Cliente respondeu"),
    T("CANCELLED", ["CUSTOMER", "ADMIN"], "Cliente desistiu"),
    T("ON_HOLD", ["ADMIN", "SYSTEM"], "Sem resposta do cliente"),
  ],
  REQUIRES_PRODUCER_ACTION: [
    T("SEWING", ["PRODUCER", "ADMIN"], "Correção iniciada"),
    T("FINISHING", ["PRODUCER", "ADMIN"], "Correção de acabamento"),
    T("QUALITY_CONTROL", ["PRODUCER", "ADMIN"], "Reenviado para qualidade"),
    T("READY_TO_SHIP", ["PRODUCER", "ADMIN"], "Corrigido e pronto"),
    T("PRODUCER_PENDING", ["ADMIN"], "Reatribuído a outro ateliê"),
  ],
  ON_HOLD: [
    T("PAID", ["ADMIN"], "Liberado após checagem"),
    T("PRODUCER_PENDING", ["ADMIN"], "Retomado — buscando ateliê"),
    T("SHIPPED", ["ADMIN"], "Retomado — envio confirmado"),
    T("DISPUTED", ["ADMIN"], "Escalado para análise"),
    T("CANCELLED", ["ADMIN"], "Cancelado após retenção"),
    T("REFUNDED", ["ADMIN"], "Reembolsado após retenção"),
  ],
  DISPUTED: [
    T("REQUIRES_PRODUCER_ACTION", ["ADMIN"], "Refação determinada"),
    T("REFUNDED", ["ADMIN"], "Reembolso determinado"),
    T("COMPLETED", ["ADMIN"], "Análise encerrada sem reparo"),
  ],
  CANCELLED: [T("REFUNDED", ["ADMIN"], "Estorno do valor pago")],
  REFUNDED: [],
};

export interface TransitionCheck {
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
}

/** `noUncheckedIndexedAccess` is on; this keeps the lookup total and typed. */
function rulesFor(status: OrderStatus): readonly TransitionRule[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransition({ from, to, actor }: TransitionCheck): boolean {
  if (from === to) return false;
  const direct = rulesFor(from).find((r) => r.to === to);
  if (direct) return direct.actors.includes(actor);
  if (TERMINAL_STATUSES.includes(from) && from !== "COMPLETED") return false;
  const escape = ADMIN_ESCAPES.find((r) => r.to === to);
  return escape ? escape.actors.includes(actor) : false;
}

/** Throws AppError("ILLEGAL_STATE_TRANSITION") rather than returning false. */
export function assertTransition(check: TransitionCheck): TransitionRule {
  if (!canTransition(check)) throw illegalTransition(check.from, check.to);
  const rule =
    rulesFor(check.from).find((r) => r.to === check.to) ??
    ADMIN_ESCAPES.find((r) => r.to === check.to);
  // canTransition already proved one exists; this narrows the type.
  if (!rule) throw illegalTransition(check.from, check.to);
  return rule;
}

export function allowedTransitions(from: OrderStatus, actor: Actor): OrderStatus[] {
  const direct = rulesFor(from).filter((r) => r.actors.includes(actor)).map((r) => r.to);
  const escapes =
    TERMINAL_STATUSES.includes(from) && from !== "COMPLETED"
      ? []
      : ADMIN_ESCAPES.filter((r) => r.actors.includes(actor)).map((r) => r.to);
  return Array.from(new Set([...direct, ...escapes])).filter((s) => s !== from);
}

/**
 * The ordered spine shown in the customer-facing tracker. Side states
 * (ON_HOLD, REQUIRES_*) are rendered as an interruption over this spine
 * rather than as extra steps, so the tracker never reorders itself.
 */
export const TRACKER_SPINE: readonly OrderStatus[] = [
  "PAID",
  "PRODUCER_ACCEPTED",
  "MATERIALS_PREPARATION",
  "CUTTING",
  "SEWING",
  "FINISHING",
  "QUALITY_CONTROL",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
];

export function trackerPosition(status: OrderStatus): number {
  const idx = TRACKER_SPINE.indexOf(status);
  if (idx >= 0) return idx;
  if (status === "COMPLETED") return TRACKER_SPINE.length - 1;
  // Pre-production and interrupted states sit before the spine.
  return -1;
}

export const isTerminal = (s: OrderStatus): boolean => TERMINAL_STATUSES.includes(s);

/** Statuses in which a customer may still cancel without opening a dispute. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  "DRAFT",
  "QUOTED",
  "CUSTOMER_APPROVED",
  "PAYMENT_PENDING",
  "REQUIRES_CUSTOMER_ACTION",
];

/**
 * After cutting has begun the fabric is committed. Cancellation from here is a
 * support conversation, not a button — the policy pages say so explicitly.
 */
export const FABRIC_COMMITTED_FROM: OrderStatus = "CUTTING";
