import type { Metadata } from "next";
import { db } from "@/server/db";
import { requirePermissionContext } from "@/server/auth/session";
import { storageStats } from "@/server/storage";
import { activeProviderName } from "@/server/ai";
import { env } from "@/server/lib/env";
import { Label, SectionHead, Badge, Notice, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Saúde do sistema", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  await requirePermissionContext("admin.system.read");

  const [queueByStatus, deadJobs, webhooks, flags, storage, aiStats, pendingScans] = await Promise.all([
    db.jobQueueItem.groupBy({ by: ["queue", "status"], _count: { _all: true } }),
    db.jobQueueItem.findMany({ where: { status: "DEAD" }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.webhookEvent.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
    db.featureFlag.findMany({ orderBy: { key: "asc" } }),
    storageStats(),
    db.aIAnalysis.groupBy({ by: ["status"], _count: { _all: true }, _avg: { latencyMs: true } }),
    db.storedFile.count({ where: { scanStatus: "PENDING", deletedAt: null } }),
  ]);

  const stuck = queueByStatus
    .filter((q) => q.status === "PENDING")
    .reduce((sum, q) => sum + q._count._all, 0);

  return (
    <div>
      <Label>Operação técnica</Label>
      <h1 className="t-display-sm" style={{ marginTop: "0.6rem" }}>Saúde do sistema</h1>

      <section style={{ marginTop: "2.5rem" }}>
        <SectionHead label="Configuração" title="Ambiente" />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            ["Ambiente", env.APP_ENV],
            ["Provedor de IA", activeProviderName()],
            ["Provedor de pagamento", env.PAYMENT_PROVIDER],
            ["Transportadora", env.SHIPPING_PROVIDER],
          ].map(([label, value]) => (
            <div key={label} className="panel-sunk" style={{ padding: "1.1rem" }}>
              <p className="t-label">{label}</p>
              <p className="t-mono" style={{ fontSize: "1.05rem", fontWeight: 650, marginTop: "0.35rem" }}>{value}</p>
            </div>
          ))}
        </div>
        {env.APP_ENV !== "production" ? (
          <div style={{ marginTop: "1.25rem" }}>
            <Notice tone="attention" title={`Este ambiente é "${env.APP_ENV}"`}>
              Provedores simulados podem estar ativos. Nenhum dinheiro real se move e nenhuma etiqueta
              real é emitida em um ambiente que não seja produção.
            </Notice>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Trabalho assíncrono" title="Filas" />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "1.5rem" }}>
          {[
            ["Pendentes", stuck, stuck > 100],
            ["Mortos", deadJobs.length, deadJobs.length > 0],
            ["Arquivos aguardando verificação", pendingScans, pendingScans > 50],
          ].map(([label, value, urgent]) => (
            <div key={label as string} className="panel-sunk" style={{ padding: "1.1rem", borderColor: urgent ? "var(--color-shu)" : undefined }}>
              <p className="t-label">{label as string}</p>
              <p className="t-num" style={{ fontSize: "1.65rem", fontWeight: 700, marginTop: "0.35rem", color: urgent ? "var(--color-shu)" : "inherit" }}>
                {value as number}
              </p>
            </div>
          ))}
        </div>

        {queueByStatus.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum trabalho na fila" description="Nada enfileirado no momento." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Fila</th><th scope="col">Situação</th><th scope="col" className="num">Itens</th></tr>
              </thead>
              <tbody>
                {queueByStatus.map((q) => (
                  <tr key={`${q.queue}-${q.status}`}>
                    <td className="t-mono" style={{ fontSize: "0.82rem" }}>{q.queue}</td>
                    <td><Badge tone={q.status === "DEAD" ? "shu" : "default"}>{q.status}</Badge></td>
                    <td className="num">{q._count._all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {deadJobs.length > 0 ? (
          <div style={{ marginTop: "1.5rem" }}>
            <Notice tone="blocking" title={`${deadJobs.length} trabalho(s) esgotaram as tentativas`}>
              Estes não serão reprocessados automaticamente. Cada um representa algo que deveria ter
              acontecido e não aconteceu — notificação não enviada, verificação não feita, produtor não
              acionado.
            </Notice>
            <div className="table-scroll" style={{ marginTop: "1rem" }}>
              <table className="table">
                <thead>
                  <tr><th scope="col">Fila</th><th scope="col">Tentativas</th><th scope="col">Erro</th></tr>
                </thead>
                <tbody>
                  {deadJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="t-mono" style={{ fontSize: "0.8rem" }}>{j.queue}</td>
                      <td className="num">{j.attempts}/{j.maxAttempts}</td>
                      <td style={{ fontSize: "0.78rem", maxWidth: "28rem" }}>{j.lastError ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Integrações" title="Webhooks recebidos" />
        {webhooks.length === 0 ? (
          <EmptyState mark="◇" title="Nenhum webhook recebido" description="Eventos de pagamento e de transportadora aparecem aqui." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Provedor</th><th scope="col">Situação</th><th scope="col" className="num">Eventos</th></tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={`${w.provider}-${w.status}`}>
                    <td>{w.provider}</td>
                    <td><Badge tone={w.status === "FAILED" ? "shu" : "default"}>{w.status}</Badge></td>
                    <td className="num">{w._count._all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="IA" title="Análises" />
        {aiStats.length === 0 ? (
          <EmptyState mark="◇" title="Nenhuma análise executada" description="As estatísticas aparecem depois da primeira ficha gerada." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Situação</th><th scope="col" className="num">Total</th><th scope="col" className="num">Latência média</th></tr>
              </thead>
              <tbody>
                {aiStats.map((a) => (
                  <tr key={a.status}>
                    <td><Badge tone={a.status === "FAILED" ? "shu" : "default"}>{a.status}</Badge></td>
                    <td className="num">{a._count._all}</td>
                    <td className="num">{a._avg.latencyMs ? `${Math.round(a._avg.latencyMs)} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Armazenamento" title="Arquivos" />
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            ["Arquivos ativos", storage.files.toLocaleString("pt-BR")],
            ["Espaço usado", `${(storage.bytes / 1024 / 1024).toFixed(1)} MB`],
            ["Aguardando verificação", String(storage.pendingScans)],
          ].map(([label, value]) => (
            <div key={label} className="panel-sunk" style={{ padding: "1.1rem" }}>
              <p className="t-label">{label}</p>
              <p className="t-num" style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.35rem" }}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <SectionHead label="Configuração" title="Feature flags" />
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th scope="col">Chave</th><th scope="col">Estado</th><th scope="col">Descrição</th></tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id}>
                  <td className="t-mono" style={{ fontSize: "0.8rem" }}>{f.key}</td>
                  <td><Badge tone={f.enabled ? "ink" : "default"}>{f.enabled ? "ativa" : "desligada"}</Badge></td>
                  <td style={{ fontSize: "0.85rem" }}>{f.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
