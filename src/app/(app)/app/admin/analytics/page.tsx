"use client";
import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, TrendingUp, PhoneCall, DollarSign, Clock,
  Users, Zap, Activity, Loader2, RefreshCw, CheckCircle2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Cards {
  totalCalls: number;
  answeredCalls: number;
  answerRate: number;
  totalCost: number;
  totalDurationMinutes: number;
  activeTenants: number;
  totalTenants: number;
  activeQueues: number;
  activeCalls: number;
}

interface DayEntry {
  date: string;
  total: number;
  answered: number;
  cost: number;
}

interface TenantEntry {
  id: string;
  name: string;
  total: number;
  answered: number;
  cost: number;
}

interface ReasonEntry {
  reason: string;
  count: number;
}

interface AnalyticsData {
  days: number;
  cards: Cards;
  callsByDay: DayEntry[];
  topTenants: TenantEntry[];
  endReasons: ReasonEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtCost(v: number) {
  return v < 0.01 ? "< $0.01" : `$${v.toFixed(2)}`;
}
function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtDuration(min: number) {
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const ANSWERED = new Set(["customer-ended-call", "assistant-ended-call", "exceeded-max-duration"]);
function reasonLabel(r: string) {
  const MAP: Record<string, string> = {
    "customer-ended-call":     "Cliente desligou",
    "assistant-ended-call":    "IA encerrou",
    "exceeded-max-duration":   "Tempo máximo",
    "customer-did-not-answer": "Sem resposta",
    "no-answer":               "Sem resposta",
    "customer-busy":           "Ocupado",
    "busy":                    "Ocupado",
    "voicemail":               "Caixa postal",
    "silence-timed-out":       "Silêncio",
  };
  if (r in MAP) return MAP[r];
  if (r.includes("sip")) return "Erro SIP";
  if (r.includes("pipeline")) return "Erro pipeline";
  if (r.includes("transport")) return "Erro transporte";
  if (r.includes("vapifault")) return "Erro Vapi infra";
  if (r.includes("providerfault")) return "Erro provedor";
  return r;
}

// ── Barra simples ──────────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// ── Card de métrica ────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon: Icon, color,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Gráfico de barras manual ───────────────────────────────────────────────────
function CallsChart({ data, days }: { data: DayEntry[]; days: number }) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  // Para muitos dias, mostrar apenas alguns labels
  const labelEvery = days <= 14 ? 1 : days <= 30 ? 3 : 7;

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Chamadas por Dia</h3>
      <div className="flex items-end gap-0.5 h-40">
        {data.map((d, i) => {
          const totalH  = Math.round((d.total    / maxTotal) * 160);
          const answH   = Math.round((d.answered / maxTotal) * 160);
          const showLabel = i % labelEvery === 0;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="w-full flex flex-col-reverse" style={{ height: 160 }}>
                {/* Barra total (cinza claro) */}
                <div
                  className="w-full bg-indigo-100 rounded-t transition-all"
                  style={{ height: totalH }}
                />
                {/* Barra atendidas (sobre a total) */}
                <div
                  className="w-full bg-indigo-500 rounded-t absolute bottom-0"
                  style={{ height: answH }}
                />
              </div>
              {showLabel && (
                <span className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">
                  {fmtDate(d.date)}
                </span>
              )}
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap pointer-events-none">
                {fmtDate(d.date)}: {d.total} total / {d.answered} atendidas
                {d.cost > 0 && ` / ${fmtCost(d.cost)}`}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Atendidas
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-3 h-3 rounded-sm bg-indigo-100 inline-block" /> Total
        </span>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const [days,    setDays]    = useState(30);
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${d}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const c = data?.cards;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Analytics Global</h1>
            <p className="text-sm text-gray-500">Visão consolidada de todos os tenants</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro de período */}
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="btn-icon ml-2"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando analytics...
        </div>
      )}

      {data && (
        <>
          {/* Cards de métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total de Chamadas"
              value={c!.totalCalls.toLocaleString("pt-BR")}
              sub={`Últimos ${days} dias`}
              icon={PhoneCall}
              color="bg-indigo-50 text-indigo-600"
            />
            <MetricCard
              label="Atendidas"
              value={`${c!.answeredCalls.toLocaleString("pt-BR")} (${c!.answerRate}%)`}
              sub="Taxa de atendimento"
              icon={CheckCircle2}
              color="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="Custo Total"
              value={fmtCost(c!.totalCost)}
              sub={`${fmtDuration(c!.totalDurationMinutes)} de fala`}
              icon={DollarSign}
              color="bg-amber-50 text-amber-600"
            />
            <MetricCard
              label="Tenants Ativos"
              value={`${c!.activeTenants} / ${c!.totalTenants}`}
              sub={`${c!.activeQueues} filas • ${c!.activeCalls} em ligação agora`}
              icon={Users}
              color="bg-violet-50 text-violet-600"
            />
          </div>

          {/* Live status */}
          {(c!.activeCalls > 0 || c!.activeQueues > 0) && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-sm text-emerald-800 font-medium">
                {c!.activeCalls} chamada{c!.activeCalls !== 1 ? "s" : ""} ativa{c!.activeCalls !== 1 ? "s" : ""} agora
                {c!.activeQueues > 0 && ` · ${c!.activeQueues} fila${c!.activeQueues !== 1 ? "s" : ""} rodando`}
              </span>
            </div>
          )}

          {/* Gráfico */}
          <CallsChart data={data.callsByDay} days={days} />

          {/* Top tenants + Motivos de encerramento */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top tenants */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Top Tenants por Volume
              </h3>
              {data.topTenants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sem dados no período</p>
              ) : (
                <div className="space-y-3">
                  {data.topTenants.map((t) => {
                    const rate = t.total > 0 ? Math.round((t.answered / t.total) * 100) : 0;
                    const maxT = data.topTenants[0].total;
                    return (
                      <div key={t.id}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="font-medium text-gray-700 truncate max-w-[140px]">{t.name}</span>
                          <span className="text-gray-500 shrink-0 ml-2">
                            {t.total.toLocaleString("pt-BR")} calls · {rate}% · {fmtCost(t.cost)}
                          </span>
                        </div>
                        <MiniBar pct={(t.total / maxT) * 100} color="bg-indigo-400" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Motivos de encerramento */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Motivos de Encerramento
              </h3>
              {data.endReasons.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sem dados no período</p>
              ) : (
                <div className="space-y-2">
                  {data.endReasons.map(({ reason, count }) => {
                    const total = data.endReasons.reduce((s, r) => s + r.count, 0);
                    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isAnswered = ANSWERED.has(reason);
                    return (
                      <div key={reason}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className={`font-medium truncate max-w-[160px] ${isAnswered ? "text-emerald-700" : "text-gray-600"}`}>
                            {reasonLabel(reason)}
                          </span>
                          <span className="text-gray-400 shrink-0 ml-2">{count.toLocaleString("pt-BR")} ({pct}%)</span>
                        </div>
                        <MiniBar
                          pct={pct}
                          color={isAnswered ? "bg-emerald-400" : "bg-gray-300"}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Custo médio por chamada */}
          {c!.totalCalls > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard
                label="Custo Médio / Chamada"
                value={fmtCost(c!.totalCost / c!.totalCalls)}
                icon={Zap}
                color="bg-orange-50 text-orange-500"
              />
              <MetricCard
                label="Duração Média / Chamada"
                value={`${Math.round((c!.totalDurationMinutes * 60) / c!.totalCalls)}s`}
                sub="Todas as chamadas"
                icon={Clock}
                color="bg-sky-50 text-sky-500"
              />
              {c!.answeredCalls > 0 && (
                <MetricCard
                  label="Custo Médio / Atendida"
                  value={fmtCost(c!.totalCost / c!.answeredCalls)}
                  sub="Apenas chamadas atendidas"
                  icon={DollarSign}
                  color="bg-teal-50 text-teal-500"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
