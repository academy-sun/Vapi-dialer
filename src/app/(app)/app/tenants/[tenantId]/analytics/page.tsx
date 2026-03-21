"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, Phone, PhoneOff, PhoneCall, DollarSign, Clock,
  Timer, Users, CheckCircle2, BarChart3, Loader2, Bot, Filter,
} from "lucide-react";

interface Campaign { id: string; name: string; assistantId: string }
interface AssistantRef { id: string; name: string }

interface AnalyticsData {
  campaigns: Campaign[];
  assistants: AssistantRef[];
  selectedQueueId: string | null;
  selectedAssistantId: string | null;
  totalCalls: number;
  answeredCalls: number;
  notAnsweredCalls: number;
  totalCost: number;
  totalDurationSec: number;
  avgDurationSec: number;
  totalLeads: number;
  structuredSuccessCalls: number;
  structuredWithOutput: number;
  structuredOutputsConfigured: boolean;
  costPerConversion: number | null;
  byHour: Record<string, number>;
  byWeekday: Record<string, number>;
  statusBreakdown: Record<string, number>;
  engagementRate: number;
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

function BarChart({ data, labels, maxVal, color = "bg-indigo-500" }: {
  data: number[]; labels: string[]; maxVal: number; color?: string;
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

function StatCard({ title, value, sub, icon: Icon, color = "text-indigo-600", bg = "bg-indigo-50" }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color?: string; bg?: string;
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assistantNames, setAssistantNames] = useState<Record<string, string>>({});

  const selectedAssistant = searchParams.get("assistantId") ?? "";
  const selectedQueue = searchParams.get("queueId") ?? "";

  // Buscar nomes reais dos assistentes via vapi-resources (uma vez por tenant)
  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/vapi-resources`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.assistants) return;
        const names: Record<string, string> = {};
        for (const a of d.assistants as Array<{ id: string; name?: string }>) {
          if (a.id && a.name) names[a.id] = a.name;
        }
        setAssistantNames(names);
      })
      .catch(() => {});
  }, [tenantId]);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (selectedAssistant) params.set("assistantId", selectedAssistant);
    if (selectedQueue) params.set("queueId", selectedQueue);

    const res = await fetch(`/api/tenants/${tenantId}/analytics?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
    setRefreshing(false);
  }, [tenantId, selectedAssistant, selectedQueue]);

  useEffect(() => { load(); }, [load]);

