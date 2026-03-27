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

interface DossieData {
  campaign: { id: string; name: string } | undefined;
  period: { days: number; since: string };
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DossiePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [selectedQueue, setSelectedQueue] = useState("");
  const [days, setDays]               = useState(90);
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<DossieData | null>(null);
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

  // Carrega campanhas ao entrar
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

  function handlePrint() {
    window.print();
  }

  const BUCKET_ORDER = ["0–10s", "10–30s", "30–60s", "1–3min", "3–5min", "5min+"];
  const BUCKET_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#6366f1"];

  const durationBuckets = data
    ? BUCKET_ORDER.map((k) => ({ label: k, value: data.durationAnalysis.buckets[k] ?? 0 }))
    : [];
  const maxBucket = Math.max(...durationBuckets.map((b) => b.value), 1);

  return (
    <div>
      {/* Print styles injetados via JSX */}
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
          {/* Campanha */}
          <div className="flex-1 min-w-48">
            <label className="form-label">Campanha</label>
            <div className="relative">
              <select
                className="form-input pr-8 appearance-none"
                value={selectedQueue}
                onChange={(e) => {
                  setSelectedQueue(e.target.value);
                  load(e.target.value, days);
                }}
              >
                {campaigns.length === 0 && <option value="">Nenhuma campanha</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Período */}
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
                icon={TrendingDown}
                label="Com inteligência"
                value={`${data.overview.structuredOutputsRate}%`}
                sub={`${data.overview.structuredOutputsCount.toLocaleString("pt-BR")} com dados`}
                color="#14b8a6"
              />
            </div>
          </section>

          {/* 2. Mapa de Engajamento — quando desligam */}
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
                  {/* Aviso de caixa postal se relevante */}
                  {data.durationAnalysis.voicemailCount > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                      <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        <strong>{data.durationAnalysis.voicemailCount} chamadas</strong> foram para caixa postal (detectadas pelo Vapi) e estão excluídas do mapa abaixo.
                        Chamadas curtas restantes são conversas reais curtas ou caixas postais não detectadas.
                      </p>
                    </div>
                  )}

                  {/* Gráfico de barras — altura em px (não %) para funcionar em flex */}
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

                  {/* Diagnóstico */}
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

          {/* 3. Análise de Campos (Structured Outputs) */}
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

          {/* 4. Correlações: campo × duração */}
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

          {/* 5. Sem structured outputs */}
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
