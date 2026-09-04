"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CartActionState } from "@/app/sacola/actions";
import { ErrorState, Notice } from "@/components/ui";

const INITIAL: CartActionState = { ok: false };
type CartAction = (prev: CartActionState, formData: FormData) => Promise<CartActionState>;

export function AddToCartForm({
  action,
  csrf,
  productId,
  variants,
  madeToOrder,
}: {
  action: CartAction;
  csrf: string;
  productId: string;
  variants: { id: string; size: string; colorway: string; available: number }[];
  madeToOrder: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const anyAvailable = madeToOrder || variants.some((v) => v.available > 0);
  const firstAvailableIndex = variants.findIndex((v) => madeToOrder || v.available > 0);

  if (!anyAvailable) {
    return (
      <Notice tone="attention" title="Esgotado em todos os tamanhos">
        Esta peça pode ser feita sob medida nas suas medidas — é o mesmo desenho, cortado para você.
      </Notice>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: "1rem" }}>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="productId" value={productId} />

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Tamanho</legend>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {variants.map((variant, index) => {
            const available = madeToOrder || variant.available > 0;
            return (
              <label
                key={variant.id}
                className="choice"
                style={{
                  padding: "0.5rem 0.9rem",
                  minWidth: 62,
                  justifyContent: "center",
                  opacity: available ? 1 : 0.4,
                  cursor: available ? "pointer" : "not-allowed",
                }}
              >
                <input
                  type="radio"
                  name="variantId"
                  value={variant.id}
                  disabled={!available || pending}
                  defaultChecked={available && index === firstAvailableIndex}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                <span style={{ fontWeight: 600, fontSize: "0.875rem", textAlign: "center" }}>
                  {variant.size}
                  {/* Escassez real, lida ao vivo. Nunca um contador inventado
                      para pressionar quem está decidindo. */}
                  {!madeToOrder && variant.available > 0 && variant.available <= 3 ? (
                    <span style={{ display: "block", fontSize: "0.68rem", color: "var(--color-shu)", fontWeight: 500 }}>
                      {variant.available} rest.
                    </span>
                  ) : null}
                  {!available ? <span className="sr-only"> (esgotado)</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "0 0 88px" }}>
          <label className="field-label" htmlFor="quantity">Qtd.</label>
          <input id="quantity" name="quantity" type="number" min={1} max={10} defaultValue={1} className="input" disabled={pending} />
        </div>
        <button type="submit" className="btn btn-primary" style={{ flex: "1 1 200px" }} disabled={pending}>
          {pending ? "Adicionando…" : "Adicionar à sacola"}
        </button>
      </div>

      {state.ok && state.message ? (
        <Notice tone="good" title={state.message}>
          {state.action} <Link href="/sacola" className="link">Ver a sacola</Link>
        </Notice>
      ) : null}
      {!state.ok && state.message ? (
        <ErrorState code={state.code} message={state.message} action={state.action ?? "Tente novamente."} />
      ) : null}
    </form>
  );
}

export function CartLineControls({
  updateAction,
  removeAction,
  csrfUpdate,
  csrfRemove,
  lineId,
  quantity,
  maxQuantity,
}: {
  updateAction: CartAction;
  removeAction: CartAction;
  csrfUpdate: string;
  csrfRemove: string;
  lineId: string;
  quantity: number;
  maxQuantity: number;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(updateAction, INITIAL);
  const [, removeFormAction, removePending] = useActionState(removeAction, INITIAL);
  const busy = updatePending || removePending;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <form action={updateFormAction} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="hidden" name="csrf" value={csrfUpdate} />
          <input type="hidden" name="lineId" value={lineId} />
          <label htmlFor={`qty-${lineId}`} className="sr-only">Quantidade</label>
          <input
            id={`qty-${lineId}`}
            name="quantity"
            type="number"
            min={0}
            max={maxQuantity}
            defaultValue={quantity}
            className="input"
            style={{ width: 76, minHeight: 40, paddingBlock: "0.35rem" }}
            disabled={busy}
          />
          <button type="submit" className="btn btn-quiet btn-sm" disabled={busy}>
            {updatePending ? "…" : "Atualizar"}
          </button>
        </form>

        <form action={removeFormAction}>
          <input type="hidden" name="csrf" value={csrfRemove} />
          <input type="hidden" name="lineId" value={lineId} />
          <button type="submit" className="btn btn-quiet btn-sm" disabled={busy}>
            {removePending ? "Removendo…" : "Remover"}
          </button>
        </form>
      </div>

      {!updateState.ok && updateState.message ? (
        <p className="field-error" style={{ marginTop: "0.5rem" }}>{updateState.message}</p>
      ) : null}
    </div>
  );
}

export function ClearCartForm({ action, csrf }: { action: CartAction; csrf: string }) {
  const [, formAction, pending] = useActionState(action, INITIAL);
  return (
    <form action={formAction}>
      <input type="hidden" name="csrf" value={csrf} />
      <button type="submit" className="btn btn-quiet btn-sm" disabled={pending}>
        {pending ? "Esvaziando…" : "Esvaziar sacola"}
      </button>
    </form>
  );
}