  function setFilter(key: "assistantId" | "queueId", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
      // When assistant changes, clear campaign filter
      if (key === "assistantId") params.delete("queueId");
    } else {
      params.delete(key);
      if (key === "assistantId") params.delete("queueId");
    }
    router.push(`?${params.toString()}`);
  }

  // Campaigns filtered to selected assistant
  const visibleCampaigns = data?.campaigns
    ? (selectedAssistant
        ? data.campaigns.filter((c) => c.assistantId === selectedAssistant)
        : data.campaigns)
    : [];

  const hourData = data ? Array.from({ length: 24 }, (_, h) => data.byHour[String(h)] ?? 0) : [];
  const weekData = data ? Array.from({ length: 7 }, (_, i) => data.byWeekday[String(i + 1)] ?? 0) : [];
  const maxHour = Math.max(1, ...hourData);
  const maxWeek = Math.max(1, ...weekData);

  const answeredPct = data ? Math.round((data.answeredCalls / Math.max(data.totalCalls, 1)) * 100) : 0;
  const successPct = data && data.structuredWithOutput > 0
    ? Math.round((data.structuredSuccessCalls / data.structuredWithOutput) * 100)
    : null;

  const hasFilters = selectedAssistant || selectedQueue;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Performance das campanhas de discagem</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} className="btn-secondary" disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <Filter className="w-3.5 h-3.5" />
            Filtrar por:
          </div>

          {/* Assistant filter */}
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400 shrink-0" />
            <select
              className="form-input py-1.5 text-sm min-w-[180px]"
              value={selectedAssistant}
              onChange={(e) => setFilter("assistantId", e.target.value)}
            >
              <option value="">Todos os assistentes</option>
              {(data?.assistants ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {assistantNames[a.id] ?? a.name ?? `Assistente ${a.id.slice(0, 8)}…`}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign filter */}
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-indigo-400 shrink-0" />
            <select
              className="form-input py-1.5 text-sm min-w-[200px]"
              value={selectedQueue}
              onChange={(e) => setFilter("queueId", e.target.value)}
            >
              <option value="">Todas as campanhas</option>
              {visibleCampaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setFilter("assistantId", ""); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      ) : !data ? (
        <div className="card">
          <div className="empty-state">
            <p className="empty-state-title">Sem dados disponíveis</p>
            <p className="empty-state-desc">Inicie uma campanha de discagem para ver métricas aqui.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat Cards row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total de Leads" value={data.totalLeads.toLocaleString("pt-BR")} icon={Users} color="text-indigo-600" bg="bg-indigo-50" />
            <StatCard title="Total de Chamadas" value={data.totalCalls.toLocaleString("pt-BR")} icon={PhoneCall} color="text-blue-600" bg="bg-blue-50" />
            <StatCard title="Chamadas Atendidas" value={data.answeredCalls.toLocaleString("pt-BR")} sub={`${answeredPct}% do total`} icon={Phone} color="text-emerald-600" bg="bg-emerald-50" />
            <StatCard title="Não Atendidas" value={data.notAnsweredCalls.toLocaleString("pt-BR")} sub={pct(data.notAnsweredCalls, data.totalCalls) + " do total"} icon={PhoneOff} color="text-red-500" bg="bg-red-50" />
          </div>

          {/* Stat Cards row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Gasto Total" value={`$${data.totalCost.toFixed(4)}`} icon={DollarSign} color="text-amber-600" bg="bg-amber-50" />
            <StatCard title="Tempo Total em Chamada" value={formatDurationLong(data.totalDurationSec)} icon={Clock} color="text-purple-600" bg="bg-purple-50" />
            <StatCard title="Tempo Médio (Atendidas)" value={formatDurationShort(data.avgDurationSec)} sub="Apenas chamadas atendidas" icon={Timer} color="text-cyan-600" bg="bg-cyan-50" />
            <StatCard
              title="Conversões"
              value={data.structuredOutputsConfigured ? (successPct != null ? `${successPct}%` : "—") : "—"}
              sub={
                data.structuredOutputsConfigured
                  ? `${data.structuredSuccessCalls}/${data.structuredWithOutput} avaliados`
                  : "Configure o campo de sucesso em Configuração Vapi"
              }
              icon={CheckCircle2}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
          </div>

          {/* ROI card — only when configured */}
          {data.costPerConversion != null && (
            <div className="card p-5 border-l-4 border-indigo-500">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Custo por Conversão (ROI)</p>
              <p className="text-3xl font-bold text-gray-900">${data.costPerConversion.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">por lead convertido · {data.structuredSuccessCalls} conversões no período</p>
            </div>
          )}

          {/* Progress bars + Cost */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Taxa de Atendimento</h3>
              <div className="space-y-3">
                {[
                  { label: "Atendidas", icon: Phone, value: data.answeredCalls, color: "bg-emerald-500", textColor: "text-emerald-700" },
                  { label: "Não atendidas", icon: PhoneOff, value: data.notAnsweredCalls, color: "bg-red-400", textColor: "text-red-500" },
                ].map(({ label, icon: Icon, value, color, textColor }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span className={`flex items-center gap-1.5 font-medium ${textColor}`}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </span>
                      <span className="font-semibold">{value} ({pct(value, data.totalCalls)})</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: pct(value, data.totalCalls) }} />
                    </div>
                  </div>
                ))}
                {data.structuredOutputsConfigured && data.structuredWithOutput > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span className="flex items-center gap-1.5 font-medium text-indigo-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conversões
                      </span>
                      <span className="font-semibold">
                        {data.structuredSuccessCalls} ({pct(data.structuredSuccessCalls, data.structuredWithOutput)})
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: pct(data.structuredSuccessCalls, data.structuredWithOutput) }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

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
                    <span className="font-mono font-semibold text-gray-900">${(data.totalCost / data.answeredCalls).toFixed(4)}</span>
                  </div>
                )}
                {data.totalCalls > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Custo médio por chamada</span>
                    <span className="font-mono font-semibold text-gray-900">${(data.totalCost / data.totalCalls).toFixed(4)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Tempo total em ligação</span>
                  <span className="font-semibold text-gray-900">{formatDurationLong(data.totalDurationSec)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-700">Volume por Dia da Semana</h3>
              </div>
              {weekData.every((v) => v === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda</p>
              ) : (
                <BarChart data={weekData} labels={WEEKDAY_LABELS.slice(1)} maxVal={maxWeek} color="bg-indigo-500" />
              )}
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-gray-700">Volume por Hora do Dia (UTC)</h3>
              </div>
              {hourData.every((v) => v === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda</p>
              ) : (
                <BarChart data={hourData} labels={HOUR_LABELS} maxVal={maxHour} color="bg-purple-400" />
              )}
              <p className="text-xs text-gray-400 mt-2">* Horários em UTC</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
