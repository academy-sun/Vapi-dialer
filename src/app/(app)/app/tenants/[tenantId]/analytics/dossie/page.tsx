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

// ─── 1. Score + KPI Row (dossie-top) ─────────────────────────────────────────

function ScoreKpiRow({ overview, durationAvg }: {
  overview: DossieData["overview"];
  durationAvg: number;
}) {
  const answerPct = overview.answerRate;
  const notAnsweredPct = 100 - answerPct;
  const C = 2 * Math.PI * 46;
  const aDash = (Math.min(answerPct, 93) / 100) * C;

  return (
    <div className="dossie-top">
      {/* Score Card with donut */}
      <div className="dossie-score">
        <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%", filter: "drop-shadow(0 0 6px rgba(0,214,143,0.3))" }}>
            <circle cx="60" cy="60" r="46" fill="none" stroke="var(--glass-border)" strokeWidth="10" />
            <circle cx="60" cy="60" r="46" fill="none" stroke="var(--green)" strokeWidth="10" strokeDasharray={`${aDash.toFixed(1)} ${(C - aDash).toFixed(1)}`} strokeDashoffset={(C * 0.25).toFixed(1)} strokeLinecap="round" transform="rotate(-90 60 60)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 900, color: "var(--green)" }}>{answerPct}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Atendimento</div>
          <div style={{ fontSize: 11, color: "var(--text-2)" }}>{overview.answeredCalls} de {overview.totalCalls}</div>
          <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700, marginTop: 3 }}>{notAnsweredPct}% não atenderam</div>
        </div>
      </div>

      {/* 5 KPI cards */}
      {[
        { label: "Total", value: overview.totalCalls.toLocaleString("pt-BR"), icon: PhoneCall, color: "var(--cyan)", bg: "rgba(0,194,255,0.12)" },
        { label: "Duração média", value: fmtDuration(durationAvg), icon: Clock, color: "var(--yellow)", bg: "rgba(255,184,0,0.12)" },
        { label: "Custo total", value: fmtCurrency(overview.totalCost), icon: DollarSign, color: "var(--green)", bg: "rgba(0,214,143,0.12)" },
        { label: "Custo / call", value: fmtCurrency(overview.avgCostPerCall), icon: DollarSign, color: "var(--purple)", bg: "rgba(168,85,247,0.12)" },
        { label: "Com inteligência", value: `${overview.structuredOutputsRate}%`, icon: BarChart3, color: "var(--red)", bg: "rgba(232,0,45,0.12)" },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="dossie-kpi">
          <div className="dk-icon" style={{ background: bg }}>
            <Icon style={{ width: 13, height: 13, color }} />
          </div>
          <div className="dk-val">{value}</div>
          <div className="dk-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 2. Alert Inline (dossie-alert-inline) ───────────────────────────────────

function AlertInline({
  card,
  tenantId,
}: {
  card: OpportunitiesCard;
  tenantId: string;
}) {
  if (card.techIssueCount === 0) return null;

  return (
    <div className="dossie-alert-inline">
      <Zap style={{ width: 15, height: 15, color: "var(--yellow)", flexShrink: 0 }} />
      <span className="mono" style={{ fontSize: 20, fontWeight: 900, color: "var(--yellow)", flexShrink: 0 }}>{card.techIssueCount}</span>
      <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1 }}>
        falhas técnicas · <strong style={{ color: "var(--yellow)" }}>{card.techIssuePct}%</strong> do total — elegíveis para nova tentativa
      </span>
      {card.hasConfig && card.avgDealValue != null && (
        <span className="cx-filter-btn" style={{ flexShrink: 0, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <Settings2 style={{ width: 10, height: 10 }} /> Ticket médio: {fmtBRL(card.avgDealValue)}
        </span>
      )}
      <a
        href={`/app/tenants/${tenantId}/queues`}
        style={{ fontSize: 10, fontWeight: 600, color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, flexShrink: 0, textDecoration: "none" }}
      >
        Campanhas <ArrowRight style={{ width: 10, height: 10 }} />
      </a>
    </div>
  );
}

// ─── 3. Mapa de Abandono (left card in data grid) ────────────────────────────

function AbandonmentCard({ durationAnalysis }: { durationAnalysis: DossieData["durationAnalysis"] }) {
  const BUCKET_ORDER  = ["0–10s", "10–30s", "30–60s", "1–3min", "3–5min", "5min+"];
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
    <div className="dossie-card">
      <div className="dossie-card-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
        Mapa de Abandono
      </div>
      <div className="dossie-card-sub">Distribuição de {total} chamadas atendidas por duração</div>

      {durationAnalysis.voicemailCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 6, background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.1)", marginBottom: 14, fontSize: 10, color: "var(--text-3)" }}>
          <Info style={{ width: 11, height: 11, color: "var(--yellow)" }} />
          <strong style={{ color: "var(--text-2)" }}>{durationAnalysis.voicemailCount}</strong> chamadas excluídas (caixa postal)
        </div>
      )}

      {total === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "32px 0", fontWeight: 700, fontStyle: "italic" }}>Nenhuma chamada processada</p>
      ) : (
        <>
          <div className="dossie-bars">
            {buckets.map((b, i) => {
              const barH    = maxValue > 0 ? Math.max(Math.round((b.value / maxValue) * 100), b.value > 0 ? 10 : 4) : 4;
              const callPct = total > 0 ? Math.round((b.value / total) * 100) : 0;
              const isPeak  = i === peakIdx && b.value > 0;
              const isHot   = b.value > 0;

              return (
                <div key={b.label} className="dossie-bar-col">
                  <div className="dossie-bar-count">{callPct > 0 ? `${callPct}%` : ""}</div>
                  <div className="dossie-bar-area">
                    <div
                      className="dossie-bar"
                      style={{
                        height: `${barH}px`,
                        background: isHot ? `linear-gradient(180deg, var(--yellow), rgba(255,184,0,0.4))` : "var(--glass-border)",
                        boxShadow: isHot ? "0 0 10px rgba(255,184,0,0.2)" : "none",
                      }}
                    >
                      {isPeak && <div className="dossie-peak">{callPct}% pico</div>}
                    </div>
                  </div>
                  <div className="dossie-bar-label">{b.label}</div>
                  <div className="dossie-bar-count">{b.value}</div>
                </div>
              );
            })}
          </div>

          <div className="dossie-insight">
            <Info style={{ width: 12, height: 12, color: "var(--yellow)" }} />
            <span>
              <strong>{earlyPct}% duram &lt;30s</strong> — {earlyPct > 40
                ? "crítico: a abertura do assistente está gerando bloqueio imediato."
                : earlyPct > 20
                  ? "avalie o script de abertura e gatilho de interesse."
                  : "saudável — baixo índice de abandono inicial."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 4. Inteligência dos Dados (right card in data grid) ─────────────────────

type FieldTab = "enum" | "boolean" | "number" | "text";

function IntelligenceCard({ fieldAnalysis, structuredCount }: {
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
      { id: "number"  as FieldTab, label: "Números",       count: numbers.length },
      { id: "text"    as FieldTab, label: "Análises",      count: texts.length },
    ] as { id: FieldTab; label: string; count: number }[]
  ).filter((t) => t.count > 0);

  const [activeTab, setActiveTab] = useState<FieldTab>(tabs[0]?.id ?? "enum");

  if (tabs.length === 0) {
    return (
      <div className="dossie-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Info style={{ width: 32, height: 32, color: "var(--text-3)", marginBottom: 8 }} />
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>Nenhum dado estruturado</p>
        <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
          Configure um Structured Output no assistente Vapi desta campanha.
        </p>
      </div>
    );
  }

  const COLORS = [
    "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  ];

  return (
    <div className="dossie-card">
      <div className="dossie-card-title">
        <BarChart3 style={{ width: 14, height: 14, color: "var(--cyan)" }} />
        Inteligência dos Dados
      </div>
      <div className="dossie-card-sub">{structuredCount} chamadas com dados estruturados</div>

      {/* Tabs */}
      <div className="dossie-tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`dossie-tab ${activeTab === tab.id ? "active" : ""}`}
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content: Enums (Distribuições) */}
      {activeTab === "enum" && enums.map((field) => {
        if (!field.distribution) return null;
        const total = Object.values(field.distribution).reduce((s, n) => s + n, 0);
        const sorted = Object.entries(field.distribution).sort((a, b) => b[1] - a[1]);
        return (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-2)" }}>{field.key}</span>
              <span style={{ fontSize: 9, color: "var(--text-3)" }}>{total} registros</span>
            </div>
            {sorted.map(([label, count], i) => {
              const pctValue = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={label}>
                  <div className="dossie-dist-row">
                    <span style={{ fontSize: 11, color: "var(--text-2)" }}>{label}</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)" }}>{count} ({pctValue}%)</span>
                  </div>
                  <div className="dossie-dist-bar">
                    <div className="dossie-dist-fill" style={{ width: `${pctValue}%`, background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 1) % COLORS.length]})` }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Tab content: Booleans (Scorecard) */}
      {activeTab === "boolean" && booleans.map((field) => {
        const yes = field.trueCount ?? 0;
        const no  = field.falseCount ?? 0;
        const total = yes + no;
        const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;
        const isGood = yesPct >= 50;
        return (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: isGood ? "var(--green)" : "var(--red)", boxShadow: `0 0 8px ${isGood ? "var(--green)" : "var(--red)"}` }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>{field.key}</span>
              </div>
              <span className="mono" style={{ fontSize: 11, fontWeight: 900, color: isGood ? "var(--green)" : "var(--red)" }}>{yesPct}% SIM</span>
            </div>
            <div className="dossie-dist-bar">
              <div className="dossie-dist-fill" style={{ width: `${yesPct}%`, background: isGood ? "var(--green)" : "var(--red)" }} />
            </div>
          </div>
        );
      })}

      {/* Tab content: Numbers */}
      {activeTab === "number" && numbers.map((field) => (
        <div key={field.key} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 8 }}>{field.key}</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { label: "Média", val: field.avg },
              { label: "Mín", val: field.min },
              { label: "Máx", val: field.max },
            ].map((m) => (
              <div key={m.label} style={{ textAlign: "center", flex: 1, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--glass-border)" }}>
                <p className="mono" style={{ fontSize: 14, fontWeight: 900, color: "var(--text-1)", lineHeight: 1 }}>{m.val}</p>
                <p style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", marginTop: 4 }}>{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Tab content: Text */}
      {activeTab === "text" && texts.map((field) => (
        <TextAccordion key={field.key} field={field} />
      ))}
    </div>
  );
}

function TextAccordion({ field }: { field: FieldAnalysis }) {
  const [open, setOpen] = useState(false);
  const samples = field.samples ?? [];

  return (
    <div style={{ marginBottom: 8, borderRadius: 8, border: "1px solid var(--glass-border)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info style={{ width: 12, height: 12, color: "var(--text-3)" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>{field.key}</span>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{field.count} registros</span>
        </div>
        <ChevronDown style={{ width: 14, height: 14, color: "var(--text-3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {samples.length === 0 ? (
            <p style={{ fontSize: 11, color: "var(--text-3)" }}>Nenhuma amostra disponível.</p>
          ) : (
            samples.map((s, i) => (
              <p key={i} style={{ fontSize: 11, color: "var(--text-2)", background: "var(--glass-bg)", borderRadius: 8, padding: "6px 10px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                &ldquo;{s}&rdquo;
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── 5. ICP Section (dossie-icp-grid) ────────────────────────────────────────

function ICPSection({ correlations }: { correlations: DossieData["correlations"] }) {
  if (Object.keys(correlations).length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Users style={{ width: 14, height: 14, color: "var(--red)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Detector de ICP — Engajamento por Segmento</span>
      </div>
      <div className="dossie-icp-grid">
        {Object.entries(correlations).map(([field, groups]) => {
          const sorted = Object.entries(groups).sort((a, b) => b[1].avgDuration - a[1].avgDuration);
          const maxDur = Math.max(...sorted.map((g) => g[1].avgDuration), 1);
          return (
            <div key={field} className="dossie-icp-card">
              <div className="icp-title">{field} × DURAÇÃO MÉDIA</div>
              {sorted.length === 0 ? (
                <div className="dossie-empty">
                  <AlertCircle style={{ width: 22, height: 22, color: "var(--text-3)", strokeWidth: 1.2 }} />
                  <span style={{ fontSize: 10 }}>Sem dados</span>
                </div>
              ) : (
                sorted.map(([label, stats]) => {
                  const pct = Math.round((stats.avgDuration / maxDur) * 100);
                  const engLabel = getEngagementLabel(stats.avgDuration);
                  return (
                    <div key={label} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: "var(--text-2)" }}>{label}</span>
                        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtDuration(stats.avgDuration)} · {stats.count} calls</span>
                      </div>
                      <div className="dossie-icp-bar">
                        <div className="dossie-icp-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--yellow), rgba(255,184,0,0.4))" }} />
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <span className="dossie-badge" style={{ color: "var(--yellow)", background: "rgba(255,184,0,0.12)", border: "1px solid rgba(255,184,0,0.25)" }}>{engLabel}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 6. Funil (kept as standalone section) ───────────────────────────────────

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
                A etapa <strong style={{ color: "var(--text-1)" }}>&ldquo;{worstDropoff.label}&rdquo;</strong> apresenta a maior taxa de evasão do fluxo, perdendo
                <strong style={{ color: "var(--red)", marginLeft: 4 }}>{worstDropoff.dropoff}%</strong> das oportunidades. Revise a pergunta ou o trigger de resposta de IA nesta fase específica.
              </p>
            </div>
          </div>
        )}
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
          .gc, .dossie-card, .dossie-kpi, .dossie-score { break-inside: avoid; box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* ═══ TOOLBAR ═══ */}
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <span className="admin-badge" style={{ color: "var(--red)", background: "var(--red-lo)", border: "1px solid rgba(232,0,45,0.3)" }}>
          <Zap style={{ width: 10, height: 10 }} /> PAINEL ADMIN
        </span>

        {/* Campaign Select */}
        <div className="cx-select-wrap">
          <select
            className="cx-select"
            value={selectedQueue}
            onChange={(e) => { setSelectedQueue(e.target.value); load(e.target.value, days); }}
          >
            {campaigns.length === 0 && <option value="">Nenhuma campanha</option>}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Period pills */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { d: 7, label: "7d" },
            { d: 30, label: "30d" },
            { d: 90, label: "90d" },
            { d: 365, label: "1 ano" },
          ].map(({ d, label }) => (
            <button
              key={d}
              onClick={() => { setDays(d); load(selectedQueue, d); }}
              className="cx-filter-btn"
              style={days === d ? { background: "var(--red-lo)", borderColor: "rgba(232,0,45,0.35)", color: "var(--red)" } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {data && (
          <>
            <button
              onClick={handleRunAiAnalysis}
              disabled={loadingAi}
              className="cx-filter-btn"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,rgba(168,85,247,0.12),rgba(168,85,247,0.06))", borderColor: "rgba(168,85,247,0.3)", color: "var(--purple)" }}
            >
              {loadingAi ? <Loader2 style={{ width: 13, height: 13, animation: "cx-spin 0.8s linear infinite" }} /> : <Sparkles style={{ width: 13, height: 13 }} />}
              {loadingAi ? "Gerando..." : "Analisar Gargalos"}
            </button>
            <button onClick={handlePrint} className="cx-filter-btn" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Printer style={{ width: 13, height: 13 }} />
              Exportar
            </button>
          </>
        )}
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

      {/* ═══ CONTEÚDO DO DOSSIÊ ═══ */}
      {data && !loading && (
        <div ref={printRef} className="print-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Print header */}
          <div className="hidden print:block" style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>Dossiê Comercial</h1>
            <p style={{ fontSize: 14, color: "#666" }}>
              Campanha: <strong>{data.campaign?.name}</strong> · Período: últimos {data.period.days} dias
            </p>
          </div>

          {/* ── TOP ROW: Score + 5 KPIs ── */}
          <ScoreKpiRow overview={data.overview} durationAvg={data.durationAnalysis.avg} />

          {/* ── ALERT INLINE ── */}
          <AlertInline card={data.opportunitiesCard} tenantId={tenantId} />

          {/* ── AI Analysis Card (shown when analysis is available) ── */}
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

          {/* ── DATA GRID: Mapa de Abandono + Inteligência dos Dados ── */}
          <div className="dossie-data-grid">
            <AbandonmentCard durationAnalysis={data.durationAnalysis} />
            <IntelligenceCard
              fieldAnalysis={data.fieldAnalysis}
              structuredCount={data.overview.structuredOutputsCount}
            />
          </div>

          {/* ── Funil de Gargalos ── */}
          <FunnelSection funnel={data.funnelAnalysis} />

          {/* ── ICP Grid ── */}
          <ICPSection correlations={data.correlations} />

          {/* Print footer */}
          <div className="hidden print:block" style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 12, color: "#999", textAlign: "center" }}>
            Gerado em {new Date().toLocaleString("pt-BR")} · CallX by MX3
          </div>
        </div>
      )}
    </div>
  );
}
