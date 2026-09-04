import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { getAuth } from "@/server/auth/session";
import { getOrderForCustomer, orderTimeline } from "@/server/domain/orders";
import { TRACKER_SPINE, trackerPosition } from "@/server/domain/order-state";
import { signFileUrl } from "@/server/storage";
import { Breadcrumbs, Label, Badge, Notice, MoneyText, SectionHead, MediaFrame } from "@/components/ui";
import {
  ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS, STAGE_LABELS, VERIFICATION_META,
  type OrderStatus, type ShipmentStatus, type ProductionStageName, type VerificationLevel,
} from "@/server/domain/enums";

export const metadata: Metadata = { title: "Meu pedido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await getAuth();
  if (!auth) redirect(`/entrar?next=${encodeURIComponent(`/pedido/${reference}`)}`);

  const found = await db.order.findFirst({
    where: { reference: reference.toUpperCase(), userId: auth.user.id },
    select: { id: true },
  });
  if (!found) notFound();

  const order = await getOrderForCustomer(found.id, auth.user.id);
  const timeline = await orderTimeline(order.id);
  const status = order.status as OrderStatus;
  const statusMeta = ORDER_STATUS_LABELS[status];
  const position = trackerPosition(status);

  const interrupted = status === "REQUIRES_CUSTOMER_ACTION" || status === "ON_HOLD" || status === "REQUIRES_PRODUCER_ACTION" || status === "DISPUTED";
  const reachedAt = new Map(timeline.map((t) => [t.status, t.at]));

  return (
    <div className="wrap section">
      <Breadcrumbs
        trail={[{ href: "/", label: "Início" }, { href: "/conta/pedidos", label: "Meus pedidos" }, { label: order.reference }]}
      />

      <header style={{ marginTop: "1.5rem", display: "flex", gap: "1.5rem", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>Pedido</Label>
          <h1 className="t-display-sm t-mono" style={{ marginTop: "0.6rem" }}>{order.reference}</h1>
          <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem" }}>{statusMeta.customerHint}</p>
        </div>
        <Badge tone="ink">{statusMeta.pt}</Badge>
      </header>

      {interrupted ? (
        <div style={{ marginTop: "1.75rem" }}>
          <Notice
            tone={status === "REQUIRES_CUSTOMER_ACTION" ? "blocking" : "attention"}
            title={statusMeta.pt}
          >
            {order.holdReason ?? statusMeta.customerHint}
            {status === "REQUIRES_CUSTOMER_ACTION" ? (
              <>
                {" "}
                <Link href={`/contato?assunto=pedido-${order.reference}`} className="link">
                  Responder ao ateliê pelo suporte
                </Link>
                {" — "}
                <span style={{ fontSize: "0.85rem" }}>
                  a mensageria direta com o ateliê ainda está em construção; por enquanto o suporte
                  faz a ponte e a produção fica pausada até a sua resposta.
                </span>
              </>
            ) : null}
          </Notice>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)", marginTop: "2.5rem" }}>
        {/* ---- tracker ---- */}
        <section>
          <SectionHead label="Acompanhamento" title="Onde sua peça está" />
          <div className="tracker">
            {TRACKER_SPINE.map((step, i) => {
              const stepState = position < 0 ? "pending" : i < position ? "done" : i === position ? "current" : "pending";
              const at = reachedAt.get(step);
              return (
                <div key={step} className="tracker-step" data-state={stepState}>
                  <span className="tracker-dot" aria-hidden="true">
                    {stepState === "done" ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="tracker-label">
                      {ORDER_STATUS_LABELS[step].pt}
                      {stepState === "current" ? <span className="sr-only"> (etapa atual)</span> : null}
                      {stepState === "done" ? <span className="sr-only"> (concluída)</span> : null}
                    </p>
                    <p className="tracker-hint">{ORDER_STATUS_LABELS[step].customerHint}</p>
                    {at ? (
                      <p className="t-mono" style={{ fontSize: "0.72rem", color: "var(--color-ink-faint)", marginTop: "0.2rem" }}>
                        {at.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- production evidence ---- */}
          {order.jobs.length > 0 ? (
            <div style={{ marginTop: "3rem" }}>
              <SectionHead label="Do ateliê" title="Sua peça sendo feita" />
              {order.jobs.map((job) => (
                <div key={job.id} className="panel" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", gap: "1rem", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontWeight: 650 }}>
                        {job.producer?.studioName ?? "Aguardando ateliê"}
                      </p>
                      {job.producer ? (
                        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
                          {job.producer.city}/{job.producer.state} ·{" "}
                          {VERIFICATION_META[job.producer.verificationLevel as VerificationLevel].label}
                        </p>
                      ) : null}
                    </div>
                    <Badge>{job.role === "PRIMARY" ? "Costura" : job.role}</Badge>
                  </div>

                  {job.stages.length > 0 ? (
                    <ul style={{ listStyle: "none", margin: "1.15rem 0 0", padding: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {job.stages.map((stage) => (
                        <li
                          key={stage.id}
                          className="badge"
                          style={{
                            opacity: stage.status === "PENDING" ? 0.45 : 1,
                            borderColor: stage.status === "DONE" ? "var(--color-observed)" : stage.status === "BLOCKED" ? "var(--color-uncertain)" : undefined,
                          }}
                        >
                          {stage.status === "DONE" ? "✓ " : stage.status === "IN_PROGRESS" ? "◐ " : stage.status === "BLOCKED" ? "▲ " : "○ "}
                          {STAGE_LABELS[stage.stage as ProductionStageName] ?? stage.stage}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {job.assets.length > 0 ? (
                    <div style={{ marginTop: "1.25rem" }}>
                      <Label>Fotos da produção</Label>
                      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", marginTop: "0.6rem" }}>
                        {job.assets.map((asset) => (
                          <figure key={asset.id} style={{ margin: 0 }}>
                            <MediaFrame
                              kind="CUSTOMER_PHOTO"
                              alt={asset.caption ?? `Foto de produção — etapa ${asset.stage ?? ""}`}
                              src={signFileUrl(asset.fileId, auth.user.id)}
                              aspect="1 / 1"
                            />
                            {asset.caption ? (
                              <figcaption style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)", marginTop: "0.3rem" }}>
                                {asset.caption}
                              </figcaption>
                            ) : null}
                          </figure>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "1rem" }}>
                      As fotos aparecem aqui conforme o ateliê avança. Nada é montado ou ilustrativo —
                      são fotos da sua peça.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* ---- summary ---- */}
        <aside>
          <SectionHead label="Resumo" title="O pedido" />
          <div className="panel" style={{ padding: "1.25rem" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.85rem" }}>
              {order.items.map((item) => (
                <li key={item.id} style={{ borderBottom: "1px solid var(--color-rule)", paddingBottom: "0.85rem" }}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.titleSnapshot}</p>
                  <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)" }}>
                    {item.quantity} × <MoneyText cents={item.unitPriceCents} currency={order.currency} />
                  </p>
                  {item.designVersion?.specHash ? (
                    <p className="t-mono" style={{ fontSize: "0.68rem", color: "var(--color-ink-faint)", marginTop: "0.25rem" }}>
                      ficha {item.designVersion.specHash.slice(0, 16)}…
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <dl style={{ margin: "1rem 0 0", display: "grid", gap: "0.45rem", fontSize: "0.9rem" }}>
              <Row label="Subtotal" cents={order.subtotalCents} currency={order.currency} />
              {order.discountCents > 0 ? <Row label="Desconto" cents={-order.discountCents} currency={order.currency} /> : null}
              <Row label="Entrega" cents={order.shippingCents} currency={order.currency} />
              <div style={{ borderTop: "2px solid var(--color-ink)", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <dt>Total</dt>
                <dd style={{ margin: 0 }}><MoneyText cents={order.totalCents} currency={order.currency} /></dd>
              </div>
            </dl>
          </div>

          {order.shipments.length > 0 ? (
            <div className="panel" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
              <Label>Envio</Label>
              {order.shipments.map((shipment) => (
                <div key={shipment.id} style={{ marginTop: "0.75rem" }}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                    {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus]}
                  </p>
                  {shipment.trackingCode ? (
                    <p className="t-mono" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>{shipment.trackingCode}</p>
                  ) : (
                    <p style={{ fontSize: "0.85rem", color: "var(--color-ink-faint)", marginTop: "0.3rem" }}>
                      O código de rastreio aparece aqui assim que a etiqueta for emitida.
                    </p>
                  )}
                  {shipment.events.length > 0 ? (
                    <ul style={{ listStyle: "none", margin: "0.85rem 0 0", padding: 0, display: "grid", gap: "0.5rem" }}>
                      {shipment.events.slice(0, 6).map((e) => (
                        <li key={e.id} style={{ fontSize: "0.8125rem" }}>
                          <span className="t-mono" style={{ color: "var(--color-ink-faint)" }}>
                            {e.occurredAt.toLocaleDateString("pt-BR")}
                          </span>{" "}
                          {e.description}
                          {e.location ? <span style={{ color: "var(--color-ink-faint)" }}> · {e.location}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {status === "DELIVERED" ? (
            <div style={{ marginTop: "1.25rem" }}>
              <Notice tone="attention" title="Confira a peça em até 7 dias">
                Meça e vista. Se algo divergir da ficha que você aprovou — medida fora da tolerância,
                material trocado, detalhe faltando —{" "}
                <Link href={`/contato?assunto=problema-${order.reference}`} className="link">
                  abra um chamado
                </Link>{" "}
                dentro deste prazo, com fotos e o número deste pedido. A{" "}
                <Link href="/politicas/trocas" className="link">Política de trocas</Link> explica quem
                arca com o quê em cada caso.
              </Notice>
            </div>
          ) : null}

          <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "1.25rem" }}>
            <Label>Histórico completo</Label>
            <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.45rem" }}>
              {timeline.map((t, i) => (
                <li key={i} style={{ fontSize: "0.8125rem", display: "flex", gap: "0.6rem" }}>
                  <span className="t-mono" style={{ color: "var(--color-ink-faint)", flexShrink: 0 }}>
                    {t.at.toLocaleDateString("pt-BR")}
                  </span>
                  <span>{ORDER_STATUS_LABELS[t.status].pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <dt style={{ color: "var(--color-ink-soft)" }}>{label}</dt>
      <dd style={{ margin: 0 }}><MoneyText cents={cents} currency={currency} /></dd>
    </div>
  );
}
