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

// ── Card de métrica ────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon: Icon, gradClass = "grad-white", iconBg,
}: { label: string; value: string | number; sub?: string; icon: React.ElementType; gradClass?: string; iconBg?: string }) {
  return (
    <div className="gc cx-kpi-card">
      <div className="cx-kpi-head">
        <span className="cx-kpi-label">{label}</span>
        <div className="cx-kpi-icon" style={iconBg ? { background: iconBg } : undefined}>
          <Icon style={{ width: 16, height: 16 }} />
        </div>
      </div>
      <div className={`cx-kpi-value ${gradClass}`}>{value}</div>
      {sub && <div className="cx-kpi-badge">{sub}</div>}
    </div>
  );
}

// ── Gráfico de barras manual ───────────────────────────────────────────────────
function CallsChart({ data, days }: { data: DayEntry[]; days: number }) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1);
  const labelEvery = days <= 14 ? 1 : days <= 30 ? 3 : 7;

  return (
    <div className="gc cx-chart-card">
      <div className="cx-card-title" style={{ marginBottom: 12 }}>Chamadas por Dia</div>
      <div className="cx-bar-chart" style={{ height: 160 }}>
        {data.map((d, i) => {
          const totalPct  = Math.max(2, Math.round((d.total    / maxTotal) * 100));
          const answPct   = Math.max(2, Math.round((d.answered / maxTotal) * 100));
          const showLabel = i % labelEvery === 0;
          return (
            <div key={d.date} className="cx-bar-col" title={`${fmtDate(d.date)}: ${d.total} total / ${d.answered} atendidas${d.cost > 0 ? ` / ${fmtCost(d.cost)}` : ""}`}>
              <div style={{ width: "100%", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative" }}>
                <div className="cx-bar-fill" style={{ height: `${totalPct}%`, opacity: 0.3 }} />
                <div className="cx-bar-fill answered" style={{ height: `${answPct}%`, position: "absolute", bottom: 0, left: 0, right: 0 }} />
              </div>
              {showLabel && (
                <span className="cx-bar-lbl">{fmtDate(d.date)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
        <span className="cx-card-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--red)", display: "inline-block" }} /> Atendidas
        </span>
        <span className="cx-card-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--red)", opacity: 0.3, display: "inline-block" }} /> Total
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
    <div>
      {/* Filtros */}
      <div className="gc" style={{ padding: 20, marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="cx-kpi-icon" style={{ width: 36, height: 36, background: "rgba(232,0,45,0.15)" }}>
            <BarChart2 style={{ width: 18, height: 18, color: "var(--red)" }} />
          </div>
          <div>
            <div className="cx-card-title">Analytics Global</div>
            <div className="cx-card-sub">Visão consolidada de todos os tenants</div>
          </div>
        </div>

        <div style={{ marginLeft: "auto" }} className="cx-period-tabs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`cx-period-tab ${days === d ? "active" : ""}`}
            >
              {d}D
            </button>
          ))}
        </div>

        <button
          onClick={() => load(days)}
          className="cx-refresh-btn"
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
        >
          <RefreshCw style={{ width: 14, height: 14, ...(loading ? { animation: "cx-spin .8s linear infinite" } : {}) }} />
          Atualizar
        </button>
      </div>

      {loading && !data && (
        <div className="cx-loading" style={{ height: 256 }}>
          <div className="cx-spinner" />
          Carregando analytics...
        </div>
      )}

      {data && (
        <>
          {/* KPI Grid */}
          <div className="cx-kpi-grid" style={{ marginBottom: 24 }}>
            <MetricCard
              label="Total de Chamadas"
              value={c!.totalCalls.toLocaleString("pt-BR")}
              sub={`Últimos ${days} dias`}
              icon={PhoneCall}
              gradClass="grad-cyan"
              iconBg="rgba(0,194,255,0.12)"
            />
            <MetricCard
              label="Atendidas"
              value={`${c!.answeredCalls.toLocaleString("pt-BR")} (${c!.answerRate}%)`}
              sub="Taxa de atendimento"
              icon={CheckCircle2}
              gradClass="grad-green"
              iconBg="rgba(0,214,143,0.12)"
            />
            <MetricCard
              label="Custo Total"
              value={fmtCost(c!.totalCost)}
              sub={`${fmtDuration(c!.totalDurationMinutes)} de fala`}
              icon={DollarSign}
              gradClass="grad-red"
              iconBg="rgba(232,0,45,0.15)"
            />
            <MetricCard
              label="Tenants Ativos"
              value={`${c!.activeTenants} / ${c!.totalTenants}`}
              sub={`${c!.activeQueues} filas · ${c!.activeCalls} em ligação agora`}
              icon={Users}
              gradClass="grad-white"
              iconBg="rgba(168,85,247,0.12)"
            />
          </div>

          {/* Live status */}
          {(c!.activeCalls > 0 || c!.activeQueues > 0) && (
            <div className="gc" style={{ padding: "14px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ position: "relative", width: 10, height: 10 }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--green)", opacity: 0.4, animation: "cx-spin 1.5s ease-in-out infinite" }} />
                <span style={{ position: "relative", display: "block", width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />
              </span>
              <span className="cx-card-sub" style={{ color: "var(--green)", fontWeight: 600 }}>
                {c!.activeCalls} chamada{c!.activeCalls !== 1 ? "s" : ""} ativa{c!.activeCalls !== 1 ? "s" : ""} agora
                {c!.activeQueues > 0 && ` · ${c!.activeQueues} fila${c!.activeQueues !== 1 ? "s" : ""} rodando`}
              </span>
            </div>
          )}

          {/* Gráfico */}
          <div style={{ marginBottom: 24 }}>
            <CallsChart data={data.callsByDay} days={days} />
          </div>

          {/* Top tenants + Motivos de encerramento */}
          <div className="cx-bot-grid" style={{ marginBottom: 24 }}>
            {/* Top tenants */}
            <div className="gc cx-mot-card">
              <div className="cx-card-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <TrendingUp style={{ width: 16, height: 16, color: "var(--red)" }} />
                Top Tenants por Volume
              </div>
              {data.topTenants.length === 0 ? (
                <div className="cx-card-sub" style={{ textAlign: "center", padding: "32px 0" }}>Sem dados no período</div>
              ) : (
                <div className="cx-mot-rows">
                  {data.topTenants.map((t) => {
                    const rate = t.total > 0 ? Math.round((t.answered / t.total) * 100) : 0;
                    const maxT = data.topTenants[0].total;
                    const barWidth = Math.round((t.total / maxT) * 100);
                    return (
                      <div key={t.id} className="cx-mot-row">
                        <span className="cx-mot-name" title={t.name}>{t.name}</span>
                        <div className="cx-mot-bar">
                          <div className="cx-mot-fill" style={{ width: `${barWidth}%`, background: "var(--cyan)" }} />
                        </div>
                        <span className="cx-mot-val">
                          {t.total.toLocaleString("pt-BR")}
                          {" "}
                          <span className="cx-mot-pct">({rate}% · {fmtCost(t.cost)})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Motivos de encerramento */}
            <div className="gc cx-mot-card">
              <div className="cx-card-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Activity style={{ width: 16, height: 16, color: "var(--red)" }} />
                Motivos de Encerramento
              </div>
              {data.endReasons.length === 0 ? (
                <div className="cx-card-sub" style={{ textAlign: "center", padding: "32px 0" }}>Sem dados no período</div>
              ) : (
                <div className="cx-mot-rows">
                  {data.endReasons.map(({ reason, count }) => {
                    const total = data.endReasons.reduce((s, r) => s + r.count, 0);
                    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isAnswered = ANSWERED.has(reason);
                    const barColor = isAnswered ? "var(--green)" : "var(--text-3)";
                    return (
                      <div key={reason} className="cx-mot-row">
                        <span className="cx-mot-name" title={reason}>{reasonLabel(reason)}</span>
                        <div className="cx-mot-bar">
                          <div className="cx-mot-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="cx-mot-val">
                          {count.toLocaleString("pt-BR")} <span className="cx-mot-pct">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Custo médio por chamada */}
          {c!.totalCalls > 0 && (
            <div className="cx-kpi-grid" style={{ gridTemplateColumns: c!.answeredCalls > 0 ? "repeat(3,1fr)" : "repeat(2,1fr)", marginBottom: 24 }}>
              <MetricCard
                label="Custo Médio / Chamada"
                value={fmtCost(c!.totalCost / c!.totalCalls)}
                icon={Zap}
                gradClass="grad-red"
                iconBg="rgba(232,0,45,0.15)"
              />
              <MetricCard
                label="Duração Média / Chamada"
                value={`${Math.round((c!.totalDurationMinutes * 60) / c!.totalCalls)}s`}
                sub="Todas as chamadas"
                icon={Clock}
                gradClass="grad-cyan"
                iconBg="rgba(0,194,255,0.12)"
              />
              {c!.answeredCalls > 0 && (
                <MetricCard
                  label="Custo Médio / Atendida"
                  value={fmtCost(c!.totalCost / c!.answeredCalls)}
                  sub="Apenas chamadas atendidas"
                  icon={DollarSign}
                  gradClass="grad-green"
                  iconBg="rgba(0,214,143,0.12)"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
