"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  FileBarChart2,
  TrendingDown,
  Users,
  Clock,
  DollarSign,
  PhoneCall,
  PhoneMissed,
  BarChart3,
  ChevronDown,
  Loader2,
  Printer,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
  Zap,
  TrendingUp,
  ArrowRight,
  Settings2,
  ShieldCheck,
  Bot,
  Sparkles,
} from "lucide-react";
import Markdown from "react-markdown";
import { createClient } from "@/lib/supabase/browser";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign { id: string; name: string }

interface FieldAnalysis {
  key: string;
  type: "enum" | "number" | "boolean" | "text";
  count: number;
  distribution?: Record<string, number>;
  avg?: number;
  min?: number;
  max?: number;
  trueCount?: number;
  falseCount?: number;
  samples?: string[];
}

interface FunnelStage {
  label: string;
  cumulative: number;
  stopped: number;
  pct: number;
  dropoff: number | null;
}

interface OpportunitiesCard {
  techIssueCount: number;
  techIssuePct: number;
  avgDealValue: number | null;
  potentialValue: number | null;
  hasConfig: boolean;
}

interface DossieData {
  campaign: { id: string; name: string } | undefined;
  period: { days: number; since: string };
  avgDealValue: number | null;
  overview: {
    totalCalls: number;
    answeredCalls: number;
    answerRate: number;
    totalCost: number;
    avgCostPerCall: number;
    structuredOutputsCount: number;
    structuredOutputsRate: number;
  };
  durationAnalysis: {
    buckets: Record<string, number>;
    avg: number;
    total: number;
    voicemailCount: number;
  };
  funnelAnalysis: {
    stages: FunnelStage[];
    totalWithData: number;
    hasData: boolean;
  };
  opportunitiesCard: OpportunitiesCard;
  fieldAnalysis: FieldAnalysis[];
  correlations: Record<string, Record<string, { count: number; avgDuration: number }>>;
  endedReasonBreakdown: Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}

function fmtCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getEngagementLabel(seconds: number): string {
  if (seconds < 10)  return "Abandono imediato";
  if (seconds < 30)  return "Engajamento mínimo";
  if (seconds < 60)  return "Conversa curta";
  if (seconds < 180) return "Conversa moderada";
  if (seconds < 300) return "Boa conversa";
  return "Conversa longa";
}

// ─── 1. Hero Metrics ──────────────────────────────────────────────────────────

