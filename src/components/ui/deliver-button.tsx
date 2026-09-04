"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * O botão de confirmação de entrega.
 *
 * Reconstruído a partir da ideia do caminhão que atravessa o botão, mas com as
 * decisões que faltavam para ele funcionar num produto real:
 *
 *  · **Acessível.** É um `<button>` de verdade, com `aria-live` anunciando a
 *    mudança de estado. A versão original só trocava classes com jQuery; um
 *    leitor de tela não recebia nada.
 *  · **Honesto sobre o resultado.** A animação NÃO decide nada. Ela roda em
 *    paralelo à ação no servidor, e o estado final só aparece quando o servidor
 *    confirma. Mostrar "confirmado" numa animação enquanto a requisição falha
 *    é a forma mais rápida de perder a confiança de alguém.
 *  · **Idempotente no clique.** Cliques repetidos durante a animação não
 *    disparam a ação de novo.
 *  · **Respeita movimento reduzido.** Sem trajeto, mesmo estado final.
 *  · 3,2 s em vez de 10 s. Dez segundos travando uma confirmação é tempo demais.
 */

const ANIMATION_MS = 3_200;

export interface DeliverButtonState {
  ok: boolean;
  message?: string;
  action?: string;
  code?: string;
}

type DeliverAction = (prev: DeliverButtonState, formData: FormData) => Promise<DeliverButtonState>;

const INITIAL: DeliverButtonState = { ok: false };

export function DeliverButton({
  action,
  csrf,
  orderId,
  idleLabel = "Confirmar recebimento",
  doneLabel = "Recebido",
  hint,
  onDone,
}: {
  action: DeliverAction;
  csrf: string;
  orderId: string;
  idleLabel?: string;
  doneLabel?: string;
  hint?: string;
  /** Para onde ir depois da confirmação — a avaliação, normalmente. */
  onDone?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle");
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A animação começa no envio; o resultado vem do servidor. Se a ação falhar,
  // o botão volta ao estado inicial em vez de mentir que deu certo.
  useEffect(() => {
    if (pending) {
      setPhase("running");
      return;
    }
    if (state.ok) {
      setPhase("done");
      if (onDone) {
        timer.current = setTimeout(() => router.push(onDone), ANIMATION_MS + 600);
      }
    } else if (state.message) {
      setPhase("failed");
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pending, state, onDone, router]);

  const disabled = pending || phase === "running" || phase === "done";

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="orderId" value={orderId} />

        <button
          type="submit"
          className="deliver-btn"
          data-state={phase}
          disabled={disabled}
          aria-disabled={disabled}
        >
          {/* Cenário da animação. Puramente decorativo. */}
          <span className="deliver-btn__rails" aria-hidden="true" />
          <span className="deliver-btn__box" aria-hidden="true">
            <span>▲</span>
          </span>
          <span className="deliver-btn__truck" aria-hidden="true">
            <span className="deliver-btn__cargo" />
            <span className="deliver-btn__cab" />
            <span className="deliver-btn__beam" />
          </span>

          <span className="deliver-btn__label deliver-btn__label--idle">
            {phase === "running" ? "Confirmando…" : idleLabel}
          </span>
          <span className="deliver-btn__label deliver-btn__label--done">
            {doneLabel}
            <svg className="deliver-btn__check" viewBox="0 0 13 11" aria-hidden="true">
              <polyline points="1 6 4.5 9.5 12 1.5" />
            </svg>
          </span>
        </button>
      </form>

      {/* O anúncio para leitor de tela é separado do teatro visual. */}
      <p role="status" aria-live="polite" className="sr-only">
        {phase === "running"
          ? "Confirmando o recebimento do pedido."
          : phase === "done"
            ? (state.message ?? "Recebimento confirmado.")
            : phase === "failed"
              ? (state.message ?? "Não foi possível confirmar.")
              : ""}
      </p>

      {phase === "done" && state.action ? (
        <p style={{ marginTop: "0.85rem", fontSize: "0.875rem", color: "var(--color-ink-soft)", lineHeight: 1.6 }}>
          {state.action}
        </p>
      ) : null}

      {phase === "failed" ? (
        <div className="notice notice-blocking" style={{ marginTop: "1rem" }} role="alert">
          <span className="notice-mark" aria-hidden="true">■</span>
          <div>
            <p className="notice-title">{state.message}</p>
            <p className="notice-action">{state.action ?? "Tente novamente em instantes."}</p>
          </div>
        </div>
      ) : null}

      {phase === "idle" && hint ? (
        <p style={{ marginTop: "0.85rem", fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.6, maxWidth: "52ch" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
