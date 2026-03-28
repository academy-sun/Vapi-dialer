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
} from "lucide-react";

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

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "#6366f1" }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "18" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

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

function BooleanCard({ field }: { field: FieldAnalysis }) {
  const yes  = field.trueCount  ?? 0;
  const no   = field.falseCount ?? 0;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((yes / total) * 100) : 0;

  return (
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        {yesPct >= 50 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
        {field.key}
        <span className="ml-auto text-gray-300 font-normal normal-case">{field.count} registros</span>
      </h4>
      <div className="flex gap-3">
        <div className="flex-1 rounded-lg p-3 text-center" style={{ background: "#10b98118" }}>
          <p className="text-2xl font-bold text-emerald-600">{yesPct}%</p>
          <p className="text-xs text-gray-500 mt-0.5">Sim ({yes})</p>
        </div>
        <div className="flex-1 rounded-lg p-3 text-center" style={{ background: "#ef444418" }}>
          <p className="text-2xl font-bold text-red-500">{100 - yesPct}%</p>
          <p className="text-xs text-gray-500 mt-0.5">Não ({no})</p>
        </div>
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

function TextCard({ field }: { field: FieldAnalysis }) {
  return (
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        {field.key}
        <span className="ml-auto text-gray-300 font-normal normal-case">{field.count} registros</span>
      </h4>
      <div className="space-y-1.5">
        {(field.samples ?? []).map((s, i) => (
          <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
            "{s}"
          </p>
        ))}
      </div>
    </div>
  );
}

function FieldCard({ field }: { field: FieldAnalysis }) {
  if (field.type === "enum")    return <EnumCard field={field} />;
  if (field.type === "boolean") return <BooleanCard field={field} />;
  if (field.type === "number")  return <NumberCard field={field} />;
  return <TextCard field={field} />;
}

// ─── Funil de Abandono por Etapa ──────────────────────────────────────────────

function FunnelSection({ funnel }: { funnel: DossieData["funnelAnalysis"] }) {
  if (!funnel.hasData || funnel.stages.length === 0) return null;

  const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <TrendingDown className="w-4 h-4 text-violet-500" />
        Funil de Abandono — onde a conversa para
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Baseado em {funnel.totalWithData.toLocaleString("pt-BR")} chamadas com dados de etapa.
      </p>
      <div className="card p-4">
        <div className="space-y-2.5">
          {funnel.stages.map((stage, i) => (
            <div key={stage.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: STAGE_COLORS[i] }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-800 truncate">{stage.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {stage.dropoff !== null && stage.dropoff > 0 && (
                    <span className="text-xs text-red-500 font-medium">
                      −{stage.dropoff}% na entrada
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{stage.cumulative} calls</span>
                  <span className="text-xs font-bold text-gray-700 w-10 text-right">{stage.pct}%</span>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden bg-gray-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${stage.pct}%`,
                    background: STAGE_COLORS[i],
                    opacity: 0.85,
                  }}
                />
              </div>
              {stage.stopped > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {stage.stopped} {stage.stopped === 1 ? "ligação encerrou" : "ligações encerraram"} nesta etapa
                  {stage.label !== "Agendamento/Fechamento" ? " (não avançaram)" : " (objetivo atingido ✓)"}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Insight diagnóstico */}
        {(() => {
          const worstDropoff = funnel.stages.reduce((worst, s) =>
            s.dropoff !== null && s.dropoff > (worst?.dropoff ?? 0) ? s : worst,
            null as FunnelStage | null
          );
          if (!worstDropoff || worstDropoff.dropoff === null) return null;
          return (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
              <p className="text-xs text-violet-700">
                <strong>Maior gargalo:</strong> a etapa "{worstDropoff.label}" perde{" "}
                <strong>{worstDropoff.dropoff}%</strong> das conversas que chegaram até ela.
                Revise o script neste ponto específico.
              </p>
            </div>
          );
        })()}
      </div>
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
          {/* Métrica principal */}
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

          {/* Impacto financeiro ou CTA para configurar */}
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DossiePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [campaigns, setCampaigns]         = useState<Campaign[]>([]);
  const [selectedQueue, setSelectedQueue] = useState("");
  const [days, setDays]                   = useState(90);
  const [loading, setLoading]             = useState(false);
  const [data, setData]                   = useState<DossieData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (queueId: string, d: number) => {
    if (!queueId) return;
    setLoading(true);
    setData(null);
    const res  = await fetch(`/api/tenants/${tenantId}/analytics/dossie?queueId=${queueId}&days=${d}`);
    const json = await res.json();
    if (json.data) setData(json.data);
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

  const BUCKET_ORDER  = ["0–10s", "10–30s", "30–60s", "1–3min", "3–5min", "5min+"];
  const BUCKET_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#6366f1"];

  const durationBuckets = data
    ? BUCKET_ORDER.map((k) => ({ label: k, value: data.durationAnalysis.buckets[k] ?? 0 }))
    : [];
  const maxBucket = Math.max(...durationBuckets.map((b) => b.value), 1);

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
          <button onClick={handlePrint} className="btn-secondary gap-2 no-print">
            <Printer className="w-4 h-4" />
            Exportar / Imprimir
          </button>
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

          {/* 1. Visão Geral */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-indigo-500" />
              Visão Geral
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard
                icon={PhoneCall}
                label="Total de chamadas"
                value={data.overview.totalCalls.toLocaleString("pt-BR")}
                color="#6366f1"
              />
              <StatCard
                icon={Users}
                label="Atenderam"
                value={`${data.overview.answerRate}%`}
                sub={`${data.overview.answeredCalls.toLocaleString("pt-BR")} chamadas`}
                color="#10b981"
              />
              <StatCard
                icon={PhoneMissed}
                label="Não atenderam"
                value={`${100 - data.overview.answerRate}%`}
                sub={`${(data.overview.totalCalls - data.overview.answeredCalls).toLocaleString("pt-BR")} chamadas`}
                color="#ef4444"
              />
              <StatCard
                icon={Clock}
                label="Duração média"
                value={fmtDuration(data.durationAnalysis.avg)}
                sub="chamadas atendidas"
                color="#f59e0b"
              />
              <StatCard
                icon={DollarSign}
                label="Custo total"
                value={fmtCurrency(data.overview.totalCost)}
                color="#8b5cf6"
              />
              <StatCard
                icon={DollarSign}
                label="Custo por chamada"
                value={fmtCurrency(data.overview.avgCostPerCall)}
                color="#8b5cf6"
              />
              <StatCard
                icon={TrendingUp}
                label="Com inteligência"
                value={`${data.overview.structuredOutputsRate}%`}
                sub={`${data.overview.structuredOutputsCount.toLocaleString("pt-BR")} com dados`}
                color="#14b8a6"
              />
            </div>
          </section>

          {/* 2. Oportunidades Não Trabalhadas */}
          <OpportunitiesSection
            card={data.opportunitiesCard}
            tenantId={tenantId}
            campaignId={data.campaign?.id}
          />

          {/* 3. Mapa de Abandono — quando desligam */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Mapa de Abandono — quando os leads desligam
            </h2>
            <div className="card p-4">
              {data.durationAnalysis.total === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma chamada atendida no período.</p>
              ) : (
                <>
                  {data.durationAnalysis.voicemailCount > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                      <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        <strong>{data.durationAnalysis.voicemailCount} chamadas</strong> foram para caixa postal (detectadas pelo Vapi) e estão excluídas do mapa abaixo.
                      </p>
                    </div>
                  )}

                  <div className="flex items-end gap-2" style={{ height: "120px" }}>
                    {durationBuckets.map((b, i) => {
                      const barH   = maxBucket > 0 ? Math.max(Math.round((b.value / maxBucket) * 100), b.value > 0 ? 4 : 0) : 0;
                      const callPct = data.durationAnalysis.total > 0
                        ? Math.round((b.value / data.durationAnalysis.total) * 100)
                        : 0;
                      return (
                        <div key={b.label} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: "120px" }}>
                          {b.value > 0 && (
                            <span className="text-xs font-semibold text-gray-700">{callPct}%</span>
                          )}
                          <div
                            className="w-full rounded-t-md"
                            style={{
                              height: `${barH}px`,
                              background: BUCKET_COLORS[i],
                              opacity: 0.85,
                              minHeight: b.value > 0 ? "4px" : "0",
                            }}
                          />
                          <span className="text-xs text-gray-500 text-center leading-tight">{b.label}</span>
                          <span className="text-xs text-gray-400">{b.value}</span>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs mt-3 text-center" style={{ color: "#6b7280" }}>
                    {(() => {
                      const early = (data.durationAnalysis.buckets["0–10s"] ?? 0) +
                                    (data.durationAnalysis.buckets["10–30s"] ?? 0);
                      const earlyPct = data.durationAnalysis.total > 0
                        ? Math.round((early / data.durationAnalysis.total) * 100) : 0;
                      const vmNote = data.durationAnalysis.voicemailCount > 0
                        ? ` (${data.durationAnalysis.voicemailCount} caixas postais já excluídas)`
                        : "";
                      if (earlyPct > 40) return `⚠️ ${earlyPct}% das conversas duram menos de 30s${vmNote} — avalie o script de abertura.`;
                      if (earlyPct > 20) return `${earlyPct}% das conversas encerram antes de 30s${vmNote} — considere revisar a abordagem inicial.`;
                      return `Perfil de engajamento saudável — maioria das conversas passa de 30s.`;
                    })()}
                  </p>
                </>
              )}
            </div>
          </section>

          {/* 4. Funil de Abandono por Etapa */}
          <FunnelSection funnel={data.funnelAnalysis} />

          {/* 5. Análise de Campos (Structured Outputs) */}
          {data.fieldAnalysis.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                Inteligência dos Dados — Structured Outputs
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Baseado em {data.overview.structuredOutputsCount.toLocaleString("pt-BR")} chamadas com dados estruturados.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.fieldAnalysis.map((field) => (
                  <FieldCard key={field.key} field={field} />
                ))}
              </div>
            </section>
          )}

          {/* 6. Correlações: campo × duração */}
          {Object.keys(data.correlations).length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                Detector de ICP — Engajamento por Segmento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(data.correlations).map(([field, groups]) => {
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
          )}

          {/* Sem structured outputs */}
          {data.fieldAnalysis.length === 0 && (
            <div className="card p-6 text-center">
              <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 mb-1">Nenhum dado estruturado encontrado</p>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Configure um Structured Output no assistente Vapi desta campanha para visualizar a análise de campos, mapa de objeções e detector de ICP.
              </p>
            </div>
          )}

          {/* Rodapé de impressão */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
            Gerado em {new Date().toLocaleString("pt-BR")} · CallX by MX3
          </div>
        </div>
      )}
    </div>
  );
}
