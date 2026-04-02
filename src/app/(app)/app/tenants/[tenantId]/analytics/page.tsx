"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, PhoneCall, Users, CheckCircle2, Loader2, Filter,
  Activity, Sparkles, History, ChevronDown, ChevronUp, Zap,
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

function fmtCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const WEEKDAY_LABELS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`);

// ── Heatmap dia × hora ──────────────────────────────────────────────────────
type HeatmapMode = "calls" | "answered" | "rate";

function heatClass(val: number, max: number): string {
  if (max === 0 || val === 0) return "cx-hmap-cell empty";
  const pctValue = val / max;
  if (pctValue <= 0.2) return "cx-hmap-cell hc1";
  if (pctValue <= 0.4) return "cx-hmap-cell hc2";
  if (pctValue <= 0.6) return "cx-hmap-cell hc3";
  if (pctValue <= 0.8) return "cx-hmap-cell hc4";
  return "cx-hmap-cell hc5";
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
    <div className="gc cx-hmap-card">
      {/* Header */}
      <div className="cx-hmap-head">
        <div>
          <div className="cx-card-title">Fluxo de Engajamento</div>
          <div className="cx-card-sub">Dia x Hora</div>
        </div>
        <div className="cx-period-tabs">
          {(["calls", "answered", "rate"] as HeatmapMode[]).map((m) => (
            <button key={m}
              onClick={() => setMode(m)}
              className={`cx-period-tab ${mode === m ? "active" : ""}`}>
              {modeLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="cx-hmap-hours">
        <span />
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="cx-hmap-hlabel">{String(i * 2).padStart(2, "0")}h</span>
        ))}
      </div>
      {matrix.map((row, di) => (
        <div key={di} className="cx-hmap-row">
          <span className="cx-hmap-day">{WEEKDAY_LABELS[di + 1]}</span>
          {/* Collapse 24h into 12 slots (pairs: 0-1, 2-3, ... 22-23) */}
          {Array.from({ length: 12 }, (_, i) => {
            const h = i * 2;
            const val = (row[h] ?? 0) + (row[h + 1] ?? 0);
            return (
              <div key={i}
                title={`${WEEKDAY_LABELS[di + 1]} ${String(h).padStart(2, "0")}h → ${val}${mode === "rate" ? "%" : ""}`}
                className={heatClass(val, maxVal * 2)}>
                {val > 0 ? val : ""}
              </div>
            );
          })}
        </div>
      ))}

      {/* Summary stats */}
      <div className="cx-hmap-stats">
        <div>
          <div className="cx-hmap-stt">Total tentativas</div>
          <div className="cx-hmap-stv">{totalAttempts.toLocaleString("pt-BR")}</div>
        </div>
        <div>
          <div className="cx-hmap-stt">Média por hora</div>
          <div className="cx-hmap-stv">{avgPerHour}</div>
        </div>
        <div>
          <div className="cx-hmap-stt">Hora Pico</div>
          <div className="cx-hmap-stv accent">{String(peakHour).padStart(2, "0")}h</div>
        </div>
        <div>
          <div className="cx-hmap-stt">Dia Pico</div>
          <div className="cx-hmap-stv accent">{WEEKDAY_LABELS[peakDay]}</div>
        </div>
      </div>
    </div>
  );
}

// ── Talk Time Breakdown ──────────────────────────────────────────────────────
function TalkTimeSection({ data }: { data: AnalyticsData }) {
  const buckets = [
    { key: "0-10s",  label: "< 10s",   desc: "Chamadas instantâneas", color: "#E8002D" },
    { key: "10-60s", label: "10s–1min", desc: "Curtas",                color: "#FF6B35" },
    { key: "1-3min", label: "1–3 min",  desc: "Médias",               color: "#FFB800" },
    { key: "3-5min", label: "3–5 min",  desc: "Longas",               color: "#00D68F" },
    { key: "5min+",  label: "> 5 min",  desc: "Muito longas",         color: "#00C2FF" },
  ];
  const bucketValues = buckets.map((b) => data.durationBuckets?.[b.key] ?? 0);
  const totalBuckets = bucketValues.reduce((a, b) => a + b, 0);

  const costPerMin = data.totalDurationSec > 0
    ? (data.totalCost / (data.totalDurationSec / 60))
    : null;

  return (
    <div className="gc cx-tt-card">
      <div className="cx-card-title" style={{ marginBottom: 16 }}>Talk Time Breakdown</div>

      {/* 4 mini stats */}
      <div className="cx-tt-meta">
        <div>
          <div className="cx-tt-lbl">Total em ligação</div>
          <div className="cx-tt-val white">{formatDurationLong(data.totalDurationSec)}</div>
        </div>
        <div>
          <div className="cx-tt-lbl">Atendidas</div>
          <div className="cx-tt-val green">{formatDurationLong(data.totalDurationAnsweredSec ?? 0)}</div>
        </div>
        <div>
          <div className="cx-tt-lbl">Média (atendidas)</div>
          <div className="cx-tt-val white">{formatDurationShort(data.avgDurationSec)}</div>
        </div>
        <div>
          <div className="cx-tt-lbl">Máximo</div>
          <div className="cx-tt-val yellow">{formatDurationShort(data.maxDurationSec ?? 0)}</div>
          {costPerMin != null && data.userRole !== "member" && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", marginTop: 2 }}>
              ${costPerMin.toFixed(4)}/m
            </div>
          )}
        </div>
      </div>

      {/* Duration distribution stacked bar */}
      {data.answeredCalls > 0 && totalBuckets > 0 && (
        <div>
          <div className="cx-dur-sub">Distribuição de duração (chamadas atendidas)</div>
          <div className="cx-dur-bars">
            {buckets.map((b, i) => {
              const val = bucketValues[i];
              if (val === 0) return null;
              const widthPct = Math.max(2, Math.round((val / totalBuckets) * 100));
              return (
                <div key={b.key}
                  className="cx-dur-seg"
                  style={{ width: `${widthPct}%`, background: b.color }}
                  title={`${b.desc}: ${val} chamadas`}>
                  {widthPct > 8 ? `${Math.round((val / totalBuckets) * 100)}%` : ""}
                </div>
              );
            })}
          </div>
          <div className="cx-dur-legend">
            {buckets.map((b, i) => {
              const val = bucketValues[i];
              if (val === 0) return null;
              return (
                <div key={b.key} className="cx-dl-item">
                  <span className="cx-dl-dot" style={{ background: b.color }} />
                  {b.label} ({val})
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
  "customer-ended-call":   "#00D68F",
  "assistant-ended-call":  "#00C2FF",
  "no-answer":             "#666",
  "customer-did-not-answer": "#666",
  "busy":                  "#FFB800",
  "customer-busy":         "#FFB800",
  "voicemail":             "#A855F7",
  "machine_end_silence":   "#A855F7",
  "silence-timed-out":     "#A855F7",
  "failed":                "#E8002D",
  "pipeline-error":        "#E8002D",
};

function EndReasonsSection({ data }: { data: AnalyticsData }) {
  const reasons = Object.entries(data.endedReasonRaw ?? {})
    .filter(([k]) => k !== "null")
    .sort(([, a], [, b]) => b - a);

  if (reasons.length === 0) return null;

  const total = reasons.reduce((s, [, v]) => s + v, 0);
  const maxVal = Math.max(1, ...reasons.map(([, v]) => v));

  return (
    <div className="gc cx-mot-card">
      <div className="cx-card-title" style={{ marginBottom: 6 }}>Motivos de Encerramento</div>
      <div className="cx-card-sub" style={{ marginBottom: 16 }}>{total} chamadas</div>
      <div className="cx-mot-rows">
        {reasons.map(([key, count]) => {
          const label = END_REASON_PT[key] ?? key;
          const barColor = END_REASON_COLOR[key] ?? "#666";
          const barWidth = Math.round((count / maxVal) * 100);
          return (
            <div key={key} className="cx-mot-row">
              <span className="cx-mot-name" title={key}>{label}</span>
              <div className="cx-mot-bar">
                <div className="cx-mot-fill" style={{ width: `${barWidth}%`, background: barColor }} />
              </div>
              <span className="cx-mot-val">{count} <span className="cx-mot-pct">({pct(count, total)})</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, gradClass = "grad-white", iconBg }: {
  title: string; value: string; sub?: string; icon: React.ElementType; gradClass?: string; iconBg?: string;
}) {
  return (
    <div className="gc cx-kpi-card">
      <div className="cx-kpi-head">
        <span className="cx-kpi-label">{title}</span>
        <div className="cx-kpi-icon" style={iconBg ? { background: iconBg } : undefined}>
          <Icon style={{ width: 16, height: 16 }} />
        </div>
      </div>
      <div className={`cx-kpi-value ${gradClass}`}>{value}</div>
      {sub && <div className="cx-kpi-badge">{sub}</div>}
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
  const [selectedWeekBar, setSelectedWeekBar] = useState<number | null>(null);
  const [selectedHourBar, setSelectedHourBar] = useState<number | null>(null);
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
      {/* Filtros */}
      <div className="gc" style={{ padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Filter style={{ width: 14, height: 14, color: "var(--text-3)" }} />
          <select
            className="cx-select"
            value={selectedAssistant || ""}
            onChange={(e) => setFilter("assistantId", e.target.value)}
          >
            <option value="">Todos os Assistentes</option>
            {data?.assistants.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <select
          className="cx-select"
          value={selectedQueue || ""}
          onChange={(e) => setFilter("queueId", e.target.value)}
        >
          <option value="">Todas as Campanhas</option>
          {visibleCampaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div style={{ marginLeft: "auto" }} className="cx-period-tabs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setFilter("days", String(d))}
              className={`cx-period-tab ${selectedDays === String(d) ? "active" : ""}`}
            >
              {d}D
            </button>
          ))}
        </div>

        <button
          onClick={() => load(true)}
          className="cx-refresh-btn"
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
        >
          <RefreshCw style={{ width: 14, height: 14, ...(refreshing ? { animation: "cx-spin .8s linear infinite" } : {}) }} />
          Sincronizar
        </button>
      </div>

      {/* Barra de minutos contratados */}
      {minutesData && (
        <div className="gc cx-minutes-bar" style={{ marginBottom: 24 }}>
          <div className="cx-min-label">
            <Zap style={{ width: 14, height: 14, display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            {usedMinutes} / {minutesData.contracted} min
            {minutesData.blocked && (
              <span style={{ color: "var(--red)", marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const }}>
                Suspensa
              </span>
            )}
          </div>
          <div className="cx-min-track">
            <div className="cx-min-fill" style={{ width: `${Math.min(100, minutesPct)}%` }} />
          </div>
          <div className="cx-min-value">{minutesPct}%</div>
        </div>
      )}

      {loading ? (
        <div className="cx-loading" style={{ height: 256 }}>
          <div className="cx-spinner" />
          Carregando analytics...
        </div>
      ) : !data ? (
        <div className="gc" style={{ padding: 48, textAlign: "center" }}>
          <Activity style={{ width: 32, height: 32, margin: "0 auto 16px", opacity: 0.15 }} />
          <div className="cx-card-title" style={{ marginBottom: 8 }}>Sem Dados Analíticos</div>
          <div className="cx-card-sub">Inicie uma campanha para gerar insights neste dashboard.</div>
        </div>
      ) : (
        <div>
          {/* KPI Grid */}
          <div className="cx-kpi-grid" style={{ marginBottom: 24 }}>
            <StatCard title="Total de Leads" value={data.totalLeads.toLocaleString("pt-BR")} icon={Users} gradClass="grad-red" iconBg="rgba(232,0,45,0.15)" />
            <StatCard title="Total de Chamadas" value={data.totalCalls.toLocaleString("pt-BR")} icon={PhoneCall} gradClass="grad-cyan" iconBg="rgba(0,194,255,0.12)" />
            <StatCard title="Taxa de Atendimento" value={`${answeredPct}%`} sub={`${data.answeredCalls.toLocaleString()} atendidas`} icon={Activity} gradClass="grad-green" iconBg="rgba(0,214,143,0.12)" />
            <StatCard
              title="Conversões"
              value={data.structuredOutputsConfigured ? (successPct != null ? `${successPct}%` : "—") : "—"}
              sub={data.structuredOutputsConfigured ? `${data.structuredSuccessCalls}/${data.structuredWithOutput}` : "Offline"}
              icon={CheckCircle2}
              gradClass="grad-green"
              iconBg="rgba(0,214,143,0.12)"
            />
          </div>

          {/* Mid Section: Heatmap + Right Panel */}
          <div className="cx-mid-grid" style={{ marginBottom: 24 }}>
            {/* Heatmap */}
            <HeatmapSection data={data} />

            {/* Right Panel */}
            <div className="cx-rp">
              {/* Donut: Answer Rate */}
              <div className="gc cx-donut-section">
                <div className="cx-card-title" style={{ marginBottom: 14 }}>Taxa de Atendimento</div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div className="cx-donut-wrap">
                    <svg viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--green)" strokeWidth="3.5"
                        strokeDasharray={`${answeredPct} ${100 - answeredPct}`}
                        strokeDashoffset="25" strokeLinecap="round" />
                    </svg>
                    <div className="cx-donut-center">
                      <div className="cx-donut-pct">{answeredPct}%</div>
                      <div className="cx-donut-lbl">Connect</div>
                    </div>
                  </div>
                  <div className="cx-rate-rows">
                    {[
                      { label: "Atendidas", value: data.answeredCalls, color: "var(--green)" },
                      { label: "Não atendidas", value: data.notAnsweredCalls, color: "#E8002D" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="cx-rr-meta">
                          <span className="cx-rr-name">{label}</span>
                          <span className="cx-rr-val">{value} <span className="cx-rr-pct">({pct(value, data.totalCalls)})</span></span>
                        </div>
                        <div className="cx-rr-bar">
                          <div className="cx-rr-fill" style={{ width: pct(value, data.totalCalls), background: color }} />
                        </div>
                      </div>
                    ))}
                    {data.structuredOutputsConfigured && data.structuredWithOutput > 0 && (
                      <div>
                        <div className="cx-rr-meta">
                          <span className="cx-rr-name">Conversões</span>
                          <span className="cx-rr-val">{data.structuredSuccessCalls} <span className="cx-rr-pct">({pct(data.structuredSuccessCalls, data.structuredWithOutput)})</span></span>
                        </div>
                        <div className="cx-rr-bar">
                          <div className="cx-rr-fill" style={{ width: pct(data.structuredSuccessCalls, data.structuredWithOutput), background: "var(--purple)" }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Costs */}
              {!isMember && (
                <div className="gc cx-costs-section">
                  <div className="cx-card-title">Análise de Custos</div>
                  <div className="cx-cost-grid">
                    <div className="cx-cost-item">
                      <div className="cx-ci-lbl">Custo total</div>
                      <div className="cx-ci-val cx-ci-accent">${data.totalCost.toFixed(2)}</div>
                    </div>
                    {data.totalCalls > 0 && (
                      <div className="cx-cost-item">
                        <div className="cx-ci-lbl">Por chamada</div>
                        <div className="cx-ci-val">${(data.totalCost / data.totalCalls).toFixed(4)}</div>
                      </div>
                    )}
                    {data.answeredCalls > 0 && (
                      <div className="cx-cost-item">
                        <div className="cx-ci-lbl">Por atendida</div>
                        <div className="cx-ci-val">${(data.totalCost / data.answeredCalls).toFixed(4)}</div>
                      </div>
                    )}
                    {data.totalDurationSec > 0 && (
                      <div className="cx-cost-item">
                        <div className="cx-ci-lbl">Por minuto</div>
                        <div className="cx-ci-val">${(data.totalCost / (data.totalDurationSec / 60)).toFixed(4)}</div>
                      </div>
                    )}
                    {data.totalLeads > 0 && (
                      <div className="cx-cost-item">
                        <div className="cx-ci-lbl">Por lead</div>
                        <div className="cx-ci-val">${(data.totalCost / data.totalLeads).toFixed(4)}</div>
                      </div>
                    )}
                    {data.costPerConversion != null && (
                      <div className="cx-cost-item">
                        <div className="cx-ci-lbl">Por conversão</div>
                        <div className="cx-ci-val cx-ci-accent">${data.costPerConversion.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Charts: Weekly + Hourly volume */}
          <div className="cx-bot-grid" style={{ marginBottom: 24 }}>
            <div className="gc cx-chart-card">
              <div className="cx-card-title">Volume por Dia da Semana</div>
              {weekData.every((v) => v === 0) ? (
                <div className="cx-card-sub" style={{ textAlign: "center", padding: "32px 0" }}>Sem dados ainda</div>
              ) : (
                <div className="cx-bar-chart">
                  {weekData.map((val, i) => (
                    <div key={i} className={`cx-bar-col${selectedWeekBar === i ? " selected" : ""}`} onClick={() => setSelectedWeekBar(selectedWeekBar === i ? null : i)}>
                      <div className="cx-bar-area" style={{ position: "relative" }}>
                        <div className="cx-bar-fill" style={{ height: maxWeek > 0 ? `${Math.max(2, Math.round((val / maxWeek) * 100))}%` : "0" }} />
                        {selectedWeekBar === i && <div className="cx-bar-tooltip">{val.toLocaleString("pt-BR")} chamadas</div>}
                      </div>
                      <span className="cx-bar-lbl">{WEEKDAY_LABELS[i + 1]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="gc cx-chart-card">
              <div className="cx-card-title">Volume por Hora do Dia</div>
              {hourData.every((v) => v === 0) ? (
                <div className="cx-card-sub" style={{ textAlign: "center", padding: "32px 0" }}>Sem dados ainda</div>
              ) : (
                <div className="cx-bar-chart">
                  {hourData.map((val, i) => (
                    <div key={i} className={`cx-bar-col${selectedHourBar === i ? " selected" : ""}`} onClick={() => setSelectedHourBar(selectedHourBar === i ? null : i)}>
                      <div className="cx-bar-area" style={{ position: "relative" }}>
                        <div className="cx-bar-fill" style={{ height: maxHour > 0 ? `${Math.max(2, Math.round((val / maxHour) * 100))}%` : "0" }} />
                        {selectedHourBar === i && <div className="cx-bar-tooltip">{val.toLocaleString("pt-BR")} chamadas</div>}
                      </div>
                      <span className="cx-bar-lbl">{HOUR_LABELS[i]}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="cx-card-sub" style={{ marginTop: 8 }}>* Horários no fuso local do tenant</div>
            </div>
          </div>

          {/* Bottom Grid: Talk Time + End Reasons */}
          <div className="cx-bot-grid" style={{ marginBottom: 24 }}>
            <TalkTimeSection data={data} />
            <EndReasonsSection data={data} />
          </div>

          {/* ── AI Insights ── */}
          <div className="gc cx-ai-card" style={{ marginBottom: 24 }}>
            <div className="cx-ai-icon">
              <Sparkles style={{ width: 18, height: 18, color: "var(--red)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cx-ai-title">Insights de IA — Análise de Gargalo</div>
              <div className="cx-ai-body">
                {!selectedQueue && (
                  <span>Selecione uma campanha no filtro acima para habilitar a análise de IA.</span>
                )}
              </div>
              <button
                onClick={handleRunAiAnalysis}
                disabled={loadingAi || !selectedQueue}
                title={!selectedQueue ? "Selecione uma campanha para analisar" : ""}
                className="cx-refresh-btn"
                style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12 }}
              >
                {loadingAi ? <Loader2 style={{ width: 14, height: 14, animation: "cx-spin .8s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
                {loadingAi ? "Gerando análise..." : "Analisar Gargalos (10–40s)"}
              </button>

              {/* Current AI result */}
              {aiAnalysis && (
                <div style={{ marginTop: 16 }}>
                  <div className="cx-prose">
                    <Markdown>{aiAnalysis}</Markdown>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Analysis History ── */}
          {aiHistory.length > 0 && (
            <div className="gc cx-analysis-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div className="cx-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <History style={{ width: 16, height: 16, color: "var(--text-3)" }} />
                  Histórico de Análises
                </div>
                <span className="cx-card-sub">{aiHistory.length} registro{aiHistory.length !== 1 ? "s" : ""}</span>
              </div>

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
                  <div key={item.id} className="cx-analysis-item" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--red)" }}>{campaignName}</span>
                          <span className="cx-card-sub">{date}</span>
                        </div>
                        {!isExpanded && (
                          <div className="cx-card-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}...</div>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronUp style={{ width: 16, height: 16, color: "var(--text-3)", flexShrink: 0 }} />
                        : <ChevronDown style={{ width: 16, height: 16, color: "var(--text-3)", flexShrink: 0 }} />}
                    </div>

                    {isExpanded && (
                      <div className="cx-prose" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--glass-border)" }}>
                        <Markdown>{item.content}</Markdown>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