function HeroMetrics({ overview, durationAvg }: {
  overview: DossieData["overview"];
  durationAvg: number;
}) {
  const notAnsweredPct = 100 - overview.answerRate;
  const notAnsweredCount = overview.totalCalls - overview.answeredCalls;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-4 bg-[#00D68F] rounded-full" />
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Performance de Atendimento</h2>
      </div>

      {/* Hero row — métricas críticas em destaque */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Atenderam */}
        <div className="gc p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D68F]/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-[#00D68F] uppercase tracking-[2px] mb-2">Taxa de Atendimento</p>
            <p className="text-6xl font-black text-white font-mono leading-none tracking-tighter">{overview.answerRate}<span className="text-white/20 text-4xl">%</span></p>
            <div className="flex items-center gap-2 mt-4 text-xs font-bold text-white/40">
              <span className="text-white">{overview.answeredCalls.toLocaleString("pt-BR")}</span>
              <span>de</span>
              <span>{overview.totalCalls.toLocaleString("pt-BR")} chamadas</span>
            </div>
          </div>
        </div>

        {/* Não atenderam */}
        <div className="gc p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#E8002D]/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <p className="text-[10px] font-black text-[#E8002D] uppercase tracking-[2px] mb-2">Taxa de Abandono</p>
            <p className="text-6xl font-black text-white font-mono leading-none tracking-tighter">{notAnsweredPct}<span className="text-white/20 text-4xl">%</span></p>
             <div className="flex items-center gap-2 mt-4 text-xs font-bold text-white/40">
              <span className="text-white">{notAnsweredCount.toLocaleString("pt-BR")}</span>
              <span>de</span>
              <span>{overview.totalCalls.toLocaleString("pt-BR")} chamadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total", value: overview.totalCalls.toLocaleString("pt-BR"), icon: PhoneCall, color: "text-indigo-400", bg: "bg-indigo-500/10" },
          { label: "Duração média", value: fmtDuration(durationAvg), icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Custo total", value: fmtCurrency(overview.totalCost), icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
          { label: "Custo / call", value: fmtCurrency(overview.avgCostPerCall), icon: DollarSign, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "AI Structured", value: `${overview.structuredOutputsRate}%`, icon: Sparkles, color: "text-[#00D68F]", bg: "bg-[#00D68F]/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="gc p-3.5 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0 border border-white/5`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider leading-tight">{label}</p>
              <p className="text-[13px] font-black text-white font-mono leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── 2. Gráfico de Abandono com pico anotado ──────────────────────────────────

function AbandonmentChart({ durationAnalysis }: { durationAnalysis: DossieData["durationAnalysis"] }) {
  const BUCKET_ORDER  = ["0–10s", "10–30s", "30–60s", "1–3min", "3–5min", "5min+"];
  // CallX Palette
  const BUCKET_COLORS = ["#E8002D", "#F97316", "#FACC15", "#A3E635", "#00D68F", "#22D3EE"];

  const buckets = BUCKET_ORDER.map((k, i) => ({
    label: k,
    value: durationAnalysis.buckets[k] ?? 0,
    color: BUCKET_COLORS[i],
  }));

  const maxValue = Math.max(...buckets.map((b) => b.value), 1);
  const peakIdx  = buckets.reduce((best, b, i) => b.value > buckets[best].value ? i : best, 0);
  const total    = durationAnalysis.total;

  const earlyCount = (durationAnalysis.buckets["0–10s"] ?? 0) + (durationAnalysis.buckets["10–30s"] ?? 0);
  const earlyPct   = total > 0 ? Math.round((earlyCount / total) * 100) : 0;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-4 bg-[#E8002D] rounded-full" />
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Mapa de Engajamento Temporário</h2>
      </div>

      <div className="gc p-6">
        {total === 0 ? (
          <p className="text-sm text-white/20 text-center py-8 font-bold italic uppercase tracking-widest">Nenhuma chamada processada</p>
        ) : (
          <>
            {durationAnalysis.voicemailCount > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-500/5 border border-amber-500/20 px-4 py-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Info className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <p className="text-xs text-amber-200/60 leading-relaxed">
                  <strong className="text-amber-400 font-black uppercase tracking-tight">{durationAnalysis.voicemailCount} chamadas</strong> foram identificadas como caixa postal e removidas desta análise de retenção humana.
                </p>
              </div>
            )}

            {/* Barras verticais */}
            <div className="flex items-end gap-3" style={{ height: "200px" }}>
              {buckets.map((b, i) => {
                const barH    = maxValue > 0 ? Math.max(Math.round((b.value / maxValue) * 160), b.value > 0 ? 4 : 0) : 0;
                const callPct = total > 0 ? Math.round((b.value / total) * 100) : 0;
                const isPeak  = i === peakIdx && b.value > 0;

                return (
                  <div key={b.label} className="flex-1 flex flex-col items-center justify-end group" style={{ height: "200px" }}>
                    <div className={`mb-2 transition-all duration-300 ${isPeak ? "opacity-100 scale-100" : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"}`}>
                       <span className="text-[10px] font-black text-white bg-white/10 px-2 py-0.5 rounded-full border border-white/10 whitespace-nowrap">
                         {callPct}% {isPeak ? "▲ PICO" : ""}
                       </span>
                    </div>

                    <div
                      className="w-full rounded-t-xl transition-all duration-500 group-hover:brightness-125"
                      style={{
                        height: `${barH}px`,
                        background: `linear-gradient(to top, ${b.color}40, ${b.color})`,
                        boxShadow: isPeak ? `0 0 20px -5px ${b.color}` : "none",
                      }}
                    />

                    <div className="mt-3 text-center">
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest leading-tight mb-1">{b.label}</p>
                      <p className="text-xs text-white font-mono">{b.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Diagnóstico automático */}
            <div className={`mt-8 flex items-start gap-3 rounded-xl p-4 border transition-all ${
              earlyPct > 40
                ? "bg-[#E8002D]/5 border-[#E8002D]/20"
                : earlyPct > 20
                  ? "bg-amber-500/5 border-amber-500/20"
                  : "bg-[#00D68F]/5 border-[#00D68F]/20"
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/5 ${
                earlyPct > 40 ? "bg-[#E8002D]/20 animate-pulse" : earlyPct > 20 ? "bg-amber-500/20" : "bg-[#00D68F]/20"
              }`}>
                <AlertCircle className={`w-4 h-4 ${
                  earlyPct > 40 ? "text-[#E8002D]" : earlyPct > 20 ? "text-amber-500" : "text-[#00D68F]"
                }`} />
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[2px] mb-1 ${
                  earlyPct > 40 ? "text-[#E8002D]" : earlyPct > 20 ? "text-amber-500" : "text-[#00D68F]"
                }`}>
                  Insight do Especialista AI
                </p>
                <p className="text-xs text-white/70 leading-relaxed font-medium">
                  {earlyPct > 40
                    ? <>Crítico: <strong className="text-white">{earlyPct}% das conversas</strong> morrem em menos de 30s. A abertura do assistente está gerando bloqueio imediato ou falha de identificação.</>
                    : earlyPct > 20
                      ? <>Alerta: <strong className="text-white">{earlyPct}% de abandono precoce</strong>. Melhore o gatilho de interesse nos primeiros 15 segundos da conversa.</>
                      : <>Saudável: Baixo índice de abandono inicial. A introdução e o tom de voz do assistente estão engajando os clientes com sucesso.</>
                  }
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ─── 3. Funil com forma visual real ───────────────────────────────────────────

function FunnelSection({ funnel }: { funnel: DossieData["funnelAnalysis"] }) {
  if (!funnel.hasData || funnel.stages.length === 0) return null;

  const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

  const worstDropoff = funnel.stages.reduce((worst, s) =>
    s.dropoff !== null && s.dropoff > (worst?.dropoff ?? 0) ? s : worst,
    null as FunnelStage | null
  );

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-4 bg-violet-500 rounded-full" />
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Gargalos por Etapas</h2>
      </div>

      <div className="gc p-8">
        <div className="flex flex-col items-center gap-0 max-w-2xl mx-auto">
          {funnel.stages.map((stage, i) => {
            const barWidth = Math.max(stage.pct, 8);
            const isLast   = i === funnel.stages.length - 1;
            const color    = STAGE_COLORS[i] ?? "#6366f1";

            return (
              <div key={stage.label} className="w-full flex flex-col items-center">
                {/* Barra do funil */}
                <div className="w-full flex items-center justify-center">
                  <div
                    className="relative flex items-center justify-center rounded-xl transition-all duration-500 hover:scale-[1.02] cursor-default border border-white/10"
                    style={{
                      width: `${barWidth}%`,
                      minWidth: "160px",
                      height: "52px",
                      background: `linear-gradient(to right, ${color}CC, ${color})`,
                      boxShadow: `0 8px 16px -8px ${color}66`,
                    }}
                  >
                    <div className="flex items-center gap-4 px-6 w-full justify-between">
                      <div className="min-w-0">
                         <p className="text-white text-[10px] font-black uppercase tracking-wider opacity-60 truncate">{stage.label}</p>
                         <p className="text-white text-xs font-bold opacity-40">{stage.cumulative.toLocaleString("pt-BR")} leads</p>
                      </div>
                      <span className="text-white font-mono text-xl font-black">{stage.pct}<span className="text-white/20 text-sm">%</span></span>
                    </div>
                  </div>
                </div>

                {/* Seta de perda */}
                {!isLast && stage.dropoff !== null && stage.dropoff > 0 && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px w-12 bg-white/10" />
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8002D]/10 border border-[#E8002D]/20">
                       <TrendingDown className="w-3 h-3 text-[#E8002D]" />
                       <span className="text-[10px] text-[#E8002D] font-black uppercase tracking-tighter">−{stage.dropoff}% de retenção</span>
                    </div>
                    <div className="h-px w-12 bg-white/10" />
                  </div>
                )}
                {!isLast && (stage.dropoff === null || stage.dropoff === 0) && (
                  <div className="h-4" />
                )}
              </div>
            );
          })}
        </div>

        {worstDropoff && worstDropoff.dropoff !== null && worstDropoff.dropoff > 0 && (
          <div className="mt-10 flex items-start gap-4 rounded-xl bg-violet-500/5 border border-violet-500/20 p-5 max-w-2xl mx-auto">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0 border border-white/5">
              <Zap className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-violet-400 uppercase tracking-[2px] mb-1">Gargalo Estrutural Detectado</p>
              <p className="text-xs text-white/70 leading-relaxed font-medium">
                A etapa <strong className="text-white opacity-100">"{worstDropoff.label}"</strong> apresenta a maior taxa de evasão do fluxo, perdendo 
                <strong className="text-[#E8002D] ml-1">{worstDropoff.dropoff}%</strong> das oportunidades. Revise a pergunta ou o trigger de resposta de IA nesta fase específica.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 4. Painel de Saúde — booleans como scorecard ─────────────────────────────

function QualityScorecard({ fields }: { fields: FieldAnalysis[] }) {
  if (fields.length === 0) return null;

  return (
    <div className="gc p-6">
      <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
        <div className="w-8 h-8 rounded-lg bg-[#00D68F]/20 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-[#00D68F]" />
        </div>
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-[1.5px]">Checklist de Qualidade</h4>
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider">{fields[0]?.count ?? 0} chamadas auditadas</p>
        </div>
      </div>

      <div className="space-y-5">
        {fields.map((field) => {
          const yes  = field.trueCount  ?? 0;
          const no   = field.falseCount ?? 0;
          const total = yes + no;
          const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
          const isGood = yesPct >= 50;

          return (
            <div key={field.key} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isGood ? "bg-[#00D68F]" : "bg-[#E8002D]"} shadow-[0_0_8px_currentColor]`} />
                  <span className="text-xs font-bold text-white/80 group-hover:text-white transition-colors truncate max-w-[200px]">{field.key}</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="text-right">
                      <span className={`text-[11px] font-black font-mono ${isGood ? "text-[#00D68F]" : "text-[#E8002D]"}`}>{yesPct}%</span>
                      <span className="text-[10px] text-white/20 font-bold ml-1 uppercase">SIM</span>
                   </div>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-white/5 border border-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(255,255,255,0.05)]`}
                  style={{ width: `${yesPct}%`, background: isGood ? "#00D68F" : "#E8002D" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 5. Análise de campos com abas ────────────────────────────────────────────

type FieldTab = "enum" | "boolean" | "number" | "text";

function EnumCard({ field }: { field: FieldAnalysis }) {
  if (!field.distribution) return null;
  const total  = Object.values(field.distribution).reduce((s, n) => s + n, 0);
  const sorted = Object.entries(field.distribution).sort((a, b) => b[1] - a[1]);

  const COLORS = [
    "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  ];

  return (
    <div className="gc p-5 group hover:border-white/2 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[1.5px] truncate max-w-[70%]">
          {field.key}
        </h4>
        <span className="text-[10px] font-mono text-white/20">{field.count} DATA</span>
      </div>
      <div className="space-y-3">
        {sorted.map(([label, count], i) => {
          const pctValue = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-white/70 font-bold truncate max-w-[65%]">{label}</span>
                <span className="text-[11px] text-white/40 font-mono">{count} <span className="opacity-40">({pctValue}%)</span></span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${pctValue}%`, background: COLORS[i % COLORS.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumberCard({ field }: { field: FieldAnalysis }) {
  return (
    <div className="gc p-5 group hover:border-white/20 transition-all">
       <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[1.5px] mb-4">
          {field.key}
        </h4>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-3 bg-white/5 rounded-xl border border-white/5">
          <p className="text-xl font-black text-white font-mono leading-none">{field.avg}</p>
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1.5">Média</p>
        </div>
        <div className="text-center p-3">
          <p className="text-sm font-black text-white/60 font-mono leading-none">{field.min}</p>
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1.5">Mín</p>
        </div>
        <div className="text-center p-3">
          <p className="text-sm font-black text-white/60 font-mono leading-none">{field.max}</p>
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1.5">Máx</p>
        </div>
      </div>
    </div>
  );
}

function TextAccordion({ field }: { field: FieldAnalysis }) {
  const [open, setOpen] = useState(false);
  const samples = field.samples ?? [];

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-700">{field.key}</span>
          <span className="text-xs text-gray-400">{field.count} registros</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2 bg-white">
          {samples.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma amostra disponível.</p>
          ) : (
            samples.map((s, i) => (
              <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-3 leading-relaxed">
                "{s}"
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabbedFieldAnalysis({ fieldAnalysis, structuredCount }: {
  fieldAnalysis: FieldAnalysis[];
  structuredCount: number;
}) {
  const enums    = fieldAnalysis.filter((f) => f.type === "enum");
  const booleans = fieldAnalysis.filter((f) => f.type === "boolean");
  const numbers  = fieldAnalysis.filter((f) => f.type === "number");
  const texts    = fieldAnalysis.filter((f) => f.type === "text");

  const tabs = (
    [
      { id: "enum"    as FieldTab, label: "Distribuições", count: enums.length },
      { id: "boolean" as FieldTab, label: "Scorecard",     count: booleans.length },
      { id: "number"  as FieldTab, label: "Métricas",      count: numbers.length },
      { id: "text"    as FieldTab, label: "Qualitativo",   count: texts.length },
    ] as { id: FieldTab; label: string; count: number }[]
  ).filter((t) => t.count > 0);

  const [activeTab, setActiveTab] = useState<FieldTab>(tabs[0]?.id ?? "enum");

  if (tabs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Inteligência Estruturada</h2>
        </div>
         <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Auditoria de {structuredCount} chamadas</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-2xl border border-white/5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 text-[10px] font-black uppercase tracking-[1.5px] rounded-xl transition-all ${
              activeTab === tab.id
                ? "bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/10"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {tab.label}
            <span className="ml-2 font-mono opacity-50">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "boolean" && <QualityScorecard fields={booleans} />}

      {activeTab === "enum" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enums.map((f) => <EnumCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "number" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {numbers.map((f) => <NumberCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "text" && (
        <div className="space-y-3">
          {texts.map((f) => <TextAccordion key={f.key} field={f} />)}
        </div>
      )}
    </section>
  );
}

// ─── Card de Oportunidades Não Trabalhadas ────────────────────────────────────

function OpportunitiesSection({
  card,
  tenantId,
  campaignId,
}: {
  card: OpportunitiesCard;
  tenantId: string;
  campaignId: string | undefined;
}) {
  if (card.techIssueCount === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Oportunidades de Recuperação</h2>
      </div>

      <div className="gc p-1 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Main Info */}
          <div className="flex-1 p-6">
            <div className="flex items-center gap-2 mb-4">
               <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center border border-white/5">
                 <Zap className="w-4 h-4 text-amber-500" />
               </div>
               <p className="text-[10px] font-black text-white/40 uppercase tracking-[2px]">Potencial de Rechamada</p>
            </div>
            
            <div className="flex items-baseline gap-2 mb-2">
               <p className="text-5xl font-black text-white font-mono leading-none tracking-tighter">{card.techIssueCount}</p>
               <p className="text-sm font-bold text-amber-500/60 uppercase tracking-widest uppercase">Falhas Técnicas</p>
            </div>
            
            <p className="text-xs text-white/40 font-medium leading-relaxed max-w-xl">
              Identificamos <strong className="text-white">{card.techIssuePct}% das chamadas</strong> com interrupções por transporte (SIP), latência crítica ou erro de pipeline. 
              Estes leads demonstraram interesse mas a conexão foi perdida.
            </p>
          </div>

          {/* Financial Impact */}
          <div className="lg:w-72 shrink-0 bg-white/2 border-l border-white/5 p-6 flex flex-col justify-center relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-0" />
             
            {card.hasConfig && card.potentialValue != null ? (
              <div className="relative z-10 text-center">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[2px] mb-2">Impacto em Vendas</p>
                 <div className="text-3xl font-black text-white font-mono leading-none mb-2 tracking-tight">
                   {fmtBRL(card.potentialValue)}
                 </div>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                  Ticket Médio: {fmtBRL(card.avgDealValue!)}
                </p>
                <div className="mt-6 flex items-center justify-center">
                   <div className="px-3 py-1.5 rounded-lg bg-amber-500 text-[#060608] text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform cursor-default">
                     Recuperar Agora
                   </div>
                </div>
              </div>
            ) : (
              <div className="relative z-10 text-center flex flex-col items-center">
                <Settings2 className="w-6 h-6 text-white/10 mb-3" />
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[1.5px] mb-2 leading-tight">Projeção Financeira Desabilitada</p>
                <p className="text-[10px] text-white/20 font-medium leading-tight mb-4">Configure o ticket médio nas configurações da campanha para ver o impacto.</p>
                {campaignId && (
                  <a
                    href={`/app/tenants/${tenantId}/queues`}
                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 group"
                  >
                    CONFIGURAR <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Correlações: Detector de ICP ─────────────────────────────────────────────

function ICPSection({ correlations }: { correlations: DossieData["correlations"] }) {
  if (Object.keys(correlations).length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-4 bg-cyan-400 rounded-full" />
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Detector de ICP (Persona Ideal)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(correlations).map(([field, groups]) => {
          const sorted = Object.entries(groups).sort((a, b) => b[1].avgDuration - a[1].avgDuration);
          const maxDur = Math.max(...sorted.map((g) => g[1].avgDuration), 1);
          return (
            <div key={field} className="gc p-6 border-white/5">
              <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[2px] mb-5 border-b border-white/5 pb-3">
                {field} <span className="text-cyan-400/40 ml-1">× ENGAGEMENT</span>
              </h4>
              <div className="space-y-4">
                {sorted.map(([label, stats]) => {
                  const pct = Math.round((stats.avgDuration / maxDur) * 100);
                  return (
                    <div key={label} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors truncate max-w-[50%]">{label}</span>
                        <div className="text-right">
                           <span className="text-[11px] font-black text-white font-mono">{fmtDuration(stats.avgDuration)}</span>
                           <span className="text-[10px] text-white/20 font-bold ml-2 uppercase tracking-tighter">{stats.count} CALLS</span>
                        </div>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden bg-white/5">
                        <div
                          className="h-full rounded-full bg-cyan-400/60 group-hover:bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DossiePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [campaigns, setCampaigns]         = useState<Campaign[]>([]);
  const [selectedQueue, setSelectedQueue] = useState("");
  const [days, setDays]                   = useState(90);
  const [loading, setLoading]             = useState(false);
  const [data, setData]                   = useState<DossieData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const supabase = createClient();

  const loadAi = useCallback(async (queueId: string) => {
    if (!queueId) return;
    setAiAnalysis(null);
    const { data } = await supabase
      .from("tenant_analyses")
      .select("content")
      .eq("tenant_id", tenantId)
      .eq("queue_id", queueId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setAiAnalysis(data.content);
  }, [tenantId, supabase]);

  const handleRunAiAnalysis = async () => {
    if (!selectedQueue) return;
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tenant-analysis", {
        body: { tenantId, queueId: selectedQueue }
      });
      if (error) throw error;
      setAiAnalysis(data.content);
    } catch (err: any) {
      alert("Erro ao analisar: " + err.message);
    } finally {
      setLoadingAi(false);
    }
  };

  const load = useCallback(async (queueId: string, d: number) => {
    if (!queueId) return;
    setLoading(true);
    setData(null);
    loadAi(queueId);
    const res  = await fetch(`/api/tenants/${tenantId}/analytics/dossie?queueId=${queueId}&days=${d}`);
    const json = await res.json();
    // Só aceitar se o RPC retornou a estrutura mínima esperada (evita crash com objeto vazio)
    if (json.data && json.data.overview && json.data.period) setData(json.data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/analytics/dossie`)
      .then((r) => r.json())
      .then((j) => {
        const list: Campaign[] = j.campaigns ?? [];
        setCampaigns(list);
        if (list.length > 0) {
          setSelectedQueue(list[0].id);
          load(list[0].id, 90);
        }
      });
  }, [tenantId, load]);

  function handlePrint() { window.print(); }

  return (
    <div>
      <style>{`
        @media print {
          nav, header, aside, .no-print { display: none !important; }
          .print-root { padding: 0 !important; }
          .card { break-inside: avoid; box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-8 no-print">
        <div>
           <div className="flex items-center gap-2 mb-1">
             <div className="w-2 h-2 rounded-full bg-[#00D68F] animate-pulse shadow-[0_0_8px_#00D68F]" />
             <span className="text-[10px] font-black text-white/30 uppercase tracking-[2px]">Advanced Reporting</span>
           </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Dossiê Comercial</h1>
        </div>

        {data && (
          <div className="flex items-center gap-3 no-print">
            <button 
              onClick={handleRunAiAnalysis} 
              disabled={loadingAi}
              className="btn-premium px-5 py-2.5"
            >
              {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="font-bold uppercase tracking-wider text-[11px]">
                {loadingAi ? "Gerando Análise..." : "Analisar Gargalos"}
              </span>
            </button>
            <button onClick={handlePrint} className="btn-glass px-5 py-2.5">
              <Printer className="w-4 h-4" />
              <span className="font-bold uppercase tracking-wider text-[11px]">Exportar</span>
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="gc p-5 mb-8 no-print">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[1.5px]">
            <Settings2 className="w-3.5 h-3.5" />
            Parâmetros de Análise
          </div>

          <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />

          {/* Campaign Select */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-[#E8002D]/10 flex items-center justify-center border border-[#E8002D]/20 group-hover:bg-[#E8002D]/20 transition-all">
                <PhoneCall className="w-3.5 h-3.5 text-[#E8002D] shrink-0" />
              </div>
              <select
                className="bg-transparent text-white/80 text-xs font-bold focus:outline-none cursor-pointer border-none p-0 appearance-none hover:text-white transition-colors w-full"
                value={selectedQueue}
                onChange={(e) => { setSelectedQueue(e.target.value); load(e.target.value, days); }}
              >
                {campaigns.length === 0 && <option value="" className="bg-[#0A0A0E]">Nenhuma campanha</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0A0A0E]">{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />

          {/* Days Select */}
          <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); load(selectedQueue, d); }}
                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider ${
                  days === d
                    ? "bg-[#00D68F] text-[#060608] shadow-[0_0_12px_rgba(0,214,143,0.3)]"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                {d === 365 ? "1 ano" : `${d}D`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 gc">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
            <Loader2 className="w-10 h-10 animate-spin text-white relative z-10" />
          </div>
          <span className="mt-6 text-[10px] font-black text-white/40 uppercase tracking-[3px] animate-pulse">Decodificando Inteligência...</span>
        </div>
      )}

      {/* Sem dados */}
      {!loading && !data && selectedQueue && (
        <div className="gc p-12 text-center border-dashed border-white/5">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[2px] mb-2">Dados Insuficientes</p>
          <p className="text-xs text-white/20 max-w-xs mx-auto font-medium">Nenhuma chamada processada nesta campanha para o período selecionado.</p>
        </div>
      )}

      {/* Conteúdo do dossiê */}
      {data && !loading && (
        <div ref={printRef} className="print-root space-y-6">

          {/* Cabeçalho para impressão */}
          <div className="hidden print:block mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Dossiê Comercial</h1>
            <p className="text-sm text-gray-600">
              Campanha: <strong>{data.campaign?.name}</strong> · Período: últimos {data.period.days} dias
            </p>
          </div>

          {/* 1. Visão Geral — hero metrics */}
          <HeroMetrics overview={data.overview} durationAvg={data.durationAnalysis.avg} />

          {/* AI Analysis Card */}
          {aiAnalysis && (
            <div className="gc p-8 relative overflow-hidden text-white group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-[2s]" />
              <div className="relative z-10 flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[3px] mb-1">Insight Strategy</p>
                   <h3 className="text-xl font-black text-white tracking-tight">Análise de IA: Gargalos de Retenção</h3>
                </div>
              </div>
              <div className="relative z-10 prose prose-invert prose-sm max-w-none 
                prose-headings:text-white prose-headings:font-black prose-h2:text-sm prose-h2:uppercase prose-h2:tracking-widest
                prose-strong:text-indigo-300
                prose-blockquote:border-l-indigo-500 prose-blockquote:bg-white/5 prose-blockquote:px-5 prose-blockquote:py-2 prose-blockquote:rounded-r-xl prose-blockquote:font-bold prose-blockquote:text-indigo-100 prose-blockquote:not-italic
                prose-li:text-white/70
                prose-p:text-white/80 prose-p:leading-loose text-[13px]"
              >
                <Markdown>{aiAnalysis}</Markdown>
              </div>
            </div>
          )}

          {/* 2. Oportunidades Não Trabalhadas */}
          <OpportunitiesSection
            card={data.opportunitiesCard}
            tenantId={tenantId}
            campaignId={data.campaign?.id}
          />

          {/* 3. Mapa de Abandono */}
          <AbandonmentChart durationAnalysis={data.durationAnalysis} />

          {/* 4. Funil de Abandono */}
          <FunnelSection funnel={data.funnelAnalysis} />

          {/* 5. Inteligência dos Dados — tabs + scorecard */}
          {data.fieldAnalysis.length > 0 ? (
            <TabbedFieldAnalysis
              fieldAnalysis={data.fieldAnalysis}
              structuredCount={data.overview.structuredOutputsCount}
            />
          ) : (
            <div className="card p-6 text-center">
              <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 mb-1">Nenhum dado estruturado encontrado</p>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Configure um Structured Output no assistente Vapi desta campanha para visualizar a análise de campos, mapa de objeções e detector de ICP.
              </p>
            </div>
          )}

          {/* 6. Detector de ICP */}
          <ICPSection correlations={data.correlations} />

          {/* Rodapé de impressão */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
            Gerado em {new Date().toLocaleString("pt-BR")} · CallX by MX3
          </div>
        </div>
      )}
    </div>
  );
}
