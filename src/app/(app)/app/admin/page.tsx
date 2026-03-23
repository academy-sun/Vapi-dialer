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

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
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
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Painel Admin</span>
          </div>
          <h1 className="page-title">Visão Geral</h1>
          <p className="page-subtitle">
            Todas as contas ativas · Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")} · auto-refresh 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/admin/agents-monitor" className="btn-secondary flex items-center gap-2">
            <Users className="w-4 h-4" />
            Agentes
          </Link>
          <Link href="/app/admin/sandbox" className="btn-secondary flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Sandbox
          </Link>
          <button onClick={() => load()} disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
              <p className="text-sm text-gray-500">Contas totais</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalActive}</p>
              <p className="text-sm text-gray-500">Campanhas ativas</p>
            </div>
          </div>
        </div>
        {/* Live calls — card especial com pulse quando > 0 */}
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalLiveCalls > 0 ? "bg-green-100" : "bg-gray-100"}`}>
              <Activity className={`w-5 h-5 ${totalLiveCalls > 0 ? "text-green-600" : "text-gray-400"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-gray-900">{totalLiveCalls}</p>
                {totalLiveCalls > 0 && (
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
              </div>
              <p className="text-sm text-gray-500">Em ligação agora</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalLeads.toLocaleString("pt-BR")}</p>
              <p className="text-sm text-gray-500">Leads totais</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalCalls.toLocaleString("pt-BR")}</p>
              <p className="text-sm text-gray-500">Chamadas totais</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant list */}
      {loading && tenants.length === 0 ? (
        <div className="card p-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      ) : tenants.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">Nenhuma conta encontrada.</div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => {
            const worker = workerOf(t.id);
            return (
              <div key={t.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: identity */}
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>

                        {/* Live calls badge */}
                        {t.stats.active_calls > 0 && (
                          <span className="badge badge-green flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            {t.stats.active_calls} em ligação
                          </span>
                        )}

                        {t.stats.running_queues > 0 && (
                          <span className="badge badge-green">
                            {t.stats.running_queues} rodando
                          </span>
                        )}
                        {t.stats.vapi_configured ? (
                          <span className="badge badge-indigo flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Vapi OK
                          </span>
                        ) : (
                          <span className="badge badge-red flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Sem Vapi
                          </span>
                        )}

                        {/* Worker assignment badge */}
                        <span className="badge bg-gray-100 text-gray-500 flex items-center gap-1">
                          <Server className="w-3 h-3" /> Worker {worker}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Criado em {new Date(t.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        <span>·</span>
                        <span>{t.timezone}</span>
                        <span>·</span>
                        <span>{t.stats.members} membro{t.stats.members !== 1 ? "s" : ""}</span>
                        <span>·</span>
                        <span className="font-mono text-gray-300">{t.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: stats */}
                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    <StatCard label="Leads"    value={t.stats.leads.toLocaleString("pt-BR")} icon={Users}       color="bg-blue-100 text-blue-600" />
                    <StatCard label="Chamadas" value={t.stats.calls.toLocaleString("pt-BR")} icon={PhoneCall}   color="bg-purple-100 text-purple-600" />
                    <StatCard label="Filas"    value={t.stats.queues}                         icon={ListOrdered} color="bg-indigo-100 text-indigo-600" />
                  </div>
                </div>

                {/* Campanhas ativas com controles de pause/stop */}
                {t.campaigns.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-50 space-y-2">
                    {t.campaigns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${c.status === "running" ? "bg-green-500 animate-pulse" : "bg-amber-400"}`} />
                          <span className="text-sm font-medium text-gray-700 truncate">{c.name}</span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {c.status === "running" ? "Rodando" : "Pausada"} · {c.concurrency} simultâneas
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {c.status === "running" && (
                            <button
                              onClick={() => campaignAction(t.id, c.id, "pause")}
                              disabled={actionLoading !== null}
                              title="Pausar — leads ficam na fila, pode retomar depois"
                              className="btn btn-sm bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center gap-1 text-xs px-2 py-1"
                            >
                              {actionLoading === `${c.id}-pause`
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Pause className="w-3 h-3" />}
                              Pausar
                            </button>
                          )}
                          <button
                            onClick={() => campaignAction(t.id, c.id, "stop")}
                            disabled={actionLoading !== null}
                            title="Encerrar definitivamente — para reiniciar crie uma nova campanha"
                            className="btn btn-sm bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1 text-xs px-2 py-1"
                          >
                            {actionLoading === `${c.id}-stop`
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Square className="w-3 h-3" />}
                            Encerrar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <button
                    onClick={() => {
                      localStorage.setItem("activeTenantId", t.id);
                      window.location.href = `/app/tenants/${t.id}/queues`;
                    }}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    Acessar conta
                  </button>
                  <Link
                    href={`/app/admin/sandbox?tenantId=${t.id}`}
                    className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Testar no sandbox
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      <p className="text-center text-xs text-gray-300 mt-8">
        Visível apenas para administradores · {tenants.length} contas · {totalVapi} com Vapi configurado · {DISPLAY_WORKER_COUNT} workers ativos
      </p>
    </div>
  );
}
