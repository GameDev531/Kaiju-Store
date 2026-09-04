import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { requirePermissionContext, csrfToken, getAuth } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { orderTimeline } from "@/server/domain/orders";
import { allowedTransitions } from "@/server/domain/order-state";
import { readAuditTrail } from "@/server/domain/audit";
import { OrderInterventionForm, RefundForm } from "@/components/admin/forms";
import { adminTransitionOrderAction, adminRefundAction } from "../../actions";
import { Breadcrumbs, Label, SectionHead, Badge, Notice, MoneyText } from "@/components/ui";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/server/domain/enums";

export const metadata: Metadata = { title: "Pedido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  await requirePermissionContext("admin.order.read");
  const auth = await getAuth();

  const order = await db.order.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      user: { select: { id: true, email: true, displayName: true, createdAt: true } },
      items: { include: { designVersion: true, quotation: true } },
      payments: true,
      refunds: true,
      shipments: { include: { events: { orderBy: { occurredAt: "desc" }, take: 10 } } },
      jobs: { include: { producer: { select: { studioName: true, city: true, state: true } }, stages: true, checks: true } },
      disputes: true,
      shippingAddress: true,
      coupon: { select: { code: true } },
    },
  });
  if (!order) notFound();

  const [timeline, audit, csrfTransition, csrfRefund] = await Promise.all([
    orderTimeline(order.id),
    readAuditTrail("Order", order.id, 50),
    csrfToken("admin.order.transition"),
    csrfToken("admin.refund"),
  ]);

  const canWrite = auth ? hasPermission(auth.user.roles, "admin.order.write") : false;
  const canRefund = auth ? hasPermission(auth.user.roles, "admin.refund.issue") : false;

  const captured = order.payments.filter((p) => p.status === "CAPTURED").reduce((s, p) => s + p.amountCents, 0);
  const refunded = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountCents, 0);
  const available = captured - refunded;

  const transitions = allowedTransitions(order.status as OrderStatus, "ADMIN");
  const labels = Object.fromEntries(
    (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => [s, ORDER_STATUS_LABELS[s].pt]),
  );

  return (
    <div>
      <Breadcrumbs trail={[{ href: "/admin", label: "Administração" }, { href: "/admin/pedidos", label: "Pedidos" }, { label: order.reference }]} />

      <header style={{ marginTop: "1.5rem", display: "flex", gap: "1.5rem", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <Label>Pedido</Label>
          <h1 className="t-display-sm t-mono" style={{ marginTop: "0.6rem" }}>{order.reference}</h1>
          <p style={{ fontSize: "0.9rem", color: "var(--color-ink-faint)", marginTop: "0.35rem" }}>
            {order.user.displayName} · <span className="t-mono">{order.user.email}</span>
          </p>
        </div>
        <Badge tone={["ON_HOLD", "DISPUTED"].includes(order.status) ? "shu" : "ink"}>
          {ORDER_STATUS_LABELS[order.status as OrderStatus].pt}
        </Badge>
      </header>

      {order.holdReason ? (
        <div style={{ marginTop: "1.5rem" }}>
          <Notice tone="attention" title="Motivo da retenção">{order.holdReason}</Notice>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", marginTop: "2.5rem" }}>
        <div>
          <section>
            <SectionHead label="Conteúdo" title="Itens" />
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col">Ficha</th><th scope="col" className="num">Valor</th></tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{item.titleSnapshot}</span>
                        <span style={{ display: "block", fontSize: "0.78rem", color: "var(--color-ink-faint)" }}>
                          {item.kind} · {item.quantity} un.
                        </span>
                      </td>
                      <td className="t-mono" style={{ fontSize: "0.72rem" }}>
                        {item.designVersion?.specHash ? `${item.designVersion.specHash.slice(0, 16)}…` : "—"}
                        {item.designVersion ? (
                          <span style={{ display: "block", color: "var(--color-ink-faint)" }}>v{item.designVersion.version}</span>
                        ) : null}
                      </td>
                      <td className="num"><MoneyText cents={item.totalPriceCents} currency={order.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: "3rem" }}>
            <SectionHead label="Produção" title="Trabalhos" />
            {order.jobs.length === 0 ? (
              <p style={{ color: "var(--color-ink-faint)" }}>Nenhum trabalho criado ainda.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {order.jobs.map((job) => (
                  <div key={job.id} className="panel" style={{ padding: "1.15rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <div>
                        <p className="t-mono" style={{ fontSize: "0.78rem", color: "var(--color-ink-faint)" }}>{job.reference}</p>
                        <p style={{ fontWeight: 650, marginTop: "0.2rem" }}>
                          {job.producer ? `${job.producer.studioName} · ${job.producer.city}/${job.producer.state}` : "Sem ateliê atribuído"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                        <Badge>{job.role}</Badge>
                        <Badge tone={job.status === "UNASSIGNED" ? "shu" : "default"}>{job.status}</Badge>
                        {job.matchScore !== null ? <Badge>score {job.matchScore}</Badge> : null}
                      </div>
                    </div>
                    {job.checks.length > 0 ? (
                      <p style={{ fontSize: "0.82rem", marginTop: "0.75rem" }}>
                        Última conferência: <strong>{job.checks[job.checks.length - 1]!.result}</strong>
                      </p>
                    ) : null}
                    {job.matchExplanationJson ? (
                      <details style={{ marginTop: "0.85rem" }}>
                        <summary style={{ cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
                          Por que este ateliê foi escolhido
                        </summary>
                        <pre className="t-mono panel-sunk" style={{ padding: "0.85rem", marginTop: "0.6rem", fontSize: "0.7rem", overflowX: "auto" }}>
                          {JSON.stringify(JSON.parse(job.matchExplanationJson), null, 2).slice(0, 2000)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginTop: "3rem" }}>
            <SectionHead label="Histórico" title="Estados e auditoria" />
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr><th scope="col">Quando</th><th scope="col">Estado</th><th scope="col">Ator</th><th scope="col">Motivo</th></tr>
                </thead>
                <tbody>
                  {timeline.map((t, i) => (
                    <tr key={i}>
                      <td className="t-mono" style={{ fontSize: "0.75rem" }}>
                        {t.at.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{ORDER_STATUS_LABELS[t.status].pt}</td>
                      <td style={{ fontSize: "0.8rem" }}>{t.actorType}</td>
                      <td style={{ fontSize: "0.8rem" }}>{t.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {audit.length > 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-faint)", marginTop: "0.85rem" }}>
                {audit.length} entrada(s) de auditoria neste pedido.{" "}
                <Link href={`/admin/auditoria?alvo=Order`} className="link">Ver auditoria completa</Link>
              </p>
            ) : null}
          </section>
        </div>

        <aside>
          <section>
            <SectionHead label="Financeiro" title="Valores" />
            <div className="panel" style={{ padding: "1.25rem" }}>
              <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.9rem" }}>
                {[
                  ["Subtotal", order.subtotalCents],
                  ["Desconto", -order.discountCents],
                  ["Frete", order.shippingCents],
                  ["Total", order.totalCents],
                  ["Capturado", captured],
                  ["Reembolsado", -refunded],
                  ["Disponível", available],
                ].map(([label, cents]) => (
                  <div key={label as string} style={{ display: "flex", justifyContent: "space-between" }}>
                    <dt style={{ color: "var(--color-ink-soft)" }}>{label as string}</dt>
                    <dd style={{ margin: 0, fontWeight: label === "Total" || label === "Disponível" ? 700 : 400 }}>
                      <MoneyText cents={cents as number} currency={order.currency} />
                    </dd>
                  </div>
                ))}
              </dl>
              {order.coupon ? (
                <p style={{ fontSize: "0.82rem", marginTop: "0.85rem", color: "var(--color-ink-faint)" }}>
                  Cupom: <span className="t-mono">{order.coupon.code}</span>
                </p>
              ) : null}
            </div>

            {order.payments.length > 0 ? (
              <div className="panel-sunk" style={{ padding: "1.15rem", marginTop: "1rem" }}>
                <Label>Pagamentos</Label>
                {order.payments.map((p) => (
                  <p key={p.id} style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
                    <Badge tone={p.status === "CAPTURED" ? "ink" : p.status === "FAILED" ? "shu" : "default"}>{p.status}</Badge>{" "}
                    {p.method} · <MoneyText cents={p.amountCents} currency={p.currency} />
                    {p.instrumentLast4 ? <span className="t-mono"> ····{p.instrumentLast4}</span> : null}
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-ink-faint)" }}>
                      {p.providerRef}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          {canWrite ? (
            <section style={{ marginTop: "2.5rem" }}>
              <SectionHead label="Intervenção" title="Mover o pedido" />
              <OrderInterventionForm
                action={adminTransitionOrderAction}
                csrf={csrfTransition}
                orderId={order.id}
                allowed={transitions}
                labels={labels}
              />
            </section>
          ) : null}

          {canRefund ? (
            <section style={{ marginTop: "2.5rem" }}>
              <SectionHead label="Alto risco" title="Reembolso" />
              <RefundForm
                action={adminRefundAction}
                csrf={csrfRefund}
                orderId={order.id}
                availableCents={available}
                currency={order.currency}
              />
            </section>
          ) : (
            <section style={{ marginTop: "2.5rem" }}>
              <Notice tone="info" title="Você não tem permissão para reembolsar">
                Reembolsos exigem o papel de financeiro ou administrador, com verificação em duas
                etapas confirmada nos últimos 15 minutos.
              </Notice>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
