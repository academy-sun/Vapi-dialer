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
      <div className="cx-kpi-head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 16, borderRadius: 999, background: "var(--green)" }} />
          <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Performance de Atendimento</h2>
        </div>
      </div>

      {/* Hero row */}
      <div className="cx-bot-grid" style={{ marginBottom: 16 }}>
        {/* Atenderam */}
        <div className="gc" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 128, height: 128, background: "rgba(0,214,143,0.10)", borderRadius: "0 0 0 100%" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="cx-kpi-label" style={{ color: "var(--green)", marginBottom: 8, letterSpacing: "2px", fontSize: 10 }}>Taxa de Atendimento</p>
            <p className="cx-kpi-value grad-green" style={{ fontSize: 60, letterSpacing: -3 }}>{overview.answerRate}<span style={{ fontSize: 32, opacity: 0.2 }}>%</span></p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>
              <span style={{ color: "var(--text-1)" }}>{overview.answeredCalls.toLocaleString("pt-BR")}</span>
              <span>de</span>
              <span>{overview.totalCalls.toLocaleString("pt-BR")} chamadas</span>
            </div>
          </div>
        </div>

        {/* Nao atenderam */}
        <div className="gc" style={{ padding: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 128, height: 128, background: "var(--red-lo)", borderRadius: "0 0 0 100%" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="cx-kpi-label" style={{ color: "var(--red)", marginBottom: 8, letterSpacing: "2px", fontSize: 10 }}>Taxa de Abandono</p>
            <p className="cx-kpi-value grad-red" style={{ fontSize: 60, letterSpacing: -3 }}>{notAnsweredPct}<span style={{ fontSize: 32, opacity: 0.2 }}>%</span></p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>
              <span style={{ color: "var(--text-1)" }}>{notAnsweredCount.toLocaleString("pt-BR")}</span>
              <span>de</span>
              <span>{overview.totalCalls.toLocaleString("pt-BR")} chamadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        {[
          { label: "Total", value: overview.totalCalls.toLocaleString("pt-BR"), icon: PhoneCall, color: "var(--purple)", bg: "rgba(168,85,247,0.10)" },
          { label: "Duração média", value: fmtDuration(durationAvg), icon: Clock, color: "var(--yellow)", bg: "rgba(255,184,0,0.10)" },
          { label: "Custo total", value: fmtCurrency(overview.totalCost), icon: DollarSign, color: "var(--purple)", bg: "rgba(168,85,247,0.10)" },
          { label: "Custo / call", value: fmtCurrency(overview.avgCostPerCall), icon: DollarSign, color: "var(--cyan)", bg: "rgba(0,194,255,0.10)" },
          { label: "AI Structured", value: `${overview.structuredOutputsRate}%`, icon: Sparkles, color: "var(--green)", bg: "rgba(0,214,143,0.10)" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="gc" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="cx-kpi-icon" style={{ width: 32, height: 32, background: bg, borderRadius: 10 }}>
              <Icon style={{ width: 16, height: 16, color }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="cx-kpi-label" style={{ fontSize: 10, lineHeight: 1.2 }}>{label}</p>
              <p className="mono" style={{ fontSize: 13, fontWeight: 900, color: "var(--text-1)", lineHeight: 1.2 }}>{value}</p>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 6, height: 16, borderRadius: 999, background: "var(--red)" }} />
        <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Mapa de Engajamento Temporário</h2>
      </div>

      <div className="gc" style={{ padding: 24 }}>
        {total === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "32px 0", fontWeight: 700, fontStyle: "italic", textTransform: "uppercase", letterSpacing: "0.1em" }}>Nenhuma chamada processada</p>
        ) : (
          <>
            {durationAnalysis.voicemailCount > 0 && (
              <div className="alert-warning" style={{ marginBottom: 24, borderRadius: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 10, background: "rgba(255,184,0,0.20)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Info style={{ width: 14, height: 14, color: "var(--yellow)" }} />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--yellow)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{durationAnalysis.voicemailCount} chamadas</strong> foram identificadas como caixa postal e removidas desta análise de retenção humana.
                </p>
              </div>
            )}

            {/* Barras verticais */}
            <div className="cx-bar-chart" style={{ height: 200, alignItems: "flex-end", gap: 12 }}>
              {buckets.map((b, i) => {
                const barH    = maxValue > 0 ? Math.max(Math.round((b.value / maxValue) * 160), b.value > 0 ? 4 : 0) : 0;
                const callPct = total > 0 ? Math.round((b.value / total) * 100) : 0;
                const isPeak  = i === peakIdx && b.value > 0;

                return (
                  <div key={b.label} className="cx-bar-col" style={{ flex: 1, height: 200, justifyContent: "flex-end" }}>
                    <div style={{
                      marginBottom: 8,
                      transition: "all 0.3s",
                      opacity: isPeak ? 1 : 0,
                      transform: isPeak ? "scale(1)" : "scale(0.9)",
                    }}>
                       <span className="badge-gray" style={{ fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}>
                         {callPct}% {isPeak ? "▲ PICO" : ""}
                       </span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        borderRadius: "12px 12px 0 0",
                        height: `${barH}px`,
                        background: `linear-gradient(to top, ${b.color}40, ${b.color})`,
                        boxShadow: isPeak ? `0 0 20px -5px ${b.color}` : "none",
                        transition: "all 0.5s",
                      }}
                    />

                    <div style={{ marginTop: 12, textAlign: "center" }}>
                      <p className="cx-bar-lbl" style={{ fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{b.label}</p>
                      <p className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{b.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Diagnóstico automático */}
            <div className="cx-ai-card gc" style={{
              marginTop: 32,
              padding: 16,
              borderColor: earlyPct > 40 ? "rgba(232,0,45,0.20)" : earlyPct > 20 ? "rgba(255,184,0,0.20)" : "rgba(0,214,143,0.20)",
              background: earlyPct > 40 ? "rgba(232,0,45,0.05)" : earlyPct > 20 ? "rgba(255,184,0,0.05)" : "rgba(0,214,143,0.05)",
            }}>
              <div className="cx-ai-icon" style={{
                width: 32,
                height: 32,
                background: earlyPct > 40 ? "rgba(232,0,45,0.20)" : earlyPct > 20 ? "rgba(255,184,0,0.20)" : "rgba(0,214,143,0.20)",
                borderColor: "rgba(255,255,255,0.05)",
                animation: earlyPct > 40 ? "pulse 2s ease-in-out infinite" : undefined,
              }}>
                <AlertCircle style={{
                  width: 16,
                  height: 16,
                  color: earlyPct > 40 ? "var(--red)" : earlyPct > 20 ? "var(--yellow)" : "var(--green)",
                }} />
              </div>
              <div>
                <p className="cx-ai-title" style={{
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  marginBottom: 4,
                  background: "none",
                  WebkitBackgroundClip: "unset",
                  WebkitTextFillColor: earlyPct > 40 ? "var(--red)" : earlyPct > 20 ? "var(--yellow)" : "var(--green)",
                }}>
                  Insight do Especialista AI
                </p>
                <p className="cx-ai-body" style={{ fontSize: 12, lineHeight: 1.6, fontWeight: 500 }}>
                  {earlyPct > 40
                    ? <>Crítico: <strong style={{ color: "var(--text-1)" }}>{earlyPct}% das conversas</strong> morrem em menos de 30s. A abertura do assistente está gerando bloqueio imediato ou falha de identificação.</>
                    : earlyPct > 20
                      ? <>Alerta: <strong style={{ color: "var(--text-1)" }}>{earlyPct}% de abandono precoce</strong>. Melhore o gatilho de interesse nos primeiros 15 segundos da conversa.</>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 6, height: 16, borderRadius: 999, background: "var(--purple)" }} />
        <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Gargalos por Etapas</h2>
      </div>

      <div className="gc" style={{ padding: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, maxWidth: 640, margin: "0 auto" }}>
          {funnel.stages.map((stage, i) => {
            const barWidth = Math.max(stage.pct, 8);
            const isLast   = i === funnel.stages.length - 1;
            const color    = STAGE_COLORS[i] ?? "#6366f1";

            return (
              <div key={stage.label} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Barra do funil */}
                <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div
                    style={{
                      width: `${barWidth}%`,
                      minWidth: 160,
                      height: 52,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `linear-gradient(to right, ${color}CC, ${color})`,
                      boxShadow: `0 8px 16px -8px ${color}66`,
                      border: "1px solid rgba(255,255,255,0.10)",
                      transition: "all 0.5s",
                      cursor: "default",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 24px", width: "100%", justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0 }}>
                         <p style={{ color: "#fff", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage.label}</p>
                         <p style={{ color: "#fff", fontSize: 12, fontWeight: 700, opacity: 0.4 }}>{stage.cumulative.toLocaleString("pt-BR")} leads</p>
                      </div>
                      <span className="mono" style={{ color: "#fff", fontSize: 20, fontWeight: 900 }}>{stage.pct}<span style={{ opacity: 0.2, fontSize: 14 }}>%</span></span>
                    </div>
                  </div>
                </div>

                {/* Seta de perda */}
                {!isLast && stage.dropoff !== null && stage.dropoff > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
                    <div style={{ height: 1, width: 48, background: "var(--glass-border)" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: "var(--red-lo)", border: "1px solid rgba(232,0,45,0.20)" }}>
                       <TrendingDown style={{ width: 12, height: 12, color: "var(--red)" }} />
                       <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>−{stage.dropoff}% de retenção</span>
                    </div>
                    <div style={{ height: 1, width: 48, background: "var(--glass-border)" }} />
                  </div>
                )}
                {!isLast && (stage.dropoff === null || stage.dropoff === 0) && (
                  <div style={{ height: 16 }} />
                )}
              </div>
            );
          })}
        </div>

        {worstDropoff && worstDropoff.dropoff !== null && worstDropoff.dropoff > 0 && (
          <div className="cx-ai-card gc" style={{
            marginTop: 40,
            padding: 20,
            maxWidth: 640,
            margin: "40px auto 0",
            background: "rgba(168,85,247,0.05)",
            borderColor: "rgba(168,85,247,0.20)",
          }}>
            <div className="cx-ai-icon" style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(168,85,247,0.20)",
              borderColor: "rgba(255,255,255,0.05)",
            }}>
              <Zap style={{ width: 20, height: 20, color: "var(--purple)" }} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 900, color: "var(--purple)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Gargalo Estrutural Detectado</p>
              <p className="cx-ai-body" style={{ fontSize: 12, lineHeight: 1.6, fontWeight: 500 }}>
                A etapa <strong style={{ color: "var(--text-1)" }}>"{worstDropoff.label}"</strong> apresenta a maior taxa de evasão do fluxo, perdendo
                <strong style={{ color: "var(--red)", marginLeft: 4 }}>{worstDropoff.dropoff}%</strong> das oportunidades. Revise a pergunta ou o trigger de resposta de IA nesta fase específica.
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
    <div className="gc" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--glass-border)", paddingBottom: 16 }}>
        <div className="cx-kpi-icon" style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(0,214,143,0.20)" }}>
          <ShieldCheck style={{ width: 16, height: 16, color: "var(--green)" }} />
        </div>
        <div>
          <h4 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "1.5px" }}>Checklist de Qualidade</h4>
          <p className="cx-card-sub" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{fields[0]?.count ?? 0} chamadas auditadas</p>
        </div>
      </div>

      <div className="cx-mot-rows" style={{ gap: 20 }}>
        {fields.map((field) => {
          const yes  = field.trueCount  ?? 0;
          const no   = field.falseCount ?? 0;
          const total = yes + no;
          const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
          const isGood = yesPct >= 50;

          return (
            <div key={field.key}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: isGood ? "var(--green)" : "var(--red)", boxShadow: `0 0 8px ${isGood ? "var(--green)" : "var(--red)"}` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.key}</span>
                </div>
                <div style={{ textAlign: "right" }}>
                   <span className="mono" style={{ fontSize: 11, fontWeight: 900, color: isGood ? "var(--green)" : "var(--red)" }}>{yesPct}%</span>
                   <span className="cx-kpi-label" style={{ marginLeft: 4, fontSize: 10 }}>SIM</span>
                </div>
              </div>
              <div className="cx-mot-bar" style={{ height: 6, borderRadius: 999, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div
                  className="cx-mot-fill"
                  style={{ width: `${yesPct}%`, background: isGood ? "var(--green)" : "var(--red)", borderRadius: 999, height: "100%" }}
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
    <div className="gc cx-mot-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h4 className="cx-kpi-label" style={{ maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {field.key}
        </h4>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{field.count} DATA</span>
      </div>
      <div className="cx-mot-rows">
        {sorted.map(([label, count], i) => {
          const pctValue = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="cx-mot-row" style={{ marginBottom: 6 }}>
                <span className="cx-mot-name" style={{ width: "auto", flex: 1, fontSize: 11, fontWeight: 700, maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span className="cx-mot-val" style={{ fontSize: 11, minWidth: "auto", color: "var(--text-3)" }}>{count} <span style={{ opacity: 0.4 }}>({pctValue}%)</span></span>
              </div>
              <div className="cx-mot-bar" style={{ height: 4 }}>
                <div
                  className="cx-mot-fill"
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
    <div className="gc" style={{ padding: 20 }}>
       <h4 className="cx-kpi-label" style={{ marginBottom: 16 }}>
          {field.key}
        </h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <div style={{ textAlign: "center", padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="mono" style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{field.avg}</p>
          <p className="cx-kpi-label" style={{ marginTop: 6, fontSize: 9 }}>Média</p>
        </div>
        <div style={{ textAlign: "center", padding: 12 }}>
          <p className="mono" style={{ fontSize: 14, fontWeight: 900, color: "var(--text-2)", lineHeight: 1 }}>{field.min}</p>
          <p className="cx-kpi-label" style={{ marginTop: 6, fontSize: 9 }}>Mín</p>
        </div>
        <div style={{ textAlign: "center", padding: 12 }}>
          <p className="mono" style={{ fontSize: 14, fontWeight: 900, color: "var(--text-2)", lineHeight: 1 }}>{field.max}</p>
          <p className="cx-kpi-label" style={{ marginTop: 6, fontSize: 9 }}>Máx</p>
        </div>
      </div>
    </div>
  );
}

function TextAccordion({ field }: { field: FieldAnalysis }) {
  const [open, setOpen] = useState(false);
  const samples = field.samples ?? [];

  return (
    <div className="gc" style={{ overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--glass-bg-2)", textAlign: "left", cursor: "pointer", transition: "background 0.15s" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info style={{ width: 14, height: 14, color: "var(--text-3)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{field.key}</span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{field.count} registros</span>
        </div>
        <ChevronDown style={{ width: 16, height: 16, color: "var(--text-3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {samples.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhuma amostra disponível.</p>
          ) : (
            samples.map((s, i) => (
              <p key={i} style={{ fontSize: 12, color: "var(--text-2)", background: "var(--glass-bg)", borderRadius: 10, padding: "8px 12px", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 16, borderRadius: 999, background: "#6366f1" }} />
          <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Inteligência Estruturada</h2>
        </div>
         <span className="cx-kpi-label">Auditoria de {structuredCount} chamadas</span>
      </div>

      {/* Tabs */}
      <div className="cx-period-tabs" style={{ marginBottom: 24, padding: 4, background: "rgba(255,255,255,0.05)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", width: "fit-content" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`cx-period-tab ${activeTab === tab.id ? "active" : ""}`}
            style={{
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              borderRadius: 12,
              padding: "8px 20px",
              ...(activeTab === tab.id
                ? { background: "rgba(255,255,255,0.10)", color: "var(--text-1)", boxShadow: "0 0 15px rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }
                : {}),
            }}
          >
            {tab.label}
            <span className="mono" style={{ marginLeft: 8, opacity: 0.5 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "boolean" && <QualityScorecard fields={booleans} />}

      {activeTab === "enum" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {enums.map((f) => <EnumCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "number" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {numbers.map((f) => <NumberCard key={f.key} field={f} />)}
        </div>
      )}

      {activeTab === "text" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 6, height: 16, borderRadius: 999, background: "var(--yellow)" }} />
        <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Oportunidades de Recuperação</h2>
      </div>

      <div className="gc" style={{ padding: 4, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "row" }}>
          {/* Main Info */}
          <div style={{ flex: 1, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
               <div className="cx-kpi-icon" style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,184,0,0.20)" }}>
                 <Zap style={{ width: 16, height: 16, color: "var(--yellow)" }} />
               </div>
               <p className="cx-kpi-label" style={{ letterSpacing: "2px" }}>Potencial de Rechamada</p>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
               <p className="cx-kpi-value grad-white" style={{ fontSize: 48 }}>{card.techIssueCount}</p>
               <p style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,184,0,0.60)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Falhas Técnicas</p>
            </div>

            <p style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, lineHeight: 1.6, maxWidth: 560 }}>
              Identificamos <strong style={{ color: "var(--text-1)" }}>{card.techIssuePct}% das chamadas</strong> com interrupções por transporte (SIP), latência crítica ou erro de pipeline.
              Estes leads demonstraram interesse mas a conexão foi perdida.
            </p>
          </div>

          {/* Financial Impact */}
          <div style={{ width: 288, flexShrink: 0, background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.05)", padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}>
             <div style={{ position: "absolute", top: 0, right: 0, width: 128, height: 128, background: "rgba(255,184,0,0.05)", borderRadius: "0 0 0 100%" }} />

            {card.hasConfig && card.potentialValue != null ? (
              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                <p style={{ fontSize: 10, fontWeight: 900, color: "var(--yellow)", textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8 }}>Impacto em Vendas</p>
                 <div className="mono" style={{ fontSize: 30, fontWeight: 900, color: "var(--text-1)", lineHeight: 1, marginBottom: 8, letterSpacing: "-0.02em" }}>
                   {fmtBRL(card.potentialValue)}
                 </div>
                <p className="cx-kpi-label" style={{ fontSize: 10 }}>
                  Ticket Médio: {fmtBRL(card.avgDealValue!)}
                </p>
                <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                   <div style={{ padding: "6px 12px", borderRadius: 10, background: "var(--yellow)", color: "var(--bg)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "default" }}>
                     Recuperar Agora
                   </div>
                </div>
              </div>
            ) : (
              <div style={{ position: "relative", zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Settings2 style={{ width: 24, height: 24, color: "var(--text-3)", marginBottom: 12, opacity: 0.4 }} />
                <p style={{ fontSize: 10, fontWeight: 900, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 8, lineHeight: 1.4 }}>Projeção Financeira Desabilitada</p>
                <p style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, lineHeight: 1.4, marginBottom: 16 }}>Configure o ticket médio nas configurações da campanha para ver o impacto.</p>
                {campaignId && (
                  <a
                    href={`/app/tenants/${tenantId}/queues`}
                    style={{ fontSize: 10, fontWeight: 900, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                  >
                    CONFIGURAR <ArrowRight style={{ width: 12, height: 12 }} />
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 6, height: 16, borderRadius: 999, background: "var(--cyan)" }} />
        <h2 className="cx-card-title" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>Detector de ICP (Persona Ideal)</h2>
      </div>

      <div className="cx-bot-grid">
        {Object.entries(correlations).map(([field, groups]) => {
          const sorted = Object.entries(groups).sort((a, b) => b[1].avgDuration - a[1].avgDuration);
          const maxDur = Math.max(...sorted.map((g) => g[1].avgDuration), 1);
          return (
            <div key={field} className="gc" style={{ padding: 24 }}>
              <h4 className="cx-kpi-label" style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--glass-border)", letterSpacing: "2px" }}>
                {field} <span style={{ color: "rgba(0,194,255,0.40)", marginLeft: 4 }}>× ENGAGEMENT</span>
              </h4>
              <div className="cx-mot-rows" style={{ gap: 16 }}>
                {sorted.map(([label, stats]) => {
                  const pct = Math.round((stats.avgDuration / maxDur) * 100);
                  return (
                    <div key={label}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                        <div style={{ textAlign: "right" }}>
                           <span className="mono" style={{ fontSize: 11, fontWeight: 900, color: "var(--text-1)" }}>{fmtDuration(stats.avgDuration)}</span>
                           <span className="cx-kpi-label" style={{ marginLeft: 8, fontSize: 10, letterSpacing: "-0.02em" }}>{stats.count} CALLS</span>
                        </div>
                      </div>
                      <div className="cx-mot-bar" style={{ height: 4 }}>
                        <div
                          className="cx-mot-fill"
                          style={{ width: `${pct}%`, background: "rgba(0,194,255,0.60)", boxShadow: "0 0 8px rgba(34,211,238,0.2)" }}
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
          .gc { break-inside: avoid; box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
           <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--green)", boxShadow: "0 0 8px var(--green)", animation: "pulse 2s ease-in-out infinite" }} />
             <span className="cx-kpi-label" style={{ letterSpacing: "2px" }}>Advanced Reporting</span>
           </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Dossiê Comercial</h1>
        </div>

        {data && (
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleRunAiAnalysis}
              disabled={loadingAi}
              className="cx-refresh-btn"
              style={{ padding: "10px 20px" }}
            >
              {loadingAi ? <Loader2 style={{ width: 16, height: 16, animation: "cx-spin 0.8s linear infinite" }} /> : <Sparkles style={{ width: 16, height: 16 }} />}
              <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>
                {loadingAi ? "Gerando Análise..." : "Analisar Gargalos"}
              </span>
            </button>
            <button onClick={handlePrint} className="cx-filter-btn" style={{ padding: "10px 20px" }}>
              <Printer style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>Exportar</span>
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="gc no-print" style={{ padding: 20, marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings2 style={{ width: 14, height: 14, color: "var(--text-3)" }} />
            <span className="cx-kpi-label" style={{ letterSpacing: "1.5px" }}>Parâmetros de Análise</span>
          </div>

          <div style={{ height: 16, width: 1, background: "var(--glass-border)", margin: "0 8px" }} />

          {/* Campaign Select */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="cx-kpi-icon" style={{ width: 28, height: 28, borderRadius: 10, background: "var(--red-lo)", borderColor: "rgba(232,0,45,0.20)" }}>
                <PhoneCall style={{ width: 14, height: 14, color: "var(--red)" }} />
              </div>
              <select
                className="cx-select"
                style={{ background: "transparent", border: "none", flex: 1, fontWeight: 700, fontSize: 12 }}
                value={selectedQueue}
                onChange={(e) => { setSelectedQueue(e.target.value); load(e.target.value, days); }}
              >
                {campaigns.length === 0 && <option value="">Nenhuma campanha</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ height: 16, width: 1, background: "var(--glass-border)", margin: "0 8px" }} />

          {/* Days Select */}
          <div className="cx-period-tabs" style={{ padding: 4, background: "rgba(255,255,255,0.05)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); load(selectedQueue, d); }}
                className={`cx-period-tab ${days === d ? "active" : ""}`}
                style={{
                  padding: "6px 16px",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  ...(days === d
                    ? { background: "var(--green)", color: "var(--bg)", border: "none", boxShadow: "0 0 12px rgba(0,214,143,0.3)" }
                    : {}),
                }}
              >
                {d === 365 ? "1 ano" : `${d}D`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="gc cx-loading" style={{ flexDirection: "column", padding: "128px 0" }}>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(99,102,241,0.20)", filter: "blur(24px)", borderRadius: "50%", animation: "pulse 2s ease-in-out infinite" }} />
            <Loader2 style={{ width: 40, height: 40, animation: "cx-spin 0.8s linear infinite", color: "var(--text-1)", position: "relative", zIndex: 1 }} />
          </div>
          <span className="cx-kpi-label" style={{ marginTop: 24, letterSpacing: "3px", animation: "pulse 2s ease-in-out infinite" }}>Decodificando Inteligência...</span>
        </div>
      )}

      {/* Sem dados */}
      {!loading && !data && selectedQueue && (
        <div className="gc" style={{ padding: 48, textAlign: "center", borderStyle: "dashed" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <AlertCircle style={{ width: 32, height: 32, color: "var(--text-3)" }} />
          </div>
          <p className="cx-kpi-label" style={{ letterSpacing: "2px", marginBottom: 8 }}>Dados Insuficientes</p>
          <p style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 320, margin: "0 auto", fontWeight: 500 }}>Nenhuma chamada processada nesta campanha para o período selecionado.</p>
        </div>
      )}

      {/* Conteúdo do dossiê */}
      {data && !loading && (
        <div ref={printRef} className="print-root" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Cabeçalho para impressão */}
          <div className="hidden print:block" style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>Dossiê Comercial</h1>
            <p style={{ fontSize: 14, color: "#666" }}>
              Campanha: <strong>{data.campaign?.name}</strong> · Período: últimos {data.period.days} dias
            </p>
          </div>

          {/* 1. Visão Geral */}
          <HeroMetrics overview={data.overview} durationAvg={data.durationAnalysis.avg} />

          {/* AI Analysis Card */}
          {aiAnalysis && (
            <div className="gc" style={{ padding: 32, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 256, height: 256, background: "rgba(99,102,241,0.05)", borderRadius: "0 0 0 100%", transition: "transform 2s" }} />
              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 16, marginBottom: 32, borderBottom: "1px solid var(--glass-border)", paddingBottom: 24 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
                  <Bot style={{ width: 24, height: 24, color: "#fff" }} />
                </div>
                <div>
                   <p style={{ fontSize: 10, fontWeight: 900, color: "#6366f1", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 4 }}>Insight Strategy</p>
                   <h3 style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>Análise de IA: Gargalos de Retenção</h3>
                </div>
              </div>
              <div className="cx-prose" style={{ position: "relative", zIndex: 1 }}>
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

          {/* 5. Inteligência dos Dados */}
          {data.fieldAnalysis.length > 0 ? (
            <TabbedFieldAnalysis
              fieldAnalysis={data.fieldAnalysis}
              structuredCount={data.overview.structuredOutputsCount}
            />
          ) : (
            <div className="gc" style={{ padding: 24, textAlign: "center" }}>
              <Info style={{ width: 32, height: 32, color: "var(--text-3)", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>Nenhum dado estruturado encontrado</p>
              <p style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 448, margin: "0 auto" }}>
                Configure um Structured Output no assistente Vapi desta campanha para visualizar a análise de campos, mapa de objeções e detector de ICP.
              </p>
            </div>
          )}

          {/* 6. Detector de ICP */}
          <ICPSection correlations={data.correlations} />

          {/* Rodapé de impressão */}
          <div className="hidden print:block" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#999", textAlign: "center" }}>
            Gerado em {new Date().toLocaleString("pt-BR")} · CallX by MX3
          </div>
        </div>
      )}
    </div>
  );
}
