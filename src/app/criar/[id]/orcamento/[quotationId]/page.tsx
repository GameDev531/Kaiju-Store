import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth, csrfToken } from "@/server/auth/session";
import { parseSpecJson } from "@/server/domain/spec";
import { Breadcrumbs, Label, Notice, MoneyText, SectionHead, Badge } from "@/components/ui";
import { CheckoutForm } from "@/components/checkout/form";
import { checkoutAction } from "@/app/checkout/actions";
import { quoteShipping } from "@/server/shipping";
import { env } from "@/server/lib/env";

export const metadata: Metadata = { title: "Seu orçamento", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function QuotationPage({
  params,
}: {
  params: Promise<{ id: string; quotationId: string }>;
}) {
  const { id, quotationId } = await params;
  const auth = await getAuth();
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(`/criar/${id}/orcamento/${quotationId}`)}`);

  // Ownership scoped at the query — a quotation id from another account matches nothing.
  const quotation = await db.quotation.findFirst({
    where: { id: quotationId, designId: id, design: { userId: auth.user.id } },
    include: {
      design: { select: { title: true, measurementProfileId: true } },
      designVersion: true,
    },
  });
  if (!quotation) notFound();

  const spec = parseSpecJson(quotation.designVersion.specJson);
  const lines = JSON.parse(quotation.breakdownJson) as {
    code: string;
    label: string;
    explanation: string;
    amountCents: number;
  }[];

  const expired = quotation.expiresAt < new Date();
  const specChanged = quotation.designVersion.specHash !== quotation.specHash;

  const [addresses, profiles, csrf] = await Promise.all([
    db.address.findMany({ where: { userId: auth.user.id, deletedAt: null }, orderBy: { isDefault: "desc" } }),
    db.measurementProfile.findMany({ where: { userId: auth.user.id, deletedAt: null }, orderBy: { isDefault: "desc" } }),
    csrfToken("checkout.submit"),
  ]);

  // Shipping options are quoted live against the default address, so the customer
  // sees the real total before committing rather than after.
  const defaultAddress = addresses[0];
  const shippingOptions = defaultAddress
    ? await quoteShipping({
        originPostalCode: env.SHIP_ORIGIN_POSTAL_CODE,
        destinationPostalCode: defaultAddress.postalCode,
        weightGrams: spec.category === "OUTERWEAR" ? 1400 : 600,
        lengthCm: 35,
        widthCm: 27,
        heightCm: 8,
        declaredValueCents: quotation.totalCents,
      }).catch(() => [])
    : [];

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[
          { href: "/", label: "Início" },
          { href: "/criar", label: "Criar minha peça" },
          { href: `/criar/${id}`, label: quotation.design.title },
          { label: "Orçamento" },
        ]}
      />

      <header style={{ marginTop: "1.5rem" }}>
        <Label>Passo 6 de 6 · Orçamento</Label>
        <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>{quotation.design.title}</h1>
      </header>

      {expired ? (
        <div style={{ marginTop: "2rem" }}>
          <Notice tone="blocking" title="Este orçamento expirou">
            Preços de tecido e de mão de obra mudam, e não seria honesto cobrar um valor desatualizado.
            Volte ao design e gere um novo — a ficha aprovada continua igual.{" "}
            <Link href={`/criar/${id}`} className="link">Voltar ao design</Link>
          </Notice>
        </div>
      ) : null}

      {specChanged ? (
        <div style={{ marginTop: "2rem" }}>
          <Notice tone="blocking" title="A ficha mudou depois deste orçamento">
            O preço aqui foi calculado para uma versão diferente da que está aprovada agora.
            Aprove a versão atual e gere um novo orçamento.{" "}
            <Link href={`/criar/${id}`} className="link">Voltar ao design</Link>
          </Notice>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)", marginTop: "2.5rem" }}>
        {/* ---- breakdown ---- */}
        <section>
          <SectionHead label="Sem caixa-preta" title="Como chegamos neste preço" />
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Composição do preço</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.code}>
                    <td>
                      <span style={{ fontWeight: 600, display: "block" }}>{line.label}</span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", lineHeight: 1.5 }}>
                        {line.explanation}
                      </span>
                    </td>
                    <td className="num">
                      <MoneyText cents={line.amountCents} currency={quotation.currency} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700, borderTop: "2px solid var(--color-ink)" }}>Total da peça</td>
                  <td className="num" style={{ fontWeight: 700, fontSize: "1.05rem", borderTop: "2px solid var(--color-ink)" }}>
                    <MoneyText cents={quotation.totalCents} currency={quotation.currency} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
            O frete é calculado na próxima seção, a partir do CEP de entrega. Não há taxa escondida
            depois deste ponto.
          </p>

          <div style={{ marginTop: "2rem", display: "grid", gap: "1rem" }}>
            <div className="panel-blueprint" style={{ padding: "1.15rem" }}>
              <Label>Prazo de produção</Label>
              <p style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.4rem" }}>
                {quotation.productionDaysMin} a {quotation.productionDaysMax} dias
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--color-ink-soft)", marginTop: "0.4rem", lineHeight: 1.55 }}>
                Contados a partir do momento em que um ateliê aceita o trabalho, não do pagamento.
                O envio vem depois disso. Complexidade avaliada: {spec.productionComplexity}/5.
              </p>
            </div>

            <div className="panel-sunk" style={{ padding: "1.15rem" }}>
              <Label>O que você está aprovando</Label>
              <p style={{ fontSize: "0.9rem", marginTop: "0.5rem", lineHeight: 1.6 }}>{spec.summary}</p>
              <p className="t-mono" style={{ fontSize: "0.7rem", color: "var(--color-ink-faint)", marginTop: "0.75rem" }}>
                Assinatura da ficha: {quotation.specHash.slice(0, 24)}…
              </p>
              <Link href={`/criar/${id}`} className="link" style={{ fontSize: "0.85rem", display: "inline-block", marginTop: "0.6rem" }}>
                Rever a ficha técnica completa
              </Link>
            </div>
          </div>
        </section>

        {/* ---- checkout ---- */}
        <section>
          <SectionHead label="Finalizar" title="Pagamento e entrega" />
          {expired || specChanged ? (
            <Notice tone="attention" title="Finalização indisponível">
              Resolva o aviso acima para continuar. Seu design e sua ficha continuam salvos.
            </Notice>
          ) : addresses.length === 0 ? (
            <Notice tone="blocking" title="Você ainda não tem um endereço de entrega">
              Cadastre um endereço para calcularmos o frete e concluir o pedido.{" "}
              <Link href="/conta/enderecos" className="link">Cadastrar endereço</Link>
            </Notice>
          ) : (
            <CheckoutForm
              action={checkoutAction}
              csrf={csrf}
              quotationId={quotation.id}
              addresses={addresses.map((a) => ({
                id: a.id,
                label: `${a.label} — ${a.line1}, ${a.city}/${a.state}`,
              }))}
              measurementProfiles={profiles.map((p) => ({
                id: p.id,
                name: p.name,
                complete: [p.chestMm, p.waistMm, p.heightMm].filter(Boolean).length >= 3,
              }))}
              defaultMeasurementProfileId={quotation.design.measurementProfileId}
              shippingOptions={shippingOptions.map((s) => ({
                service: s.service,
                label: s.serviceLabel,
                priceCents: s.priceCents,
                estimatedDays: s.estimatedDays,
              }))}
              itemTotalCents={quotation.totalCents}
              currency={quotation.currency}
            />
          )}
        </section>
      </div>
    </div>
  );
}
