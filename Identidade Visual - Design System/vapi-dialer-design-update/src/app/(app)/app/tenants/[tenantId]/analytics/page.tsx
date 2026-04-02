"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, Phone, PhoneOff, PhoneCall, DollarSign, Clock,
  Timer, Users, CheckCircle2, BarChart3, Loader2, Bot, Filter,
  Flame, Activity, TrendingUp, AlertTriangle, Sparkles, History,
  ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import Markdown from "react-markdown";
import { createClient } from "@/lib/supabase/browser";

/* ── Types ─────────────────────────────────────────────────────── */
interface Campaign { id: string; name: string; assistantId: string; }
interface AnalysisRecord {
  id: string; queue_id: string | null; content: string;
  metadata: Record<string, unknown> | null; created_at: string;
  dial_queues: { name: string } | null;
}
interface AssistantRef { id: string; name: string; }

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
  contractedMinutes?: number | null;
  usedMinutesSeconds?: number;
  minutesCacheMonth?: string | null;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function fmtSec(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtSecShort(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function heatClass(v: number) {
  if (v === 0) return "empty";
  if (v < 50)  return "hc1";
  if (v < 100) return "hc2";
  if (v < 150) return "hc3";
  if (v < 300) return "hc4";
  return "hc5";
}

const DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOURS   = [8,9,10,11,12,13,14,15,16,17,18,19,20];

/* ── Sparkline SVG ──────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const W = 160, H = 38;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - 4 - ((v / max) * (H - 8)),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H}Z`;
  const id = `sg-${color.replace("#", "")}`;
  return (
    <svg className="cx-sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={line} fill="none" stroke={color} strokeWidth="2"/>
      <path d={area} fill={`url(#${id})`}/>
    </svg>
  );
}

/* ── Donut SVG ──────────────────────────────────────────────────── */
function Donut({ pct }: { pct: number }) {
  const R = 50, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;
  return (
    <svg viewBox="0 0 120 120">
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00D68F"/>
          <stop offset="100%" stopColor="#00ffb3"/>
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11"/>
      <circle
        cx="60" cy="60" r={R} fill="none"
        stroke="url(#dg)" strokeWidth="11"
        strokeDasharray={`${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
        strokeDashoffset={(C * 0.25).toFixed(2)}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function AnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = params.tenantId as string;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<number>(90);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [barsAnimated, setBarsAnimated] = useState(false);

  const supabase = createClient();

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true); else setLoading(true);
    try {
      const qs = new URLSearchParams({ period: String(period) });
      if (selectedQueueId)     qs.set("queueId",     selectedQueueId);
      if (selectedAssistantId) qs.set("assistantId", selectedAssistantId);
      const res = await fetch(`/api/tenants/${tenantId}/analytics?${qs}`);
      if (!res.ok) { if (res.status === 401) router.push("/login"); return; }
      const json = await res.json();
      setData(json);
      // Trigger bar animations after data loads
      setTimeout(() => setBarsAnimated(true), 100);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [tenantId, period, selectedQueueId, selectedAssistantId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function fetchAnalyses() {
    const { data: rows } = await supabase
      .from("call_analyses")
      .select("id, queue_id, content, metadata, created_at, dial_queues(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (rows) setAnalyses(rows as AnalysisRecord[]);
  }

  async function generateAI() {
    setGeneratingAI(true); setAiInsight("");
    try {
      const qs = new URLSearchParams({ period: String(period) });
      if (selectedQueueId)     qs.set("queueId",     selectedQueueId);
      if (selectedAssistantId) qs.set("assistantId", selectedAssistantId);
      const res = await fetch(`/api/tenants/${tenantId}/analytics/analyze?${qs}`, { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      setAiInsight(json.analysis ?? "");
      fetchAnalyses();
    } finally { setGeneratingAI(false); }
  }

  useEffect(() => { if (showHistory) fetchAnalyses(); }, [showHistory, tenantId]);

  if (loading) {
    return (
      <div className="cx-content" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="cx-loading">
          <div className="cx-spinner" />
          Carregando analytics...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const answerRate = data.totalCalls > 0 ? Math.round((data.answeredCalls / data.totalCalls) * 100) : 0;
  const canSeeFinancial = data.userRole !== "member";
  const showConversions = data.structuredOutputsConfigured;

  /* Heatmap max value for tooltip */
  const heatMax = Math.max(...Object.values(data.byDayHour).flatMap(h => Object.values(h)), 1);

  /* Top ended reasons */
  const topReasons = Object.entries(data.endedReasonRaw)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topReasonsMax = topReasons[0]?.[1] ?? 1;

  const reasonColors: Record<string, string> = {
    "customer-ended-call":    "linear-gradient(90deg,var(--green),#00ffb3)",
    "assistant-ended-call":   "linear-gradient(90deg,var(--cyan),#80e5ff)",
    "voicemail":              "linear-gradient(90deg,var(--yellow),#ffd55e)",
    "no-answer":              "linear-gradient(90deg,var(--purple),#c084fc)",
    "busy":                   "linear-gradient(90deg,var(--yellow),#ffd55e)",
    "failed":                 "linear-gradient(90deg,var(--red),#ff4d6d)",
    "silence-timed-out":      "linear-gradient(90deg,var(--purple),#c084fc)",
    "pipeline-error":         "linear-gradient(90deg,rgba(255,255,255,0.3),rgba(255,255,255,0.15))",
    "sip-error":              "linear-gradient(90deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))",
  };
  function reasonColor(key: string) { return reasonColors[key] ?? "linear-gradient(90deg,rgba(255,255,255,0.2),rgba(255,255,255,0.1))"; }
  function reasonLabel(key: string): string {
    const map: Record<string, string> = {
      "customer-ended-call": "Cliente encerrou", "assistant-ended-call": "Assistente encerrou",
      "voicemail": "URA / Caixa postal", "no-answer": "Sem resposta", "busy": "Ocupado",
      "failed": "Falhou", "silence-timed-out": "Silêncio expirou",
      "pipeline-error": "Erro de provedor", "sip-error": "Erro SIP",
    };
    return map[key] ?? key;
  }

  /* Duration buckets */
  const buckets = [
    { label: "< 10s",   key: "0-10",   color: "#E8002D",                       shade: "linear-gradient(135deg,#E8002D,#c8001f)" },
    { label: "10s–1min",key: "10-60",  color: "rgba(232,0,45,0.55)",           shade: "linear-gradient(135deg,rgba(232,0,45,0.55),rgba(200,0,31,0.45))" },
    { label: "1–3 min", key: "60-180", color: "rgba(232,0,45,0.25)",           shade: "rgba(232,0,45,0.2)" },
    { label: "3+ min",  key: "180+",   color: "rgba(232,0,45,0.12)",           shade: "rgba(232,0,45,0.12)" },
  ];
  const bucketsTotal = buckets.reduce((s, b) => s + (data.durationBuckets[b.key] ?? 0), 0) || 1;

  /* Minutes bar */
  const usedSec = data.usedMinutesSeconds ?? 0;
  const contracted = data.contractedMinutes ?? null;
  const usedMin = Math.ceil(usedSec / 60);
  const minPct = contracted ? Math.min(100, Math.round((usedMin / contracted) * 100)) : 0;
  const showMinutesBar = contracted != null;

  /* Hourly sparkline data */
  const hourlyData = HOURS.map(h => data.byHour[String(h)] ?? 0);

  return (
    <>
      {/* ── TOPBAR actions (injected into layout topbar via portal — or just here) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {/* Campaign filter */}
        <select
          className="cx-select"
          value={selectedQueueId}
          onChange={e => setSelectedQueueId(e.target.value)}
        >
          <option value="">Todas as campanhas</option>
          {data.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Assistant filter */}
        <select
          className="cx-select"
          value={selectedAssistantId}
          onChange={e => setSelectedAssistantId(e.target.value)}
        >
          <option value="">Todos os assistentes</option>
          {data.assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* Period tabs */}
        <div className="cx-period-tabs">
          {[7, 30, 90, 365].map(d => (
            <button key={d} className={`cx-period-tab${period === d ? " active" : ""}`} onClick={() => setPeriod(d)}>
              {d === 365 ? "1 ano" : `${d}d`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button className="cx-refresh-btn" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw size={13} style={{ animation: refreshing ? "cx-spin .8s linear infinite" : "none" }} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* ── MINUTES BAR ──────────────────────────────────────────── */}
      {showMinutesBar && (
        <div className="gc cx-minutes-bar">
          <span className="cx-min-label">Minutos {data.minutesCacheMonth ?? ""}</span>
          <div className="cx-min-track">
            <div className="cx-min-fill" id="minFill" style={{ width: `${minPct}%` }} />
          </div>
          <span className="cx-min-value">{usedMin} / {contracted} min ({minPct}%)</span>
        </div>
      )}

      {/* ── KPI GRID ─────────────────────────────────────────────── */}
      <div className="cx-kpi-grid">
        {/* Total leads */}
        <div className="gc cx-kpi-card k1">
          <div className="cx-kpi-head">
            <span className="cx-kpi-label">Total de Leads</span>
            <div className="cx-kpi-icon" style={{ background: "rgba(232,0,45,0.12)" }}>
              <Users size={15} color="#E8002D" />
            </div>
          </div>
          <div className="cx-kpi-value grad-red">{data.totalLeads.toLocaleString("pt-BR")}</div>
          <Sparkline data={hourlyData} color="#E8002D" />
        </div>

        {/* Chamadas realizadas */}
        <div className="gc cx-kpi-card k2">
          <div className="cx-kpi-head">
            <span className="cx-kpi-label">Chamadas Realizadas</span>
            <div className="cx-kpi-icon" style={{ background: "rgba(0,194,255,0.12)" }}>
              <PhoneCall size={15} color="#00C2FF" />
            </div>
          </div>
          <div className="cx-kpi-value grad-cyan">{data.totalCalls.toLocaleString("pt-BR")}</div>
          <Sparkline data={hourlyData} color="#00C2FF" />
        </div>

        {/* Chamadas atendidas */}
        <div className="gc cx-kpi-card k3">
          <div className="cx-kpi-head">
            <span className="cx-kpi-label">Chamadas Atendidas</span>
            <div className="cx-kpi-icon" style={{ background: "rgba(0,214,143,0.12)" }}>
              <Phone size={15} color="#00D68F" />
            </div>
          </div>
          <div className="cx-kpi-value grad-green">{data.answeredCalls.toLocaleString("pt-BR")}</div>
          <div className="cx-kpi-foot">
            <Sparkline data={hourlyData.map((v, i) => Math.round(v * (answerRate / 100)))} color="#00D68F" />
            <span className="cx-kpi-badge">{answerRate}% do total</span>
          </div>
        </div>

        {/* Conversões */}
        {showConversions ? (
          <div className="gc cx-kpi-card k4">
            <div className="cx-kpi-head">
              <span className="cx-kpi-label">Conversões</span>
              <div className="cx-kpi-icon" style={{ background: "rgba(168,85,247,0.12)" }}>
                <CheckCircle2 size={15} color="#A855F7" />
              </div>
            </div>
            <div className="cx-kpi-value grad-white">{data.structuredSuccessCalls.toLocaleString("pt-BR")}</div>
            <div className="cx-kpi-foot">
              <Sparkline data={hourlyData.map(v => Math.round(v * 0.02))} color="#A855F7" />
              <span className="cx-kpi-badge">
                {data.answeredCalls > 0 ? Math.round((data.structuredSuccessCalls / data.answeredCalls) * 100) : 0}% taxa
              </span>
            </div>
          </div>
        ) : (
          <div className="gc cx-kpi-card k4">
            <div className="cx-kpi-head">
              <span className="cx-kpi-label">Duração Média</span>
              <div className="cx-kpi-icon" style={{ background: "rgba(168,85,247,0.12)" }}>
                <Clock size={15} color="#A855F7" />
              </div>
            </div>
            <div className="cx-kpi-value grad-white">{fmtSecShort(data.avgDurationSec)}</div>
            <div className="cx-kpi-foot">
              <Sparkline data={hourlyData} color="#A855F7" />
              <span className="cx-kpi-badge">máx {fmtSecShort(data.maxDurationSec)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── MID GRID: Heatmap + Right Panel ──────────────────────── */}
      <div className="cx-mid-grid">

        {/* Heatmap */}
        <div className="gc cx-hmap-card">
          <div className="cx-hmap-head">
            <div>
              <div className="cx-card-title">Heatmap — Dia × Hora</div>
              <div className="cx-card-sub">Volume de tentativas por período</div>
            </div>
            <div className="cx-hmap-legend">
              <div className="cx-leg-item"><div className="cx-leg-dot" style={{ background: "rgba(232,0,45,0.22)" }} />&lt; 50</div>
              <div className="cx-leg-item"><div className="cx-leg-dot" style={{ background: "rgba(232,0,45,0.5)" }} />50–150</div>
              <div className="cx-leg-item"><div className="cx-leg-dot" style={{ background: "rgba(232,0,45,0.78)" }} />150+</div>
              <div className="cx-leg-item"><div className="cx-leg-dot" style={{ background: "#E8002D", boxShadow: "0 0 6px rgba(232,0,45,0.7)" }} />300+</div>
            </div>
          </div>

          {/* Hours header */}
          <div className="cx-hmap-hours">
            <div />
            {HOURS.map(h => <div key={h} className="cx-hmap-hlabel">{h}h</div>)}
          </div>

          {/* Day rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {DAYS_PT.map((day, di) => {
              const dayKey = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"][di];
              return (
                <div key={day} className="cx-hmap-row">
                  <span className="cx-hmap-day">{day}</span>
                  {HOURS.map(h => {
                    const v = data.byDayHour[dayKey]?.[String(h)] ?? 0;
                    const cls = heatClass(v);
                    return (
                      <div key={h} className={`cx-hmap-cell ${cls}`} title={`${day} ${h}h: ${v} chamadas`}>
                        {cls !== "empty" ? v : ""}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Stats row */}
          <div className="cx-hmap-stats">
            <div>
              <div className="cx-hmap-stt">Total Tentativas</div>
              <div className="cx-hmap-stv">{data.totalCalls.toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="cx-hmap-stt">Média por Hora</div>
              <div className="cx-hmap-stv">
                {(data.totalCalls / Math.max(1, HOURS.length * DAYS_PT.filter((_,i)=>i<5).length)).toFixed(1)}
              </div>
            </div>
            <div>
              <div className="cx-hmap-stt">Hora mais movim.</div>
              <div className="cx-hmap-stv accent">
                {(() => {
                  let maxH = 8, maxV = 0;
                  HOURS.forEach(h => { const v = data.byHour[String(h)] ?? 0; if (v > maxV) { maxV = v; maxH = h; } });
                  return `${maxH}h`;
                })()}
              </div>
            </div>
            <div>
              <div className="cx-hmap-stt">Dia mais movim.</div>
              <div className="cx-hmap-stv accent">
                {(() => {
                  let maxDay = "Seg", maxV = 0;
                  DAYS_PT.forEach((d, i) => {
                    const key = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"][i];
                    const v = Object.values(data.byDayHour[key] ?? {}).reduce((s: number, n) => s + (n as number), 0);
                    if (v > maxV) { maxV = v; maxDay = d; }
                  });
                  return maxDay;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="cx-rp">
          {/* Taxa de atendimento */}
          <div className="gc cx-donut-section">
            <div className="cx-card-title" style={{ marginBottom: 16 }}>Taxa de Atendimento</div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div className="cx-donut-wrap">
                <Donut pct={answerRate} />
                <div className="cx-donut-center">
                  <div className="cx-donut-pct">{answerRate}%</div>
                  <div className="cx-donut-lbl">connect</div>
                </div>
              </div>
              <div className="cx-rate-rows">
                {[
                  { label: "Atendidas",      val: data.answeredCalls,    pct: answerRate,                                                color: "linear-gradient(90deg,#00D68F,#00ffb3)",            textColor: "#00D68F" },
                  { label: "Não atendidas",  val: data.notAnsweredCalls, pct: data.totalCalls > 0 ? Math.round(data.notAnsweredCalls/data.totalCalls*100) : 0, color: "linear-gradient(90deg,var(--red),#ff4d6d)",         textColor: "var(--text-1)" },
                  ...(showConversions ? [{ label: "Conversões", val: data.structuredSuccessCalls, pct: data.answeredCalls > 0 ? Math.round(data.structuredSuccessCalls/data.answeredCalls*100) : 0, color: "linear-gradient(90deg,var(--purple),#c084fc)", textColor: "var(--text-1)" }] : []),
                ].map(row => (
                  <div key={row.label}>
                    <div className="cx-rr-meta">
                      <span className="cx-rr-name">{row.label}</span>
                      <span className="cx-rr-val" style={{ color: row.textColor }}>
                        {row.val.toLocaleString("pt-BR")} <span className="cx-rr-pct">({row.pct}%)</span>
                      </span>
                    </div>
                    <div className="cx-rr-bar">
                      <div className="cx-rr-fill" style={{ width: `${row.pct}%`, background: row.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Custos */}
          {canSeeFinancial && (
            <div className="gc cx-costs-section">
              <div className="cx-card-title">Análise de Custos</div>
              <div className="cx-cost-grid">
                <div className="cx-cost-item">
                  <div className="cx-ci-lbl">Gasto Total</div>
                  <div className="cx-ci-val">${data.totalCost.toFixed(2)}</div>
                  <div className="cx-ci-sub">Período de {period} dias</div>
                </div>
                <div className="cx-cost-item">
                  <div className="cx-ci-lbl">Custo / Chamada</div>
                  <div className="cx-ci-val">${data.totalCalls > 0 ? (data.totalCost / data.totalCalls).toFixed(3) : "0.000"}</div>
                  <div className="cx-ci-sub">Por tentativa</div>
                </div>
                <div className="cx-cost-item">
                  <div className="cx-ci-lbl">Custo / Atendida</div>
                  <div className="cx-ci-val">${data.answeredCalls > 0 ? (data.totalCost / data.answeredCalls).toFixed(3) : "0.000"}</div>
                  <div className="cx-ci-sub">Por conexão</div>
                </div>
                <div className="cx-cost-item">
                  <div className="cx-ci-lbl">Custo / Conversão</div>
                  <div className="cx-ci-val cx-ci-accent">
                    {data.costPerConversion != null ? `$${data.costPerConversion.toFixed(2)}` : "—"}
                  </div>
                  <div className="cx-ci-sub">ROI por lead convertido</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM GRID: Talk Time + Motivos ────────────────────── */}
      <div className="cx-bot-grid">
        {/* Talk time */}
        <div className="gc cx-tt-card">
          <div className="cx-card-title">Talk Time Breakdown</div>
          <div className="cx-tt-meta">
            <div>
              <div className="cx-tt-lbl">Total em ligação</div>
              <div className="cx-tt-val white">{fmtSec(data.totalDurationSec)}</div>
            </div>
            <div>
              <div className="cx-tt-lbl">Atendidas</div>
              <div className="cx-tt-val green">{fmtSec(data.totalDurationAnsweredSec)}</div>
            </div>
            <div>
              <div className="cx-tt-lbl">Média (Atend.)</div>
              <div className="cx-tt-val yellow">{fmtSecShort(data.avgDurationSec)}</div>
            </div>
            <div>
              <div className="cx-tt-lbl">Máximo</div>
              <div className="cx-tt-val white">{fmtSecShort(data.maxDurationSec)}</div>
            </div>
          </div>

          <div className="cx-dur-sub">Distribuição de duração (chamadas atendidas)</div>
          <div className="cx-dur-bars">
            {buckets.map(b => {
              const v = data.durationBuckets[b.key] ?? 0;
              const flex = Math.max(1, Math.round((v / bucketsTotal) * 100));
              const pct = Math.round((v / bucketsTotal) * 100);
              return (
                <div key={b.key} className="cx-dur-seg" style={{ flex, background: b.shade }} title={`${b.label}: ${v} chamadas (${pct}%)`}>
                  {pct > 5 ? `${pct}%` : ""}
                </div>
              );
            })}
          </div>
          <div className="cx-dur-legend">
            {buckets.map(b => (
              <div key={b.key} className="cx-dl-item">
                <div className="cx-dl-dot" style={{ background: b.color }} />
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* Motivos de encerramento */}
        <div className="gc cx-mot-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="cx-card-title">Motivos de Encerramento</div>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace" }}>
              {data.totalCalls.toLocaleString("pt-BR")} chamadas
            </span>
          </div>
          <div className="cx-mot-rows">
            {topReasons.map(([key, val]) => {
              const pct = Math.round((val / data.totalCalls) * 100);
              return (
                <div key={key} className="cx-mot-row">
                  <span className="cx-mot-name">{reasonLabel(key)}</span>
                  <div className="cx-mot-bar">
                    <div className="cx-mot-fill" style={{ width: `${(val / topReasonsMax) * 100}%`, background: reasonColor(key) }} />
                  </div>
                  <span className="cx-mot-val">
                    {val.toLocaleString("pt-BR")} <span className="cx-mot-pct">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── AI INSIGHT ───────────────────────────────────────────── */}
      <div className="gc cx-ai-card">
        <div className="cx-ai-icon">
          <Zap size={18} color="#E8002D" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="cx-ai-title">Insight de IA — Análise de Gargalo</div>
          {aiInsight ? (
            <div className="cx-ai-body cx-prose">
              <Markdown>{aiInsight}</Markdown>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <p className="cx-ai-body">
                Gere uma análise inteligente do seu funil de chamadas com recomendações personalizadas de script e horário.
              </p>
              <button
                className="cx-refresh-btn"
                style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                onClick={generateAI}
                disabled={generatingAI}
              >
                {generatingAI
                  ? <><Loader2 size={13} style={{ animation: "cx-spin .8s linear infinite" }} /> Analisando...</>
                  : <><Sparkles size={13} /> Gerar análise</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── HISTÓRICO DE ANÁLISES ─────────────────────────────────── */}
      <div className="gc cx-analysis-card">
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setShowHistory(v => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <History size={16} color="var(--text-3)" />
            <div className="cx-card-title">Histórico de Análises</div>
          </div>
          {showHistory ? <ChevronUp size={16} color="var(--text-3)" /> : <ChevronDown size={16} color="var(--text-3)" />}
        </div>

        {showHistory && (
          <div style={{ marginTop: 14 }}>
            {analyses.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-3)", padding: "8px 0" }}>Nenhuma análise gerada ainda.</p>
            ) : (
              analyses.map(a => (
                <div
                  key={a.id}
                  className="cx-analysis-item"
                  onClick={() => setExpandedAnalysis(expandedAnalysis === a.id ? null : a.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                        {a.dial_queues?.name ?? "Geral"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 10 }}>
                        {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {expandedAnalysis === a.id ? <ChevronUp size={14} color="var(--text-3)" /> : <ChevronDown size={14} color="var(--text-3)" />}
                  </div>
                  {expandedAnalysis === a.id && (
                    <div className="cx-prose" style={{ marginTop: 12 }}>
                      <Markdown>{a.content}</Markdown>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
