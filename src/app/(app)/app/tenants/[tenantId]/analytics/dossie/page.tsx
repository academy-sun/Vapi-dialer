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
      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <PhoneCall className="w-4 h-4 text-indigo-500" />
        Visão Geral
      </h2>

      {/* Hero row — métricas críticas em destaque */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Atenderam */}
        <div className="rounded-2xl p-5 flex flex-col justify-between" style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", border: "1px solid #6ee7b7" }}>
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Atenderam</p>
          <p className="text-5xl font-black text-emerald-700 leading-none">{overview.answerRate}%</p>
          <p className="text-sm text-emerald-600 mt-2 font-medium">
            {overview.answeredCalls.toLocaleString("pt-BR")} de {overview.totalCalls.toLocaleString("pt-BR")} chamadas
          </p>
        </div>

        {/* Não atenderam */}
        <div className="rounded-2xl p-5 flex flex-col justify-between" style={{ background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)", border: "1px solid #fca5a5" }}>
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Não atenderam</p>
          <p className="text-5xl font-black text-red-600 leading-none">{notAnsweredPct}%</p>
          <p className="text-sm text-red-500 mt-2 font-medium">
            {notAnsweredCount.toLocaleString("pt-BR")} de {overview.totalCalls.toLocaleString("pt-BR")} chamadas
          </p>
        </div>
      </div>

      {/* Supporting metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Total", value: overview.totalCalls.toLocaleString("pt-BR"), icon: PhoneCall, color: "#6366f1" },
          { label: "Duração média", value: fmtDuration(durationAvg), icon: Clock, color: "#f59e0b" },
          { label: "Custo total", value: fmtCurrency(overview.totalCost), icon: DollarSign, color: "#8b5cf6" },
          { label: "Custo / call", value: fmtCurrency(overview.avgCostPerCall), icon: DollarSign, color: "#8b5cf6" },
          { label: "Com inteligência", value: `${overview.structuredOutputsRate}%`, icon: BarChart3, color: "#14b8a6" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "18" }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 leading-tight">{label}</p>
              <p className="text-sm font-bold text-gray-900 leading-tight">{value}</p>
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
  const BUCKET_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#6366f1"];

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
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-red-500" />
        Mapa de Abandono — quando os leads desligam
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Distribuição de {total.toLocaleString("pt-BR")} chamadas atendidas por duração.
      </p>
      <div className="card p-5">
        {total === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma chamada atendida no período.</p>
        ) : (
          <>
            {durationAnalysis.voicemailCount > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  <strong>{durationAnalysis.voicemailCount} chamadas</strong> foram para caixa postal e estão excluídas deste gráfico.
                </p>
              </div>
            )}

            {/* Barras verticais com pico anotado */}
            <div className="flex items-end gap-2" style={{ height: "180px" }}>
              {buckets.map((b, i) => {
                const barH   = maxValue > 0 ? Math.max(Math.round((b.value / maxValue) * 150), b.value > 0 ? 6 : 0) : 0;
                const callPct = total > 0 ? Math.round((b.value / total) * 100) : 0;
                const isPeak  = i === peakIdx && b.value > 0;

                return (
                  <div key={b.label} className="flex-1 flex flex-col items-center justify-end" style={{ height: "180px" }}>
                    {/* Anotação do pico */}
                    {isPeak ? (
                      <div className="mb-1 flex flex-col items-center">
                        <span
                          className="text-xs font-bold text-white px-2 py-0.5 rounded-full"
                          style={{ background: b.color }}
                        >
                          {callPct}% ▲ pico
                        </span>
                      </div>
                    ) : (
                      b.value > 0 && (
                        <span className="text-xs font-semibold text-gray-600 mb-1">{callPct}%</span>
                      )
                    )}

                    {/* Barra */}
                    <div
                      className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${barH}px`,
                        background: isPeak ? b.color : b.color + "99",
                        minHeight: b.value > 0 ? "6px" : "0",
                        boxShadow: isPeak ? `0 0 0 2px ${b.color}40` : "none",
                      }}
                    />

                    {/* Label + count */}
                    <div className="mt-1.5 text-center">
                      <p className="text-xs text-gray-600 font-medium leading-tight">{b.label}</p>
                      <p className="text-xs text-gray-400">{b.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Diagnóstico automático */}
            <div className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 ${
              earlyPct > 40
                ? "bg-red-50 border border-red-100"
                : earlyPct > 20
                  ? "bg-amber-50 border border-amber-100"
                  : "bg-emerald-50 border border-emerald-100"
            }`}>
              <AlertCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                earlyPct > 40 ? "text-red-500" : earlyPct > 20 ? "text-amber-500" : "text-emerald-500"
              }`} />
              <p className={`text-xs ${
                earlyPct > 40 ? "text-red-700" : earlyPct > 20 ? "text-amber-700" : "text-emerald-700"
              }`}>
                {earlyPct > 40
                  ? <><strong>{earlyPct}% das conversas duram menos de 30s</strong> — avalie o script de abertura e a primeira mensagem do assistente.</>
                  : earlyPct > 20
                    ? <><strong>{earlyPct}% das conversas encerram antes de 30s</strong> — considere revisar a abordagem inicial.</>
                    : <>Perfil de engajamento saudável — maioria das conversas passa de 30s.</>
                }
              </p>
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
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-violet-500" />
        Funil de Abandono — onde a conversa para
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Baseado em {funnel.totalWithData.toLocaleString("pt-BR")} chamadas com dados de etapa.
      </p>
      <div className="card p-5">
        <div className="flex flex-col items-center gap-0">
          {funnel.stages.map((stage, i) => {
            const barWidth = Math.max(stage.pct, 4);
            const isLast   = i === funnel.stages.length - 1;
            const color    = STAGE_COLORS[i] ?? "#6366f1";

            return (
              <div key={stage.label} className="w-full flex flex-col items-center">
                {/* Barra do funil — largura proporcional ao pct */}
                <div className="w-full flex items-center justify-center">
                  <div
                    className="relative flex items-center justify-center rounded-lg transition-all"
                    style={{
                      width: `${barWidth}%`,
                      minWidth: "120px",
                      height: "44px",
                      background: color,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white font-black text-lg leading-none">{stage.pct}%</span>
                      <div className="hidden md:block">
                        <p className="text-white text-xs font-semibold leading-tight opacity-90">{stage.label}</p>
                        <p className="text-white text-xs opacity-70">{stage.cumulative.toLocaleString("pt-BR")} calls</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Label em mobile */}
                <div className="md:hidden mt-1 text-center">
                  <p className="text-xs font-medium text-gray-700">{stage.label}</p>
                  <p className="text-xs text-gray-400">{stage.cumulative.toLocaleString("pt-BR")} calls</p>
                </div>

                {/* Seta de perda entre etapas */}
                {!isLast && stage.dropoff !== null && stage.dropoff > 0 && (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="h-px w-8 bg-red-200" />
                    <span className="text-xs text-red-500 font-semibold">−{stage.dropoff}% perdidos aqui</span>
                    <div className="h-px w-8 bg-red-200" />
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
          <div className="mt-5 flex items-start gap-2 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700">
              <strong>Maior gargalo:</strong> a etapa "{worstDropoff.label}" perde{" "}
              <strong>{worstDropoff.dropoff}%</strong> das conversas que chegaram até ela. Revise o script neste ponto.
            </p>
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
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
        Painel de Saúde da Ligação
        <span className="ml-auto text-gray-300 font-normal normal-case">{fields[0]?.count ?? 0} registros</span>
      </h4>

      <div className="space-y-3">
        {fields.map((field) => {
          const yes  = field.trueCount  ?? 0;
          const no   = field.falseCount ?? 0;
          const total = yes + no;
          const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
          const isGood = yesPct >= 50;

          return (
            <div key={field.key}>
              <div className="flex items-center gap-2 mb-1">
                {isGood
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                }
                <span className="text-xs font-medium text-gray-700 flex-1 truncate">{field.key}</span>
                <span className={`text-xs font-bold ${isGood ? "text-emerald-600" : "text-red-500"}`}>
                  {yesPct}% sim
                </span>
                <span className="text-xs text-gray-400">{100 - yesPct}% não</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${yesPct}%`, background: isGood ? "#10b981" : "#ef4444" }}
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
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        {field.key}
        <span className="ml-auto text-gray-300 font-normal normal-case">{field.count} registros</span>
      </h4>
      <div className="space-y-2">
        {sorted.map(([label, count], i) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-700 font-medium truncate max-w-[60%]">{label}</span>
                <span className="text-xs text-gray-500 shrink-0">{count} ({pct}%)</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
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
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        {field.key}
        <span className="ml-auto text-gray-300 font-normal normal-case">{field.count} registros</span>
      </h4>
      <div className="flex gap-3">
        <div className="flex-1 text-center">
          <p className="text-2xl font-bold text-indigo-600">{field.avg}</p>
          <p className="text-xs text-gray-500">Média</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xl font-semibold text-gray-700">{field.min}</p>
          <p className="text-xs text-gray-500">Mínimo</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xl font-semibold text-gray-700">{field.max}</p>
          <p className="text-xs text-gray-500">Máximo</p>
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
      { id: "boolean" as FieldTab, label: "Saúde",         count: booleans.length },
      { id: "number"  as FieldTab, label: "Números",       count: numbers.length },
      { id: "text"    as FieldTab, label: "Análises",      count: texts.length },
    ] as { id: FieldTab; label: string; count: number }[]
  ).filter((t) => t.count > 0);

  const [activeTab, setActiveTab] = useState<FieldTab>(tabs[0]?.id ?? "enum");

  if (tabs.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        Inteligência dos Dados — Structured Outputs
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Baseado em {structuredCount.toLocaleString("pt-BR")} chamadas com dados estruturados.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-gray-100 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "boolean" && <QualityScorecard fields={booleans} />}

      {activeTab === "enum" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {enums.map((f) => <EnumCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "number" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {numbers.map((f) => <NumberCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "text" && (
        <div className="space-y-2">
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
      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500" />
        Oportunidades Não Trabalhadas
      </h2>
      <div className="card p-4 border-l-4 border-amber-400">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">Chamadas com falha técnica</p>
            <p className="text-3xl font-bold text-amber-600">{card.techIssueCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {card.techIssuePct}% do total · erro de infraestrutura, não rejeição de conteúdo
            </p>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              Estas ligações falharam por problemas técnicos (pipeline, transporte ou latência),
              não por falta de interesse do lead. São elegíveis para nova tentativa.
            </p>
          </div>

          <div className="md:w-56 shrink-0">
            {card.hasConfig && card.potentialValue != null ? (
              <div className="rounded-xl p-4 text-center h-full flex flex-col items-center justify-center" style={{ background: "#f59e0b18" }}>
                <TrendingUp className="w-5 h-5 text-amber-600 mb-1.5" />
                <p className="text-xs text-amber-700 font-medium mb-1">Oportunidade estimada</p>
                <p className="text-2xl font-bold text-amber-700">{fmtBRL(card.potentialValue)}</p>
                <p className="text-xs text-amber-600 mt-1">
                  {card.techIssueCount} × {fmtBRL(card.avgDealValue!)} ticket médio
                </p>
                <p className="text-xs text-amber-500 mt-2 leading-tight">
                  Não são vendas perdidas — são leads que merecem nova tentativa
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center h-full flex flex-col items-center justify-center border border-dashed border-gray-200 bg-gray-50">
                <Settings2 className="w-5 h-5 text-gray-400 mb-1.5" />
                <p className="text-xs text-gray-500 font-medium mb-1">Configure o ticket médio</p>
                <p className="text-xs text-gray-400 leading-tight mb-3">
                  Defina o valor de conversão da campanha para calcular o impacto financeiro
                </p>
                {campaignId && (
                  <a
                    href={`/app/tenants/${tenantId}/queues`}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    Ir para Campanhas <ArrowRight className="w-3 h-3" />
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
      <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-amber-500" />
        Detector de ICP — Engajamento por Segmento
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(correlations).map(([field, groups]) => {
          const sorted = Object.entries(groups).sort((a, b) => b[1].avgDuration - a[1].avgDuration);
          const maxDur = Math.max(...sorted.map((g) => g[1].avgDuration), 1);
          return (
            <div key={field} className="card p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {field} × Duração Média
              </h4>
              <div className="space-y-2.5">
                {sorted.map(([label, stats]) => {
                  const pct = Math.round((stats.avgDuration / maxDur) * 100);
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[55%]">{label}</span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {fmtDuration(stats.avgDuration)} · {stats.count} calls
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: "#f59e0b" }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{getEngagementLabel(stats.avgDuration)}</p>
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
      <div className="flex items-center justify-between mb-6 no-print">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#6366f118" }}>
            <FileBarChart2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Dossiê Comercial</h1>
            <p className="text-xs text-gray-500">Raio-X da operação de vendas por campanha</p>
          </div>
        </div>

        {data && (
          <div className="flex items-center gap-3 no-print">
            <button 
              onClick={handleRunAiAnalysis} 
              disabled={loadingAi}
              className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 border border-indigo-200"
            >
              {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loadingAi ? "Gerando Análise..." : "Analisar Gargalos (10-40s)"}
            </button>
            <button onClick={handlePrint} className="btn-secondary gap-2">
              <Printer className="w-4 h-4" />
              Exportar / Imprimir
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-6 no-print">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="form-label">Campanha</label>
            <div className="relative">
              <select
                className="form-input pr-8 appearance-none"
                value={selectedQueue}
                onChange={(e) => { setSelectedQueue(e.target.value); load(e.target.value, days); }}
              >
                {campaigns.length === 0 && <option value="">Nenhuma campanha</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="form-label">Período</label>
            <div className="flex gap-1.5">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); load(selectedQueue, d); }}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    days === d
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {d === 365 ? "1 ano" : `${d}d`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-3 text-sm text-gray-500">Analisando dados da campanha...</span>
        </div>
      )}

      {/* Sem dados */}
      {!loading && !data && selectedQueue && (
        <div className="card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhuma chamada encontrada para o período selecionado.</p>
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
            <div className="card p-6 bg-gradient-to-br from-indigo-50 to-white border-indigo-100 shadow-sm relative overflow-hidden text-gray-800">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -z-0" />
              <div className="relative z-10 flex items-center gap-2.5 mb-5 border-b border-indigo-100/50 pb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-inner">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-gray-900 tracking-tight">Análise de IA: Gargalos de Retenção</h3>
              </div>
              <div className="relative z-10 prose prose-sm prose-indigo max-w-none 
                prose-headings:text-gray-900 prose-headings:font-bold prose-h2:text-sm prose-h3:text-sm
                prose-a:text-indigo-600 hover:prose-a:text-indigo-500
                prose-strong:text-gray-900
                prose-blockquote:border-l-indigo-300 prose-blockquote:bg-indigo-50/50 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-blockquote:font-medium prose-blockquote:text-indigo-900 prose-blockquote:not-italic
                prose-ul:marker:text-indigo-400
                prose-li:text-gray-700
                prose-p:text-gray-700 prose-p:leading-relaxed"
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
