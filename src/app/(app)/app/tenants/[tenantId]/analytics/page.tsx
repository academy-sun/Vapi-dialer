"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, Phone, PhoneOff, PhoneCall, DollarSign, Clock,
  Timer, Users, CheckCircle2, BarChart3, Loader2, Bot, Filter,
  Flame, Activity, TrendingUp, AlertTriangle, Sparkles, History,
  ChevronDown, ChevronUp,
} from "lucide-react";
import Markdown from "react-markdown";
import { createClient } from "@/lib/supabase/browser";

interface Campaign { id: string; name: string; assistantId: string }

interface AnalysisRecord {
  id: string;
  queue_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  dial_queues: { name: string } | null;
}
interface AssistantRef { id: string; name: string }

interface AnalyticsData {
  userRole: string;
  campaigns: Campaign[];
  assistants: AssistantRef[];
  selectedQueueId: string | null;
  selectedAssistantId: string | null;
  totalCalls: number;
  answeredCalls: number;
  notAnsweredCalls: number;
  totalCost: number;
  totalDurationSec: number;
  totalDurationAnsweredSec: number;
  avgDurationSec: number;
  avgDurationAllSec: number;
  maxDurationSec: number;
  durationBuckets: Record<string, number>;
  totalLeads: number;
  structuredSuccessCalls: number;
  structuredWithOutput: number;
  structuredOutputsConfigured: boolean;
  costPerConversion: number | null;
  byHour: Record<string, number>;
  byHourAnswerRate: Record<string, number>;
  byWeekday: Record<string, number>;
  byDayHour: Record<string, Record<string, number>>;
  byDayHourAnswered: Record<string, Record<string, number>>;
  statusBreakdown: Record<string, number>;
  endedReasonRaw: Record<string, number>;
  engagementRate: number;
  timezone?: string;
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

const BAR_MAX_PX = 112; // altura máxima da barra em pixels

function BarChart({ data, labels, maxVal, color = "bg-indigo-500" }: {
  data: number[]; labels: string[]; maxVal: number; color?: string;
}) {
  return (
    <div className="flex items-end gap-0.5">
      {data.map((val, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-full rounded-t-sm ${color} transition-all duration-300 min-h-0`}
            style={{ height: maxVal > 0 ? `${Math.max(1, Math.round((val / maxVal) * BAR_MAX_PX))}px` : "0px" }}
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

// ── Heatmap dia × hora ──────────────────────────────────────────────────────
type HeatmapMode = "calls" | "answered" | "rate";

function heatColor(val: number, max: number): string {
  if (max === 0 || val === 0) return "bg-white/5 text-white/20";
  const pctValue = val / max;
  if (pctValue <= 0.15) return "bg-[#00D68F]/10 text-[#00D68F]/70";
  if (pctValue <= 0.35) return "bg-[#00D68F]/25 text-[#00D68F]/80";
  if (pctValue <= 0.55) return "bg-[#00D68F]/40 text-white";
  if (pctValue <= 0.75) return "bg-[#00D68F]/60 text-white";
  return "bg-[#00D68F] text-[#060608] font-bold";
}

function HeatmapSection({ data }: { data: AnalyticsData }) {
  const [mode, setMode] = useState<HeatmapMode>("calls");

  // Calcula a matriz 7×24
  const matrix: number[][] = Array.from({ length: 7 }, (_, di) => {
    const day = String(di + 1);
    return Array.from({ length: 24 }, (_, h) => {
      const hStr = String(h);
      const calls    = data.byDayHour?.[day]?.[hStr]    ?? 0;
      const answered = data.byDayHourAnswered?.[day]?.[hStr] ?? 0;
      if (mode === "calls")    return calls;
      if (mode === "answered") return answered;
      return calls > 0 ? Math.round((answered / calls) * 100) : 0;
    });
  });

  const allValues = matrix.flat();
  const maxVal    = Math.max(1, ...allValues);

  // Cards de resumo
  let totalAttempts = 0, totalAnswered = 0;
  let peakHour = 0, peakHourVal = 0, peakDay = 1, peakDayVal = 0;

  for (let d = 1; d <= 7; d++) {
    let dayTotal = 0;
    for (let h = 0; h < 24; h++) {
      const v = data.byDayHour?.[String(d)]?.[String(h)] ?? 0;
      const a = data.byDayHourAnswered?.[String(d)]?.[String(h)] ?? 0;
      totalAttempts += v;
      totalAnswered += a;
      dayTotal += v;
      const hourTotal = (data.byHour?.[String(h)] ?? 0);
      if (hourTotal > peakHourVal) { peakHourVal = hourTotal; peakHour = h; }
    }
    if (dayTotal > peakDayVal) { peakDayVal = dayTotal; peakDay = d; }
  }
  const avgPerHour = totalAttempts > 0 ? (totalAttempts / 24).toFixed(1) : "0";

  const modeLabels: Record<HeatmapMode, string> = {
    calls:    "Tentativas",
    answered: "Atendidas",
    rate:     "Connect Rate (%)",
  };

  return (
    <div className="gc p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight">Fluxo de Engajamento <span className="text-white/30 font-medium ml-1">— Dia × Hora</span></h3>
        </div>
        <div className="flex p-1 rounded-xl bg-black/40 border border-white/5 text-[11px]">
          {(["calls", "answered", "rate"] as HeatmapMode[]).map((m) => (
            <button key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg font-bold transition-all ${
                mode === m ? "bg-[#E8002D] text-white shadow-[0_0_15px_rgba(232,0,45,0.4)]" : "text-white/40 hover:text-white"
              }`}>
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="text-[10px] border-separate border-spacing-0.5 mx-auto">
          <thead>
            <tr>
              <th className="w-8" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="w-7 text-center text-gray-400 font-normal pb-1">
                  {h % 3 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, di) => (
              <tr key={di}>
                <td className="pr-1.5 text-right text-gray-500 font-medium whitespace-nowrap">
                  {WEEKDAY_LABELS[di + 1]}
                </td>
                {row.map((val, h) => (
                  <td key={h}
                    title={`${WEEKDAY_LABELS[di + 1]} ${String(h).padStart(2, "0")}h → ${val}${mode === "rate" ? "%" : ""}`}
                    className={`w-7 h-6 rounded text-center leading-6 cursor-default transition-colors ${heatColor(val, maxVal)}`}>
                    {val > 0 ? val : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-wider">
        <span>Baixo</span>
        {["bg-white/5", "bg-[#00D68F]/20", "bg-[#00D68F]/40", "bg-[#00D68F]/60", "bg-[#00D68F]"].map((c) => (
          <div key={c} className={`w-3.5 h-3.5 rounded-sm ${c} border border-white/5`} />
        ))}
        <span>Alto</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-white/5">
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total tentativas</p>
          <p className="text-xl font-black text-white font-mono leading-none">{totalAttempts.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Média por hora</p>
          <p className="text-xl font-black text-white font-mono leading-none">{avgPerHour}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Hora Pico</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-black text-white font-mono leading-none">{String(peakHour).padStart(2, "0")}h</p>
            <span className="text-[10px] text-white/30 font-medium">{peakHourVal} chamadas</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Dia Pico</p>
          <div className="flex items-baseline gap-2">
             <p className="text-xl font-black text-white font-mono leading-none">{WEEKDAY_LABELS[peakDay]}</p>
             <span className="text-[10px] text-white/30 font-medium">{peakDayVal} voos</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Talk Time Breakdown ──────────────────────────────────────────────────────
function TalkTimeSection({ data }: { data: AnalyticsData }) {
  const buckets = [
    { key: "0-10s",  label: "< 10s",   desc: "Chamadas instantâneas" },
    { key: "10-60s", label: "10s–1min", desc: "Curtas" },
    { key: "1-3min", label: "1–3 min",  desc: "Médias" },
    { key: "3-5min", label: "3–5 min",  desc: "Longas" },
    { key: "5min+",  label: "> 5 min",  desc: "Muito longas" },
  ];
  const bucketValues = buckets.map((b) => data.durationBuckets?.[b.key] ?? 0);
  const bucketMax = Math.max(1, ...bucketValues);
  const BAR = 80;

  const costPerMin = data.totalDurationSec > 0
    ? (data.totalCost / (data.totalDurationSec / 60))
    : null;

  return (
    <div className="gc p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-cyan-500" />
        </div>
        <h3 className="text-sm font-bold text-white tracking-tight">Talk Time Breakdown</h3>
      </div>

      {/* 4 mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Total em ligação</p>
          <p className="text-xl font-black text-white font-mono leading-none">{formatDurationLong(data.totalDurationSec)}</p>
        </div>
        <div className="rounded-xl bg-cyan-500/10 p-4 border border-cyan-500/20">
          <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Atendidas</p>
          <p className="text-xl font-black text-cyan-400 font-mono leading-none">{formatDurationLong(data.totalDurationAnsweredSec ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Média (atendidas)</p>
          <p className="text-xl font-black text-white font-mono leading-none">{formatDurationShort(data.avgDurationSec)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-4 border border-white/5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Máximo</p>
          <div className="flex items-baseline justify-between">
            <p className="text-xl font-black text-white font-mono leading-none">{formatDurationShort(data.maxDurationSec ?? 0)}</p>
            {costPerMin != null && data.userRole !== "member" && (
              <p className="text-[10px] font-bold text-[#00D68F]">
                ${costPerMin.toFixed(4)}/m
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Duration distribution bar chart */}
      {data.answeredCalls > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-3">Distribuição de duração (chamadas atendidas)</p>
          <div className="flex items-end gap-2">
            {buckets.map((b, i) => {
              const val = bucketValues[i];
              const heightPx = bucketMax > 0 ? Math.max(2, Math.round((val / bucketMax) * BAR)) : 0;
              const pctShare = data.answeredCalls > 0
                ? Math.round((val / data.answeredCalls) * 100) : 0;
              return (
                <div key={b.key} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 font-medium">{val > 0 ? pctShare + "%" : ""}</span>
                  <div
                    className="w-full rounded-t-sm bg-cyan-400 transition-all"
                    style={{ height: `${heightPx}px` }}
                    title={`${b.desc}: ${val} chamadas (${pctShare}%)`}
                  />
                  <span className="text-[9px] text-gray-400 text-center leading-tight">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Call End Reasons ─────────────────────────────────────────────────────────
const END_REASON_PT: Record<string, string> = {
  "customer-ended-call":   "Cliente encerrou",
  "assistant-ended-call":  "Assistente encerrou",
  "no-answer":             "Sem resposta",
  "customer-did-not-answer": "Sem resposta (v2)",
  "busy":                  "Ocupado",
  "customer-busy":         "Ocupado (v2)",
  "voicemail":             "Caixa postal",
  "machine_end_silence":   "Caixa postal (silêncio)",
  "silence-timed-out":     "Silêncio expirou",
  "failed":                "Falha",
  "pipeline-error":        "Erro de pipeline",
};

const END_REASON_COLOR: Record<string, string> = {
  "customer-ended-call":   "bg-emerald-400",
  "assistant-ended-call":  "bg-blue-400",
  "no-answer":             "bg-gray-300",
  "customer-did-not-answer": "bg-gray-300",
  "busy":                  "bg-yellow-400",
  "customer-busy":         "bg-yellow-400",
  "voicemail":             "bg-purple-400",
  "machine_end_silence":   "bg-purple-300",
  "silence-timed-out":     "bg-purple-300",
  "failed":                "bg-red-400",
  "pipeline-error":        "bg-red-300",
};

function EndReasonsSection({ data }: { data: AnalyticsData }) {
  const reasons = Object.entries(data.endedReasonRaw ?? {})
    .filter(([k]) => k !== "null")
    .sort(([, a], [, b]) => b - a);

  if (reasons.length === 0) return null;

  const total = reasons.reduce((s, [, v]) => s + v, 0);
  const maxVal = Math.max(1, ...reasons.map(([, v]) => v));

  return (
    <div className="gc p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
        </div>
        <h3 className="text-sm font-bold text-white tracking-tight">Motivos de Encerramento</h3>
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest ml-auto">{total} chamadas</span>
      </div>
      <div className="space-y-2">
        {reasons.map(([key, count]) => {
          const label = END_REASON_PT[key] ?? key;
          const barColorToken = END_REASON_COLOR[key] ?? "bg-gray-300";
          const barWidth = Math.round((count / maxVal) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between text-[11px] font-bold text-white/60 mb-2">
                <span className="truncate max-w-[200px] uppercase tracking-wider" title={key}>{label}</span>
                <span className="text-white font-mono">{count} <span className="text-white/20 ml-1">({pct(count, total)})</span></span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div className={`h-full ${barColorToken} rounded-full transition-all shadow-[0_0_8px_rgba(255,255,255,0.1)]`} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, color = "text-white", bg = "bg-white/5" }: {
  title: string; value: string; sub?: string; icon: React.ElementType; color?: string; bg?: string;
}) {
  const isRed = color.includes("red") || color.includes("E8002D");
  
  return (
    <div className="gc p-5 group hover:border-white/20 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[1.5px] mb-2">{title}</p>
          <p className={`kpi-value ${isRed ? 'grad-red' : 'text-white'}`}>{value}</p>
          {sub && <p className="text-[10px] font-bold text-white/20 mt-2 uppercase tracking-wide truncate">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
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
  const [minutesData, setMinutesData] = useState<{
    contracted: number;
    usedSeconds: number;
    blocked: boolean;
    month: string | null;
  } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // ── IA ──
  const [aiAnalysis, setAiAnalysis]   = useState<string | null>(null);
  const [loadingAi, setLoadingAi]     = useState(false);
  const [aiHistory, setAiHistory]     = useState<AnalysisRecord[]>([]);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const supabase = createClient();

  const selectedAssistant = searchParams.get("assistantId") ?? "";
  const selectedQueue = searchParams.get("queueId") ?? "";
  const selectedDays = searchParams.get("days") ?? "90";

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

  // Buscar status de minutos contratados (leitura do cache, sem custo adicional)
  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/vapi-connection`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const conn = d?.connection;
        if (!conn || conn.contracted_minutes == null) { setMinutesData(null); return; }
        setMinutesData({
          contracted:  conn.contracted_minutes,
          usedSeconds: conn.minutes_used_cache ?? 0,
          blocked:     conn.minutes_blocked ?? false,
          month:       conn.minutes_cache_month ?? null,
        });
      })
      .catch(() => {});
  }, [tenantId]);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (selectedAssistant) params.set("assistantId", selectedAssistant);
    if (selectedQueue) params.set("queueId", selectedQueue);
    params.set("days", selectedDays);

    const res = await fetch(`/api/tenants/${tenantId}/analytics?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
    setRefreshing(false);
  }, [tenantId, selectedAssistant, selectedQueue, selectedDays]);

  useEffect(() => { load(); }, [load]);

  const loadAiHistory = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/analyses?limit=20`);
    if (!res.ok) return;
    const json = await res.json();
    setAiHistory(json.analyses ?? []);
  }, [tenantId]);

  useEffect(() => { loadAiHistory(); }, [loadAiHistory]);

  const handleRunAiAnalysis = async () => {
    if (!selectedQueue) return;
    setLoadingAi(true);
    setAiAnalysis(null);
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-tenant-analysis", {
        body: { tenantId, queueId: selectedQueue },
      });
      if (error) throw error;
      setAiAnalysis(result.content);
      await loadAiHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Erro ao gerar análise: " + msg);
    } finally {
      setLoadingAi(false);
    }
  };

  function setFilter(key: "assistantId" | "queueId" | "days", value: string) {
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
  const isMember = !data || data.userRole === "member";

  // Minutes progress bar derived values
  const usedMinutes  = minutesData ? Math.ceil(minutesData.usedSeconds / 60) : 0;
  const minutesPct   = minutesData?.contracted ? Math.round((usedMinutes / minutesData.contracted) * 100) : 0;
  const barColor     = minutesData?.blocked || minutesPct >= 100 ? "#dc2626"
    : minutesPct >= 80 ? "#f97316"
    : "#10b981";

  async function handleRequestMinutes() {
    setSendingEmail(true);
    const res = await fetch(`/api/tenants/${tenantId}/request-minutes`, { method: "POST" });
    if (!res.ok) console.error("Erro ao enviar solicitação");
    setSendingEmail(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
           <div className="flex items-center gap-2 mb-1">
             <div className="w-2 h-2 rounded-full bg-[#E8002D] animate-pulse shadow-[0_0_8px_#E8002D]" />
             <span className="text-[10px] font-black text-white/30 uppercase tracking-[2px]">Intelligence Unit</span>
           </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => load(true)} 
            className="btn-glass px-5 py-2.5" 
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="font-bold uppercase tracking-wider text-[11px]">Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Barra de minutos contratados */}
      {minutesData && (
        <div className={`card p-4 mb-6 ${minutesData.blocked ? "border-red-300" : minutesPct >= 80 ? "border-orange-300" : ""}`}
          style={minutesData.blocked ? { borderColor: "#fca5a5", background: "#fff7f7" } : minutesPct >= 80 ? { borderColor: "#fdba74", background: "#fffbf5" } : {}}>
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {(minutesData.blocked || minutesPct >= 80) && (
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${minutesData.blocked ? "text-red-500" : "text-orange-500"}`} />
                )}
                <span className="text-sm font-semibold text-gray-800">
                  Minutos contratados — {minutesData.month ?? new Date().toISOString().slice(0, 7)}
                </span>
                {minutesData.blocked && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Conta bloqueada</span>
                )}
              </div>
              <span className="text-sm font-bold" style={{ color: barColor }}>
                {usedMinutes} / {minutesData.contracted} min ({minutesPct}%)
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-3 rounded-full overflow-hidden bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, minutesPct)}%`, background: barColor }}
              />
            </div>

            {/* Aviso e botão */}
            {(minutesPct >= 80) && (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm" style={{ color: minutesData.blocked ? "#dc2626" : "#92400e" }}>
                  {minutesData.blocked
                    ? "Limite atingido. Todas as campanhas foram pausadas. Entre em contato para contratar mais minutos."
                    : `Você já consumiu ${minutesPct}% dos minutos contratados deste mês.`}
                </p>
                <button
                  onClick={handleRequestMinutes}
                  disabled={sendingEmail}
                  className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  style={{ background: "#FF1A1A", color: "white" }}
                >
                  {sendingEmail ? "Enviando..." : "Contratar mais minutos"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="gc p-5 mb-8">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[1.5px]">
            <Filter className="w-3.5 h-3.5" />
            Configuração de Vista
          </div>

          <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />

          {/* Assistant filter */}
          <div className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all">
              <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            </div>
            <select
              className="bg-transparent text-white/80 text-xs font-bold focus:outline-none cursor-pointer border-none p-0 appearance-none hover:text-white transition-colors"
              value={selectedAssistant}
              onChange={(e) => setFilter("assistantId", e.target.value)}
              style={{ minWidth: "140px" }}
            >
              <option value="" className="bg-[#0A0A0E]">Todos assistentes</option>
              {(data?.assistants ?? []).map((a) => (
                <option key={a.id} value={a.id} className="bg-[#0A0A0E]">
                  {assistantNames[a.id] ?? a.name ?? `Assistente ${a.id.slice(0, 8)}…`}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign filter */}
          <div className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-[#E8002D]/10 flex items-center justify-center border border-[#E8002D]/20 group-hover:bg-[#E8002D]/20 transition-all">
              <PhoneCall className="w-3.5 h-3.5 text-[#E8002D] shrink-0" />
            </div>
            <select
              className="bg-transparent text-white/80 text-xs font-bold focus:outline-none cursor-pointer border-none p-0 appearance-none hover:text-white transition-colors"
              value={selectedQueue}
              onChange={(e) => setFilter("queueId", e.target.value)}
              style={{ minWidth: "160px" }}
            >
              <option value="" className="bg-[#0A0A0E]">Todas campanhas</option>
              {visibleCampaigns.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0A0A0E]">{c.name}</option>
              ))}
            </select>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-2 group">
             <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            </div>
            <select
              className="bg-transparent text-white/80 text-xs font-bold focus:outline-none cursor-pointer border-none p-0 appearance-none hover:text-white transition-colors"
              value={selectedDays}
              onChange={(e) => setFilter("days", e.target.value)}
            >
              <option value="7" className="bg-[#0A0A0E]">7 dias</option>
              <option value="30" className="bg-[#0A0A0E]">30 dias</option>
              <option value="90" className="bg-[#0A0A0E]">90 dias</option>
              <option value="365" className="bg-[#0A0A0E]">365 dias</option>
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setFilter("assistantId", ""); }}
              className="text-[10px] font-bold text-[#E8002D] hover:text-[#FF1744] uppercase tracking-wider ml-auto animate-fadeIn"
            >
              Limpar visão
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
            <StatCard title="Total de Leads" value={data.totalLeads.toLocaleString("pt-BR")} icon={Users} color="text-indigo-400" bg="bg-indigo-500/10" />
            <StatCard title="Total de Chamadas" value={data.totalCalls.toLocaleString("pt-BR")} icon={PhoneCall} color="text-cyan-400" bg="bg-cyan-500/10" />
            <StatCard title="Chamadas Atendidas" value={data.answeredCalls.toLocaleString("pt-BR")} sub={`${answeredPct}% do total`} icon={Phone} color="text-[#00D68F]" bg="bg-[#00D68F]/10" />
            <StatCard title="Não Atendidas" value={data.notAnsweredCalls.toLocaleString("pt-BR")} sub={pct(data.notAnsweredCalls, data.totalCalls) + " do total"} icon={PhoneOff} color="text-[#E8002D]" bg="bg-[#E8002D]/10" />
          </div>

          {/* Stat Cards row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {data.userRole !== "member" && (
              <StatCard title="Gasto Total" value={`$${data.totalCost.toFixed(4)}`} icon={DollarSign} color="text-amber-400" bg="bg-amber-500/10" />
            )}
            <StatCard title="Tempo Total" value={formatDurationLong(data.totalDurationSec)} icon={Clock} color="text-purple-400" bg="bg-purple-500/10" />
            <StatCard title="Tempo Médio" value={formatDurationShort(data.avgDurationSec)} sub="Apenas atendidas" icon={Timer} color="text-cyan-400" bg="bg-cyan-500/10" />
            <StatCard
              title="Conversões"
              value={data.structuredOutputsConfigured ? (successPct != null ? `${successPct}%` : "—") : "—"}
              sub={data.structuredOutputsConfigured ? `${data.structuredSuccessCalls}/${data.structuredWithOutput}` : "Não configurado"}
              icon={CheckCircle2}
              color="text-[#00D68F]"
              bg="bg-[#00D68F]/10"
            />
          </div>

          {/* ROI card — only when configured and user is not a member */}
          {!isMember && data.costPerConversion != null && (
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
                  ...(data.statusBreakdown["ura-suspeita"] > 0 ? [{ label: "Poss. URA / Caixa postal", icon: AlertTriangle, value: data.statusBreakdown["ura-suspeita"], color: "bg-amber-400", textColor: "text-amber-600" }] : []),
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

            {!isMember && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Análise de Custos</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Custo total</span>
                    <span className="font-mono font-semibold text-gray-900">${data.totalCost.toFixed(4)}</span>
                  </div>
                  {data.totalCalls > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Custo por chamada</span>
                      <span className="font-mono font-semibold text-gray-900">${(data.totalCost / data.totalCalls).toFixed(4)}</span>
                    </div>
                  )}
                  {data.answeredCalls > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Custo por chamada atendida</span>
                      <span className="font-mono font-semibold text-gray-900">${(data.totalCost / data.answeredCalls).toFixed(4)}</span>
                    </div>
                  )}
                  {data.totalDurationSec > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Custo por minuto</span>
                      <span className="font-mono font-semibold text-gray-900">${(data.totalCost / (data.totalDurationSec / 60)).toFixed(4)}</span>
                    </div>
                  )}
                  {data.totalLeads > 0 && (
                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-600">Custo por lead</span>
                      <span className="font-mono font-semibold text-gray-900">${(data.totalCost / data.totalLeads).toFixed(4)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Tempo total em ligação</span>
                    <span className="font-semibold text-gray-900">{formatDurationLong(data.totalDurationSec)}</span>
                  </div>
                </div>
              </div>
            )}
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
                <h3 className="text-sm font-semibold text-gray-700">Volume por Hora do Dia</h3>
              </div>
              {hourData.every((v) => v === 0) ? (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados ainda</p>
              ) : (
                <BarChart data={hourData} labels={HOUR_LABELS} maxVal={maxHour} color="bg-purple-400" />
              )}
              <p className="text-xs text-gray-400 mt-2">* Horários no fuso local do tenant</p>
            </div>
          </div>

          {/* Heatmap */}
          <HeatmapSection data={data} />

          {/* Talk Time Breakdown */}
          <TalkTimeSection data={data} />

          {/* Call End Reasons */}
          <EndReasonsSection data={data} />

          {/* ── Insights de IA ── */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-700">Insights de IA — Análise de Gargalo</h3>
              </div>
              <button
                onClick={handleRunAiAnalysis}
                disabled={loadingAi || !selectedQueue}
                title={!selectedQueue ? "Selecione uma campanha para analisar" : ""}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border
                  disabled:opacity-50 disabled:cursor-not-allowed
                  bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
              >
                {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loadingAi ? "Gerando análise…" : "Analisar Gargalos (10–40s)"}
              </button>
            </div>

            {!selectedQueue && (
              <p className="text-xs text-gray-400">Selecione uma campanha no filtro acima para habilitar a análise de IA.</p>
            )}

            {/* Resultado atual */}
            {aiAnalysis && (
              <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-5">
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-3">Análise gerada agora</p>
                <div className="prose prose-sm max-w-none
                  prose-headings:text-gray-800 prose-headings:font-semibold
                  prose-ul:marker:text-indigo-400
                  prose-li:text-gray-700
                  prose-p:text-gray-700 prose-p:leading-relaxed">
                  <Markdown>{aiAnalysis}</Markdown>
                </div>
              </div>
            )}
          </div>

          {/* ── Histórico de Análises ── */}
          {aiHistory.length > 0 && (
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700">Histórico de Análises</h3>
                <span className="text-xs text-gray-400 ml-auto">{aiHistory.length} registro{aiHistory.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="space-y-2">
                {aiHistory.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const campaignName = item.dial_queues?.name
                    ?? data?.campaigns.find((c) => c.id === item.queue_id)?.name
                    ?? "Campanha removida";
                  const date = new Date(item.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  });
                  const preview = item.content.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").slice(0, 160);

                  return (
                    <div key={item.id} className="rounded-lg border border-gray-100 overflow-hidden">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-indigo-600 truncate">{campaignName}</span>
                            <span className="text-xs text-gray-400 shrink-0">{date}</span>
                          </div>
                          {!isExpanded && (
                            <p className="text-xs text-gray-500 truncate">{preview}…</p>
                          )}
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50">
                          <div className="prose prose-sm max-w-none
                            prose-headings:text-gray-800 prose-headings:font-semibold
                            prose-ul:marker:text-indigo-400
                            prose-li:text-gray-700
                            prose-p:text-gray-700 prose-p:leading-relaxed">
                            <Markdown>{item.content}</Markdown>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
