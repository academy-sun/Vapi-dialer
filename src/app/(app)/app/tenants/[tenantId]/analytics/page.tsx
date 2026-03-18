"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  RefreshCw,
  Phone,
  PhoneOff,
  PhoneCall,
  DollarSign,
  Clock,
  Timer,
  Users,
  CheckCircle2,
  BarChart3,
  Loader2,
} from "lucide-react";

interface AnalyticsData {
  totalCalls: number;
  answeredCalls: number;
  notAnsweredCalls: number;
  totalCost: number;
  totalDurationSec: number;
  avgDurationSec: number;
  totalLeads: number;
  structuredSuccessCalls: number;
  structuredWithOutput: number;
  byHour: Record<string, number>;
  byWeekday: Record<string, number>;
}

function formatDurationLong(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

// Simple CSS bar chart
function BarChart({
  data,
  labels,
  maxVal,
  color = "bg-indigo-500",
}: {
  data: number[];
  labels: string[];
  maxVal: number;
  color?: string;
}) {
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-t-sm ${color} transition-all`}
            style={{ height: maxVal > 0 ? `${(val / maxVal) * 100}%` : "0%" }}
            title={`${labels[i]}: ${val}`}
          />
          <span className="text-gray-400 text-[9px] leading-none">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

const WEEKDAY_LABELS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`);

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color = "text-indigo-600",
  bg = "bg-indigo-50",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  bg?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/analytics`);
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
    setRefreshing(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const hourData = data
    ? Array.from({ length: 24 }, (_, h) => data.byHour[String(h)] ?? 0)
    : [];
  const weekData = data
    ? Array.from({ length: 7 }, (_, i) => data.byWeekday[String(i + 1)] ?? 0)
    : [];
  const maxHour = Math.max(1, ...hourData);
  const maxWeek = Math.max(1, ...weekData);

  const answeredPct = data ? Math.round((data.answeredCalls / Math.max(data.totalCalls, 1)) * 100) : 0;
  const successPct  = data && data.structuredWithOutput > 0
    ? Math.round((data.structuredSuccessCalls / data.structuredWithOutput) * 100)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Visão geral das campanhas de discagem</p>
        </div>
        <button
          onClick={() => load(true)}
          className="btn-secondary"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      ) : !data ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-state-title">Sem dados disponíveis</p>
            <p className="empty-state-desc">Inicie uma fila de discagem para ver métricas aqui.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Stat Cards row 1 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total de Leads"
              value={data.totalLeads.toLocaleString("pt-BR")}
              icon={Users}
              color="text-indigo-600"
              bg="bg-indigo-50"
            />
            <StatCard
              title="Total de Chamadas"
              value={data.totalCalls.toLocaleString("pt-BR")}
              icon={PhoneCall}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <StatCard
              title="Chamadas Atendidas"
              value={data.answeredCalls.toLocaleString("pt-BR")}
              sub={`${answeredPct}% do total`}
              icon={Phone}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
            <StatCard
              title="Não Atendidas"
              value={data.notAnsweredCalls.toLocaleString("pt-BR")}
              sub={pct(data.notAnsweredCalls, data.totalCalls) + " do total"}
              icon={PhoneOff}
              color="text-red-500"
              bg="bg-red-50"
            />
          </div>

          {/* ── Stat Cards row 2 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Gasto Total"
              value={`$${data.totalCost.toFixed(4)}`}
              icon={DollarSign}
              color="text-amber-600"
              bg="bg-amber-50"
            />
            <StatCard
              title="Tempo Total em Chamada"
              value={formatDurationLong(data.totalDurationSec)}
              icon={Clock}
              color="text-purple-600"
              bg="bg-purple-50"
            />
            <StatCard
              title="Tempo Médio por Chamada"
              value={formatDurationShort(data.avgDurationSec)}
              sub="Apenas chamadas com duração"
              icon={Timer}
              color="text-cyan-600"
              bg="bg-cyan-50"
            />
            <StatCard
              title="Structured Outputs: Sucesso"
              value={successPct != null ? `${successPct}%` : "—"}
              sub={
                data.structuredWithOutput > 0
                  ? `${data.structuredSuccessCalls}/${data.structuredWithOutput} avaliados`
                  : "Nenhum structured output registrado"
              }
              icon={CheckCircle2}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
          </div>

          {/* ── Progress bars ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Answer rate */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Taxa de Atendimento</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <Phone className="w-3.5 h-3.5" /> Atendidas
                    </span>
                    <span className="font-semibold">{data.answeredCalls} ({pct(data.answeredCalls, data.totalCalls)})</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: pct(data.answeredCalls, data.totalCalls) }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                    <span className="flex items-center gap-1.5 text-red-500 font-medium">
                      <PhoneOff className="w-3.5 h-3.5" /> Não atendidas
                    </span>
                    <span className="font-semibold">{data.notAnsweredCalls} ({pct(data.notAnsweredCalls, data.totalCalls)})</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full transition-all"
                      style={{ width: pct(data.notAnsweredCalls, data.totalCalls) }}
                    />
                  </div>
                </div>
                {data.structuredWithOutput > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span className="flex items-center gap-1.5 text-indigo-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sucesso (Structured Output)
                      </span>
                      <span className="font-semibold">
                        {data.structuredSuccessCalls} ({pct(data.structuredSuccessCalls, data.structuredWithOutput)})
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: pct(data.structuredSuccessCalls, data.structuredWithOutput) }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cost summary */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Resumo de Custos</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600">Custo total</span>
                  <span className="font-mono font-semibold text-gray-900">${data.totalCost.toFixed(4)}</span>
                </div>
                {data.answeredCalls > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Custo médio por chamada atendida</span>
                    <span className="font-mono font-semibold text-gray-900">
                      ${(data.totalCost / data.answeredCalls).toFixed(4)}
                    </span>
                  </div>
                )}
                {data.totalCalls > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Custo médio por chamada</span>
                    <span className="font-mono font-semibold text-gray-900">
                      ${(data.totalCost / data.totalCalls).toFixed(4)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Tempo total em ligação</span>
                  <span className="font-semibold text-gray-900">
                    {formatDurationLong(data.totalDurationSec)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By weekday */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Volume por Dia da Semana
                </h3>
              </div>
              {weekData.every((v) => v === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda</p>
              ) : (
                <BarChart
                  data={weekData}
                  labels={WEEKDAY_LABELS.slice(1)}
                  maxVal={maxWeek}
                  color="bg-indigo-500"
                />
              )}
            </div>

            {/* By hour */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Volume por Hora do Dia (UTC)
                </h3>
              </div>
              {hourData.every((v) => v === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda</p>
              ) : (
                <BarChart
                  data={hourData}
                  labels={HOUR_LABELS}
                  maxVal={maxHour}
                  color="bg-purple-400"
                />
              )}
              <p className="text-xs text-gray-400 mt-2">
                * Horários em UTC — converta para seu fuso horário conforme necessário
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
