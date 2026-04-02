"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2, Users, PhoneCall, ListOrdered, CheckCircle2,
  XCircle, Loader2, RefreshCw, FlaskConical, TrendingUp,
  Zap, Clock, Pause, Square, Activity, Server,
} from "lucide-react";

// Quantos workers estão configurados no Railway (ajustar ao escalar)
const DISPLAY_WORKER_COUNT = 2;

interface Campaign {
  id: string;
  name: string;
  status: "running" | "paused";
  concurrency: number;
}

interface TenantStats {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
  stats: {
    leads: number;
    calls: number;
    queues: number;
    running_queues: number;
    vapi_configured: boolean;
    members: number;
    active_calls: number;
  };
  campaigns: Campaign[];
}

export default function AdminOverviewPage() {
  const [tenants, setTenants] = useState<TenantStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetch("/api/admin/tenants");
    const data = await res.json();
    if (res.ok) {
      setTenants(data.tenants ?? []);
      setLastRefresh(new Date());
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh a cada 30s para manter live count atualizado
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Worker assignment: ordena tenants por id (mesmo critério do worker)
  // e retorna qual worker (1-based) cuida de cada tenant
  const tenantsSortedById = [...tenants].sort((a, b) => a.id.localeCompare(b.id));
  const workerOf = (tenantId: string): number => {
    const idx = tenantsSortedById.findIndex((t) => t.id === tenantId);
    return idx >= 0 ? (idx % DISPLAY_WORKER_COUNT) + 1 : 1;
  };

  async function campaignAction(tenantId: string, queueId: string, action: "pause" | "stop") {
    setActionLoading(`${queueId}-${action}`);
    try {
      await fetch(`/api/tenants/${tenantId}/queues/${queueId}/${action}`, { method: "POST" });
      await load(true);
    } finally {
      setActionLoading(null);
    }
  }

  const totalLeads      = tenants.reduce((s, t) => s + t.stats.leads, 0);
  const totalCalls      = tenants.reduce((s, t) => s + t.stats.calls, 0);
  const totalActive     = tenants.filter((t) => t.stats.running_queues > 0).length;
  const totalVapi       = tenants.filter((t) => t.stats.vapi_configured).length;
  const totalLiveCalls  = tenants.reduce((s, t) => s + t.stats.active_calls, 0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span
              className="admin-badge"
              style={{ color: "var(--red)", background: "var(--red-lo)", border: "1px solid rgba(232,0,45,0.3)" }}
            >
              <Zap style={{ width: 10, height: 10 }} />
              PAINEL ADMIN
            </span>
          </div>
          <h1 className="page-title">Visão Geral</h1>
          <p className="page-subtitle">
            Todas as contas ativas · Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")} · auto-refresh 30s
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/app/admin/agents-monitor" className="cx-filter-btn" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Users style={{ width: 12, height: 12 }} />
            Agentes
          </Link>
          <Link href="/app/admin/sandbox" className="cx-filter-btn" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <FlaskConical style={{ width: 12, height: 12 }} />
            Sandbox
          </Link>
          <button onClick={() => load()} disabled={loading} className="cx-refresh-btn">
            {loading ? <Loader2 style={{ width: 13, height: 13, animation: "cx-spin .8s linear infinite" }} /> : <RefreshCw style={{ width: 13, height: 13 }} />}
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid" style={{ marginBottom: 18 }}>
        {/* Contas totais */}
        <div className="admin-kpi">
          <div className="ak-icon" style={{ background: "rgba(232,0,45,0.12)" }}>
            <Building2 style={{ width: 15, height: 15, color: "var(--red)" }} />
          </div>
          <div>
            <div className="ak-val">{tenants.length}</div>
            <div className="ak-label">Contas totais</div>
          </div>
        </div>

        {/* Campanhas ativas */}
        <div className="admin-kpi">
          <div className="ak-icon" style={{ background: "rgba(0,214,143,0.12)" }}>
            <TrendingUp style={{ width: 15, height: 15, color: "var(--green)" }} />
          </div>
          <div>
            <div className="ak-val">{totalActive}</div>
            <div className="ak-label">Campanhas ativas</div>
          </div>
        </div>

        {/* Em ligação agora */}
        <div className="admin-kpi">
          <div className="ak-icon" style={{ background: "rgba(255,184,0,0.12)" }}>
            <Activity style={{ width: 15, height: 15, color: "var(--yellow)" }} />
          </div>
          <div>
            <div className="ak-val" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {totalLiveCalls}
              {totalLiveCalls > 0 && <span className="admin-live-dot" />}
            </div>
            <div className="ak-label">Em ligação agora</div>
          </div>
        </div>

        {/* Leads totais */}
        <div className="admin-kpi">
          <div className="ak-icon" style={{ background: "rgba(168,85,247,0.12)" }}>
            <Users style={{ width: 15, height: 15, color: "var(--purple)" }} />
          </div>
          <div>
            <div className="ak-val">{totalLeads.toLocaleString("pt-BR")}</div>
            <div className="ak-label">Leads totais</div>
          </div>
        </div>

        {/* Chamadas totais */}
        <div className="admin-kpi">
          <div className="ak-icon" style={{ background: "rgba(0,194,255,0.12)" }}>
            <PhoneCall style={{ width: 15, height: 15, color: "var(--cyan)" }} />
          </div>
          <div>
            <div className="ak-val">{totalCalls.toLocaleString("pt-BR")}</div>
            <div className="ak-label">Chamadas totais</div>
          </div>
        </div>
      </div>

      {/* Tenant list */}
      {loading && tenants.length === 0 ? (
        <div className="gc cx-loading" style={{ padding: 64 }}>
          <div className="cx-spinner" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="gc" style={{ padding: 64, textAlign: "center", color: "var(--text-3)" }}>
          Nenhuma conta encontrada.
        </div>
      ) : (
        <div>
          {tenants.map((t) => {
            const worker = workerOf(t.id);
            const hasRunning = t.stats.running_queues > 0;
            return (
              <div key={t.id} className={`admin-tenant-card${hasRunning ? " running" : ""}`}>
                <div className="admin-tenant-header">
                  {/* Icon */}
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    <Building2 style={{ width: 15, height: 15, color: "var(--text-2)" }} />
                  </div>

                  {/* Name + badges + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="admin-tenant-name">{t.name}</span>

                      {/* Live calls badge */}
                      {t.stats.active_calls > 0 && (
                        <span className="badge badge-green" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="admin-live-dot" />
                          {t.stats.active_calls} em ligação
                        </span>
                      )}

                      {hasRunning && (
                        <span className="admin-badge" style={{ color: "#fff", background: "var(--green)" }}>
                          {t.stats.running_queues} rodando
                        </span>
                      )}

                      {t.stats.vapi_configured ? (
                        <span
                          className="admin-badge"
                          style={{ color: "var(--green)", background: "rgba(0,214,143,0.1)", border: "1px solid rgba(0,214,143,0.2)" }}
                        >
                          <CheckCircle2 style={{ width: 10, height: 10 }} /> Vapi OK
                        </span>
                      ) : (
                        <span
                          className="admin-badge"
                          style={{ color: "var(--red)", background: "var(--red-lo)", border: "1px solid rgba(232,0,45,0.25)" }}
                        >
                          <XCircle style={{ width: 10, height: 10 }} /> Sem Vapi
                        </span>
                      )}

                      {/* Worker badge */}
                      <span
                        className="admin-badge"
                        style={{ color: "var(--text-3)", background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)" }}
                      >
                        <Server style={{ width: 10, height: 10 }} /> Worker {worker}
                      </span>
                    </div>

                    <div className="admin-tenant-meta" style={{ marginTop: 4 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock style={{ width: 11, height: 11 }} />
                        Criado em {new Date(t.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      <span>·</span>
                      <span>{t.timezone}</span>
                      <span>·</span>
                      <span>{t.stats.members} membro{t.stats.members !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{t.id.slice(0, 8)}...</span>
                    </div>
                  </div>

                  {/* Right: stats */}
                  <div className="admin-tenant-stats">
                    <div className="admin-tenant-stat">
                      <div className="ats-icon" style={{ background: "rgba(168,85,247,0.12)" }}>
                        <Users style={{ width: 12, height: 12, color: "var(--purple)" }} />
                      </div>
                      <div>
                        <div className="ats-val">{t.stats.leads.toLocaleString("pt-BR")}</div>
                        <div className="ats-label">Leads</div>
                      </div>
                    </div>
                    <div className="admin-tenant-stat">
                      <div className="ats-icon" style={{ background: "rgba(0,194,255,0.12)" }}>
                        <PhoneCall style={{ width: 12, height: 12, color: "var(--cyan)" }} />
                      </div>
                      <div>
                        <div className="ats-val">{t.stats.calls.toLocaleString("pt-BR")}</div>
                        <div className="ats-label">Chamadas</div>
                      </div>
                    </div>
                    <div className="admin-tenant-stat">
                      <div className="ats-icon" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <ListOrdered style={{ width: 12, height: 12, color: "var(--text-2)" }} />
                      </div>
                      <div>
                        <div className="ats-val">{t.stats.queues}</div>
                        <div className="ats-label">Filas</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Campanhas ativas com controles de pause/stop */}
                {t.campaigns.length > 0 && (
                  <div>
                    {t.campaigns.map((c) => (
                      <div key={c.id} className="admin-queue-row">
                        <span
                          style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: c.status === "running" ? "var(--green)" : "var(--yellow)",
                            ...(c.status === "running" ? { animation: "pulse-red 2s infinite" } : {}),
                          }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {c.status === "running" ? "Rodando" : "Pausada"} · {c.concurrency} simultâneas
                        </span>
                        <div style={{ flex: 1 }} />
                        {c.status === "running" && (
                          <button
                            onClick={() => campaignAction(t.id, c.id, "pause")}
                            disabled={actionLoading !== null}
                            title="Pausar — leads ficam na fila, pode retomar depois"
                            className="cx-filter-btn"
                            style={{ fontSize: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 4, color: "var(--yellow)", borderColor: "rgba(255,184,0,0.3)" }}
                          >
                            {actionLoading === `${c.id}-pause`
                              ? <Loader2 style={{ width: 10, height: 10, animation: "cx-spin .8s linear infinite" }} />
                              : <Pause style={{ width: 10, height: 10 }} />}
                            Pausar
                          </button>
                        )}
                        <button
                          onClick={() => campaignAction(t.id, c.id, "stop")}
                          disabled={actionLoading !== null}
                          title="Encerrar definitivamente — para reiniciar crie uma nova campanha"
                          className="cx-filter-btn"
                          style={{ fontSize: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 4, color: "var(--red)", borderColor: "rgba(232,0,45,0.3)" }}
                        >
                          {actionLoading === `${c.id}-stop`
                            ? <Loader2 style={{ width: 10, height: 10, animation: "cx-spin .8s linear infinite" }} />
                            : <Square style={{ width: 10, height: 10 }} />}
                          Encerrar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="admin-tenant-actions">
                  <button
                    onClick={() => {
                      localStorage.setItem("activeTenantId", t.id);
                      window.location.href = `/app/tenants/${t.id}/queues`;
                    }}
                    className="cx-filter-btn"
                    style={{ fontSize: 11 }}
                  >
                    Acessar conta
                  </button>
                  <Link
                    href={`/app/admin/sandbox?tenantId=${t.id}`}
                    className="cx-filter-btn"
                    style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <FlaskConical style={{ width: 11, height: 11 }} />
                    Testar no sandbox
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3)", marginTop: 24 }}>
        Visível apenas para administradores · {tenants.length} contas · {totalVapi} com Vapi configurado · {DISPLAY_WORKER_COUNT} workers ativos
      </p>
    </div>
  );
}
