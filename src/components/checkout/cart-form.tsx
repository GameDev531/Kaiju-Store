"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckoutState } from "@/app/checkout/actions";
import { previewCouponAction } from "@/app/checkout/actions";
import { Field, ErrorState, Notice, MoneyText } from "@/components/ui";

const INITIAL: CheckoutState = { ok: false };
type CheckoutAction = (prev: CheckoutState, formData: FormData) => Promise<CheckoutState>;

/**
 * Finalização de um pedido de catálogo.
 *
 * O formulário envia endereço, frete, forma de pagamento e um cupom. **Nenhuma
 * linha, nenhuma quantidade, nenhum preço.** O servidor lê tudo isso da sacola.
 * Os totais mostrados aqui são estimativa de tela: o servidor recalcula cada
 * um deles e, se divergir, o servidor é quem vale.
 */
export function CartCheckoutForm({
  action,
  csrf,
  addresses,
  shippingOptions,
  itemTotalCents,
  currency,
  blocked,
}: {
  action: CheckoutAction;
  csrf: string;
  addresses: { id: string; label: string }[];
  shippingOptions: { service: string; label: string; priceCents: number; estimatedDays: number }[];
  itemTotalCents: number;
  currency: string;
  /** Motivo pelo qual a finalização está travada (item esgotado, por exemplo). */
  blocked?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [couponState, couponFormAction, couponPending] = useActionState(previewCouponAction, INITIAL);
  const router = useRouter();

  const [shipping, setShipping] = useState(shippingOptions[0]?.service ?? "");
  const [method, setMethod] = useState<"PIX" | "CARD" | "BOLETO">("PIX");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");

  useEffect(() => {
    if (couponState.ok && couponState.discount) setAppliedCoupon(couponCode.trim().toUpperCase());
    if (!couponState.ok && couponState.message) setAppliedCoupon("");
  }, [couponState, couponCode]);

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  const shippingCents = shippingOptions.find((s) => s.service === shipping)?.priceCents ?? 0;
  const discountCents = couponState.ok ? (couponState.discount?.amountCents ?? 0) : 0;
  const estimatedTotal = Math.max(0, itemTotalCents - discountCents + shippingCents);

  return (
    <div className="stack" style={{ ["--stack-gap" as string]: "1.5rem" }}>
      {/* Cupom em formulário separado: validar não pode enviar o pedido. */}
      <form action={couponFormAction} className="panel-sunk" style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="subtotalCents" value={itemTotalCents} />
        <label className="field-label" htmlFor="couponPreview">Cupom (opcional)</label>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <input
            id="couponPreview"
            name="couponCode"
            className="input"
            placeholder="CODIGO"
            maxLength={40}
            style={{ textTransform: "uppercase" }}
            disabled={couponPending}
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
          />
          <button type="submit" className="btn btn-quiet btn-sm" disabled={couponPending}>
            {couponPending ? "…" : "Aplicar"}
          </button>
        </div>
        {couponState.ok && couponState.message ? (
          <p style={{ fontSize: "0.85rem", color: "var(--color-observed)", fontWeight: 600 }}>✓ {couponState.message}</p>
        ) : null}
        {!couponState.ok && couponState.message ? <p className="field-error">{couponState.message}</p> : null}
      </form>

      <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="shippingService" value={shipping} />
        <input type="hidden" name="method" value={method} />
        {appliedCoupon ? <input type="hidden" name="couponCode" value={appliedCoupon} /> : null}

        <Field
          label="Endereço de entrega"
          name="addressId"
          required
          {...(state.fields?.addressId ? { error: state.fields.addressId } : {})}
        >
          <select id="addressId" name="addressId" className="select" required disabled={pending}>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Entrega</legend>
          {shippingOptions.length === 0 ? (
            <Notice tone="attention" title="Não conseguimos calcular o frete agora">
              Isso costuma ser temporário. Recarregue a página em alguns instantes.
            </Notice>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {shippingOptions.map((s) => (
                <label key={s.service} className="choice">
                  <input
                    type="radio"
                    name="shippingChoice"
                    value={s.service}
                    checked={shipping === s.service}
                    onChange={() => setShipping(s.service)}
                    disabled={pending}
                  />
                  <span style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <span>
                      <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem" }}>{s.label}</span>
                      <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
                        cerca de {s.estimatedDays} dias após a postagem
                      </span>
                    </span>
                    <span style={{ fontWeight: 600 }}><MoneyText cents={s.priceCents} currency={currency} /></span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label" style={{ marginBottom: "0.5rem" }}>Forma de pagamento</legend>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {([
              ["PIX", "PIX", "Confirmação em minutos. As peças ficam separadas por 30 minutos enquanto você paga."],
              ["CARD", "Cartão de crédito", "Processado pelo provedor de pagamento. Não guardamos o número do seu cartão."],
              ["BOLETO", "Boleto", "Compensação em até 3 dias úteis, e as peças ficam separadas por esse prazo."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} className="choice">
                <input
                  type="radio"
                  name="methodChoice"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  disabled={pending}
                />
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem" }}>{label}</span>
                  <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="panel" style={{ padding: "1.15rem" }}>
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem" }}>
            <Row label="Peças" cents={itemTotalCents} currency={currency} />
            {discountCents > 0 ? <Row label="Desconto" cents={-discountCents} currency={currency} /> : null}
            <Row label="Entrega" cents={shippingCents} currency={currency} />
            <div style={{ borderTop: "2px solid var(--color-ink)", paddingTop: "0.6rem", display: "flex", justifyContent: "space-between" }}>
              <dt style={{ fontWeight: 700 }}>Total</dt>
              <dd style={{ margin: 0, fontWeight: 700, fontSize: "1.15rem" }}>
                <MoneyText cents={estimatedTotal} currency={currency} />
              </dd>
            </div>
          </dl>
          <p style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
            Estimativa de tela. O servidor recalcula preço, desconto e frete a partir do banco no
            momento do pedido — se divergir daqui, vale o do servidor, e você vê o motivo.
          </p>
        </div>

        {blocked ? <Notice tone="blocking" title="Ajuste a sacola antes de finalizar">{blocked}</Notice> : null}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={pending || shippingOptions.length === 0 || Boolean(blocked)}
        >
          {pending ? "Criando o pedido…" : "Finalizar pedido"}
        </button>

        {pending ? (
          <p role="status" aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
            Separando as peças e criando a cobrança. Não recarregue a página.
          </p>
        ) : null}

        {state.displayCode ? (
          <Notice tone="good" title="Código PIX gerado">
            <code className="t-mono" style={{ display: "block", wordBreak: "break-all", marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {state.displayCode}
            </code>
          </Notice>
        ) : null}

        {!state.ok && state.message ? (
          <ErrorState code={state.code} message={state.message} action={state.action ?? "Revise os dados e tente novamente."} />
        ) : null}

        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.55 }}>
          Ao finalizar você concorda com os{" "}
          <Link href="/politicas/termos" className="link">Termos</Link> e com a{" "}
          <Link href="/politicas/trocas" className="link">Política de trocas</Link>, que garante
          7 dias de arrependimento para peças de pronta-entrega.
        </p>
      </form>
    </div>
  );
}

function Row({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
      <dt style={{ color: "var(--color-ink-soft)" }}>{label}</dt>
      <dd style={{ margin: 0 }}><MoneyText cents={cents} currency={currency} /></dd>
    </div>
  );
}
