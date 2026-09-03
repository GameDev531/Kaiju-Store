"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckoutState } from "@/app/checkout/actions";
import { previewCouponAction } from "@/app/checkout/actions";
import { Field, ErrorState, Notice, MoneyText } from "@/components/ui";

const INITIAL: CheckoutState = { ok: false };
type CheckoutAction = (prev: CheckoutState, formData: FormData) => Promise<CheckoutState>;

export function CheckoutForm({
  action,
  csrf,
  quotationId,
  addresses,
  measurementProfiles,
  defaultMeasurementProfileId,
  shippingOptions,
  itemTotalCents,
  currency,
}: {
  action: CheckoutAction;
  csrf: string;
  quotationId: string;
  addresses: { id: string; label: string }[];
  measurementProfiles: { id: string; name: string; complete: boolean }[];
  defaultMeasurementProfileId: string | null;
  shippingOptions: { service: string; label: string; priceCents: number; estimatedDays: number }[];
  itemTotalCents: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [couponState, couponFormAction, couponPending] = useActionState(previewCouponAction, INITIAL);
  const router = useRouter();

  const [shipping, setShipping] = useState(shippingOptions[0]?.service ?? "");
  const [method, setMethod] = useState<"PIX" | "CARD" | "BOLETO">("PIX");
  const [confirmed, setConfirmed] = useState(false);
  // The code the customer typed and successfully previewed. It is carried into
  // the order form so the server re-validates and re-applies it from scratch —
  // the preview's discount figure is never trusted as an input.
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
  // Display-only arithmetic. The server recomputes every figure independently.
  const estimatedTotal = Math.max(0, itemTotalCents - discountCents + shippingCents);

  const completeProfiles = measurementProfiles.filter((p) => p.complete);

  return (
    <div className="stack" style={{ ["--stack-gap" as string]: "1.5rem" }}>
      {/* Coupon is a separate form so validating it does not submit the order. */}
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
        {!couponState.ok && couponState.message ? (
          <p className="field-error">{couponState.message}</p>
        ) : null}
      </form>

      <form action={formAction} className="stack" style={{ ["--stack-gap" as string]: "1.25rem" }}>
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="quotationId" value={quotationId} />
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

        <Field
          label="Perfil de medidas"
          name="measurementProfileId"
          required
          hint="É por estas medidas que a peça será cortada."
          {...(state.fields?.measurementProfileId ? { error: state.fields.measurementProfileId } : {})}
        >
          <select
            id="measurementProfileId"
            name="measurementProfileId"
            className="select"
            required
            disabled={pending}
            defaultValue={defaultMeasurementProfileId ?? completeProfiles[0]?.id ?? ""}
          >
            <option value="">Selecione…</option>
            {measurementProfiles.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.complete}>
                {p.name}{p.complete ? "" : " — incompleto"}
              </option>
            ))}
          </select>
        </Field>

        {completeProfiles.length === 0 ? (
          <Notice tone="blocking" title="Nenhum perfil de medidas completo">
            Uma peça sob medida precisa de pelo menos altura, busto/peito e cintura.{" "}
            <Link href="/conta/medidas" className="link">Completar minhas medidas</Link>
          </Notice>
        ) : null}

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
              ["PIX", "PIX", "Confirmação em minutos. A produção começa assim que o pagamento cair."],
              ["CARD", "Cartão de crédito", "Processado pelo provedor de pagamento. Não guardamos o número do seu cartão."],
              ["BOLETO", "Boleto", "Compensação em até 3 dias úteis. A produção começa depois disso."],
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

        {/* ---- total ---- */}
        <div className="panel" style={{ padding: "1.15rem" }}>
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem" }}>
            <Row label="Peça" cents={itemTotalCents} currency={currency} />
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
            O valor final é recalculado no servidor a partir da ficha aprovada, do frete real e das
            regras do cupom. Se divergir daqui, o servidor é quem vale — e você vê o motivo.
          </p>
        </div>

        <label className="choice">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={pending} />
          <span style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
            Entendo que esta é uma peça feita sob encomenda a partir da ficha que aprovei, e que depois
            do início do corte o cancelamento passa a depender da{" "}
            <Link href="/politicas/trocas" className="link">Política de trocas e refação</Link>.
          </span>
        </label>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={pending || !confirmed || completeProfiles.length === 0 || shippingOptions.length === 0}
        >
          {pending ? "Criando o pedido…" : "Finalizar pedido"}
        </button>

        {pending ? (
          <p role="status" aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)" }}>
            Reservando a produção e criando a cobrança. Não recarregue a página.
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
