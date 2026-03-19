"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2, Users, PhoneCall, ListOrdered, CheckCircle2,
  XCircle, Loader2, RefreshCw, FlaskConical, TrendingUp,
  Zap, Clock,
} from "lucide-react";

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
  };
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

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/tenants");
    const data = await res.json();
    if (res.ok) {
      setTenants(data.tenants ?? []);
      setLastRefresh(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalLeads  = tenants.reduce((s, t) => s + t.stats.leads,  0);
  const totalCalls  = tenants.reduce((s, t) => s + t.stats.calls,  0);
  const totalActive = tenants.filter((t) => t.stats.running_queues > 0).length;
  const totalVapi   = tenants.filter((t) => t.stats.vapi_configured).length;

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
            Todas as contas ativas · Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/admin/sandbox" className="btn-secondary flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Sandbox
          </Link>
          <button onClick={load} disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
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
          {tenants.map((t) => (
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
                  <StatCard label="Leads"   value={t.stats.leads.toLocaleString("pt-BR")}  icon={Users}         color="bg-blue-100 text-blue-600" />
                  <StatCard label="Chamadas" value={t.stats.calls.toLocaleString("pt-BR")}  icon={PhoneCall}     color="bg-purple-100 text-purple-600" />
                  <StatCard label="Filas"   value={t.stats.queues}                          icon={ListOrdered}   color="bg-indigo-100 text-indigo-600" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                <button
                  onClick={() => {
                    localStorage.setItem("activeTenantId", t.id);
                    window.location.href = `/app/tenants/${t.id}/vapi`;
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
          ))}
        </div>
      )}

      {/* Footer info */}
      <p className="text-center text-xs text-gray-300 mt-8">
        Visível apenas para administradores · {tenants.length} contas · {totalVapi} com Vapi configurado
      </p>
    </div>
  );
}
