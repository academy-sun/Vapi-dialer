"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  RefreshCw,
  PhoneCall,
  X,
  Check,
  AlertTriangle,
  Phone,
  DollarSign,
  Calendar,
  Filter,
  Timer,
  CheckCircle2,
  XCircle,
  ListOrdered,
  Star,
  ChevronDown,
  ChevronUp,
  Mic,
  ExternalLink,
  Hash,
  AlertCircle,
} from "lucide-react";

interface Queue { id: string; name: string }

interface Call {
  id: string;
  vapi_call_id: string;
  status: string | null;
  ended_reason: string | null;
  cost: number | null;
  summary: string | null;
  duration_seconds: number | null;
  structured_outputs: Record<string, unknown> | null;
  created_at: string;
  leads: { phone_e164: string; data_json: Record<string, string> } | null;
}

interface CallDetail extends Call {
  transcript: string | null;
  recording_url: string | null;
  stereo_recording_url: string | null;
}

const REASON_CONFIG: Record<string, { label: string; badge: string }> = {
  "customer-ended-call": { label: "Cliente encerrou", badge: "badge-green" },
  "assistant-ended-call": { label: "Assistente encerrou", badge: "badge-blue" },
  "no-answer":            { label: "Sem resposta",      badge: "badge-gray" },
  "busy":                 { label: "Ocupado",           badge: "badge-yellow" },
  "voicemail":            { label: "Caixa postal",      badge: "badge-purple" },
  "failed":               { label: "Falha",             badge: "badge-red" },
};

// Campos do result que devem aparecer no topo do drawer (labels amigáveis)
const RESULT_PRIORITY_FIELDS: Record<string, string> = {
  interesse:                    "Interesse",
  success:                      "Sucesso",
  sucesso:                      "Sucesso",
  successEvaluation:            "Avaliação",
  success_evaluation:           "Avaliação",
  momentoDeCompra:              "Momento de Compra",
  ComparImovelPlanta:           "Comparou Planta",
  QuerReuniaoComVendedor:       "Quer Reunião",
  "Performance Global Score":   "Score Global",
};

// Campos conhecidos como texto longo
const KNOWN_LONG_TEXT_FIELDS = new Set([
  "resumo", "Pontos Melhoria", "Lista Objeções",
  "Possíveis Motivos de Falha", "Justificative Performance Global",
  "compliancePlan", "summary", "notes", "observacoes", "justificativa",
]);

// Heurística: valor longo (>60 chars) ou campo com palavras-chave → texto longo
function isLongTextField(key: string, value: unknown): boolean {
  if (KNOWN_LONG_TEXT_FIELDS.has(key)) return true;
  if (typeof value === "string" && value.length > 60) return true;
  const lk = key.toLowerCase();
  return lk.includes("motiv") || lk.includes("justif") || lk.includes("resum") ||
         lk.includes("descri") || lk.includes("observ") || lk.includes("nota") ||
         lk.includes("comment") || lk.includes("reason") || lk.includes("detail");
}

/** Extrai o nome de exibição do lead a partir de data_json.
 *  Prioridade: nome_identificacao > name > first_name > nome > primeiro_nome */
function getNomeDisplay(dataJson: Record<string, string> | null | undefined): string {
  if (!dataJson) return "";
  return (
    dataJson.nome_identificacao ??
    dataJson.name ??
    dataJson.first_name ??
    dataJson.nome ??
    dataJson.primeiro_nome ??
    ""
  );
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return phone;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatRelativeTime(dateStr: string): { relative: string; full: string } {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  let relative: string;
  if (diff < 60) relative = "agora mesmo";
  else if (diff < 3600) relative = `há ${Math.floor(diff / 60)} min`;
  else if (diff < 86400) relative = `há ${Math.floor(diff / 3600)} h`;
  else relative = `há ${Math.floor(diff / 86400)} dias`;
  return { relative, full: date.toLocaleString("pt-BR") };
}

/**
 * Extrai o objeto `result` do structured_outputs do Vapi.
 * Suporta dois formatos:
 *   1. { result: {...} }  — top-level direto
 *   2. { "<uuid>": { name, result: {...} } } — wrapped por tool call ID
 */
function extractResult(outputs: Record<string, unknown>): Record<string, unknown> | null {
  if (!outputs) return null;
  // Formato 1: tem 'result' direto
  if (outputs.result && typeof outputs.result === "object" && !Array.isArray(outputs.result)) {
    return outputs.result as Record<string, unknown>;
  }
  // Formato 2: valores são objetos com { name, result }
  for (const val of Object.values(outputs)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if (obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)) {
        return obj.result as Record<string, unknown>;
      }
    }
  }
  // Fallback: retorna o próprio objeto
  return outputs;
}

// Chaves buscadas em ordem de prioridade para o campo "INTERESSE".
// Cobre diferentes nomenclaturas usadas em campanhas distintas.
const INTERESSE_KEYS = [
  "interesse", "Interesse", "INTERESSE",
  "interest", "Interest", "INTEREST",
  "nivel_interesse", "nivelInteresse", "nivel_de_interesse",
  "lead_interest", "leadInterest",
  "success", "sucesso", "Sucesso",
  "interested", "successEvaluation", "success_evaluation",
];

function getInteresseValue(result: Record<string, unknown>): unknown {
  for (const key of INTERESSE_KEYS) {
    if (key in result && result[key] != null && result[key] !== "") {
      return result[key];
    }
  }
  return undefined;
}

function isSuccessValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return v === true || s === "true" || s === "sucesso" || s === "sim" || s === "yes" || s === "1";
}

function isFailureValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return v === false || s === "false" || s === "fracasso" || s === "não" || s === "nao" || s === "no" || s === "0";
}

function valueToLabel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Badge compacto para a tabela: só Sucesso / Fracasso */
function InteresseBadge({ outputs }: { outputs: Record<string, unknown> | null }) {
  if (!outputs) return <span className="text-gray-300 text-xs">—</span>;
  const result = extractResult(outputs);
  if (!result) return <span className="text-gray-300 text-xs">—</span>;
  const val = getInteresseValue(result);
  if (val === undefined || val === null) return <span className="text-gray-300 text-xs">—</span>;

  if (isSuccessValue(val)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" /> Sucesso
      </span>
    );
  }
  if (isFailureValue(val)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
        <XCircle className="w-3 h-3" /> Fracasso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
      {valueToLabel(val)}
    </span>
  );
}

/** Painel de avaliação detalhada no drawer */
function EvaluationPanel({ outputs }: { outputs: Record<string, unknown> | null }) {
  const [showTranscript, setShowTranscript] = useState(false);
  if (!outputs) return null;
  const result = extractResult(outputs);
  if (!result || Object.keys(result).length === 0) return null;

  // Separar campos curtos (badges/valores) dos longos (textos)
  const shortEntries: [string, unknown][] = [];
  const longEntries: [string, unknown][] = [];

  for (const [k, v] of Object.entries(result)) {
    if (v === null || v === undefined || v === "") continue;
    if (isLongTextField(k, v)) longEntries.push([k, v]);
    else shortEntries.push([k, v]);
  }

  const score = result["Performance Global Score"];

  return (
    <div className="space-y-3">
      {/* Score global destacado */}
      {score != null && (
        <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2.5">
          <Star className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Score Global</span>
          <span className="ml-auto text-lg font-bold text-indigo-700">{String(score)}</span>
        </div>
      )}

      {/* Campos curtos em grid */}
      {shortEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {shortEntries.map(([k, v]) => {
            const label = RESULT_PRIORITY_FIELDS[k] ?? k;
            const isScore = k === "Performance Global Score";
            if (isScore) return null; // já exibido acima
            const isSuccess = isSuccessValue(v);
            const isFailure = isFailureValue(v);
            return (
              <div key={k} className="bg-gray-50 rounded-lg px-2.5 py-2">
                <p className="text-xs text-gray-400 font-medium mb-0.5 truncate">{label}</p>
                {isSuccess ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" /> Sim
                  </span>
                ) : isFailure ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                    <XCircle className="w-3 h-3" /> Não
                  </span>
                ) : (
                  <p className="text-sm font-semibold text-gray-800 truncate">{valueToLabel(v)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Campos longos como blocos de texto */}
      {longEntries.map(([k, v]) => {
        const label = RESULT_PRIORITY_FIELDS[k] ?? k;
        return (
          <div key={k}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2.5 leading-relaxed">
              {valueToLabel(v)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

interface ToastMsg { id: string; message: string; type: "success" | "error" }
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = useCallback((message: string, type: ToastMsg["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

export default function CallsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [calls, setCalls] = useState<Call[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterReason, setFilterReason] = useState("all");
  const [filterQueue, setFilterQueue] = useState("all");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchCallId, setSearchCallId] = useState("");
  const [shortDurationMode, setShortDurationMode] = useState(false);
  const [maxDuration, setMaxDuration] = useState("30");
  const [showTranscript, setShowTranscript] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"created_at" | "cost" | "duration" | "score">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [userRole, setUserRole] = useState<string>("member");
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const { toasts, show: showToast } = useToast();

  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: m } = await supabase
        .from("memberships")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", data.user.id)
        .single();
      if (m) setUserRole(m.role);
    });
  }, [tenantId]);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/queues`)
      .then((r) => r.json())
      .then((d) => setQueues(d.queues ?? []))
      .catch(() => setPageError("Falha ao carregar filas."));
  }, [tenantId]);

  const loadCalls = useCallback(async (showRefresh = false) => {
    setPageError(null);
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterQueue !== "all") params.set("queueId", filterQueue);
      if (shortDurationMode) {
        params.set("answered_only", "true");
        params.set("max_duration", maxDuration);
      }

      const res = await fetch(`/api/tenants/${tenantId}/calls?${params}`);
      if (!res.ok) { setPageError("Falha ao carregar chamadas."); setLoading(false); setRefreshing(false); return; }
      const data = await res.json();
      setCalls(data.calls ?? []);
      if (showRefresh) showToast("Chamadas atualizadas!");
    } catch {
      setPageError("Erro de conexão ao carregar chamadas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, filterQueue, shortDurationMode, maxDuration, showToast]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  async function openDetail(callId: string) {
    setShowTranscript(false);
    const res = await fetch(`/api/tenants/${tenantId}/calls/${callId}`);
    const data = await res.json();
    setSelected(data.call);
  }

  const filteredCalls = calls.filter((c) => {
    const matchReason = filterReason === "all" || c.ended_reason === filterReason;
    const matchPhone  = !searchPhone
      || (c.leads?.phone_e164 ?? "").includes(searchPhone.replace(/\D/g, ""))
      || getNomeDisplay(c.leads?.data_json).toLowerCase().includes(searchPhone.trim().toLowerCase());
    const matchCallId = !searchCallId || c.vapi_call_id.toLowerCase().includes(searchCallId.trim().toLowerCase());
    return matchReason && matchPhone && matchCallId;
  });

  const sortedCalls = [...filteredCalls].sort((a, b) => {
    let va = 0, vb = 0;
    if (sortBy === "created_at") {
      va = new Date(a.created_at).getTime();
      vb = new Date(b.created_at).getTime();
    } else if (sortBy === "cost") {
      va = a.cost ?? 0;
      vb = b.cost ?? 0;
    } else if (sortBy === "duration") {
      va = a.duration_seconds ?? 0;
      vb = b.duration_seconds ?? 0;
    } else if (sortBy === "score") {
      const getScore = (c: Call) => {
        if (!c.structured_outputs) return -1;
        const r = extractResult(c.structured_outputs);
        const s = r?.["Performance Global Score"];
        return s != null ? parseFloat(String(s)) : -1;
      };
      va = getScore(a);
      vb = getScore(b);
    }
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const totalPages   = Math.max(1, Math.ceil(sortedCalls.length / pageSize));
  const safePage     = Math.min(currentPage, totalPages);
  const pagedCalls   = sortedCalls.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalCost   = calls.reduce((sum, c) => sum + (c.cost ?? 0), 0);
  const totalDurSec = calls.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
  const hasActiveFilters = filterReason !== "all" || searchPhone || filterQueue !== "all" || searchCallId;

  // Valores únicos de ended_reason presentes nos dados (inclui erros dinâmicos do Vapi)
  const dynamicReasons: string[] = Array.from(
    new Set(calls.map((c) => c.ended_reason).filter(Boolean) as string[])
  ).sort();

  return (
    <div>
      {/* Error banner */}
      {pageError && (
        <div className="alert-error flex items-center gap-3 mb-4 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{pageError}</span>
          <button onClick={() => setPageError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Chamadas</h1>
          <p className="page-subtitle">
            {calls.length > 0 && (
              <>
                {calls.length} chamadas
                {isAdminOrOwner && ` · Custo: $${totalCost.toFixed(4)}`}
                {totalDurSec > 0 && ` · Tempo total: ${formatDuration(totalDurSec)}`}
              </>
            )}
          </p>
        </div>
        <button onClick={() => loadCalls(true)} className="btn-secondary" disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card px-4 py-3 mb-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />

          {queues.length > 0 && (
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-gray-400 shrink-0" />
              <select
                className="select-native text-sm py-2.5"
                value={filterQueue}
                onChange={(e) => setFilterQueue(e.target.value)}
              >
                <option value="all">Todas as campanhas</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="form-input pl-9 max-w-xs text-sm"
              placeholder="Buscar por telefone ou nome..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
            />
          </div>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="form-input pl-9 max-w-xs text-sm font-mono"
              placeholder="Buscar por ID da chamada"
              value={searchCallId}
              onChange={(e) => setSearchCallId(e.target.value)}
            />
          </div>
          <select
            className="select-native text-sm py-2.5 max-w-xs"
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
          >
            <option value="all">Todos os resultados ({calls.length})</option>
            {dynamicReasons.map((reason) => {
              const cfg = REASON_CONFIG[reason];
              const count = calls.filter((c) => c.ended_reason === reason).length;
              const label = cfg ? cfg.label : reason;
              return (
                <option key={reason} value={reason}>{label} ({count})</option>
              );
            })}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilterReason("all"); setSearchPhone(""); setSearchCallId(""); setFilterQueue("all"); }}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Limpar filtros
            </button>
          )}
        </div>

        {/* Filtro duração curta */}
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100 flex-wrap">
          <Timer className="w-4 h-4 text-gray-400 shrink-0" />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={shortDurationMode}
              onChange={(e) => setShortDurationMode(e.target.checked)}
            />
            Atendidas com duração menor que
          </label>
          {shortDurationMode && (
            <>
              <input
                type="number"
                min="1"
                max="600"
                className="form-input w-20 text-sm"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
              <span className="text-sm text-gray-500">segundos</span>
              <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                Leads que atenderam mas desligaram rápido — candidatos a re-trabalho
              </span>
            </>
          )}
        </div>
      </div>

      {/* Sort controls */}
      {!loading && sortedCalls.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Ordenar por:</span>
          {(["created_at", "duration", "score", ...(isAdminOrOwner ? ["cost"] : [])] as ("created_at" | "duration" | "score" | "cost")[]).map((col) => {
            const labels: Record<string, string> = { created_at: "Data", duration: "Duração", score: "Score", cost: "Custo" };
            const active = sortBy === col;
            return (
              <button
                key={col}
                onClick={() => {
                  if (active) setSortDir(d => d === "desc" ? "asc" : "desc");
                  else { setSortBy(col); setSortDir("desc"); }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? "#FF1A1A" : "white",
                  color: active ? "white" : "#6b7280",
                  border: `1px solid ${active ? "#FF1A1A" : "#e5e7eb"}`,
                }}
              >
                {labels[col]}
                {active && (sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tabela — sempre largura total, sem layout shift ── */}
      {loading ? (
        <div className="table-wrapper">
          <div className="divide-y divide-gray-50">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-5">
                <div className="skeleton h-4 w-36" />
                <div className="skeleton h-4 w-24 rounded-full" />
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : sortedCalls.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
                <circle cx="32" cy="32" r="24" fill="#e0e7ff" />
                <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" fill="#6366f1" opacity=".6" />
                <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" stroke="#4f46e5" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
            <p className="empty-state-title">
              {calls.length === 0 ? "Nenhuma chamada registrada ainda" : "Nenhuma chamada encontrada"}
            </p>
            <p className="empty-state-desc">
              {calls.length === 0
                ? "As chamadas aparecerão aqui após iniciar uma fila de discagem."
                : "Tente ajustar os filtros de busca."}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th><span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefone</span></th>
                <th>Nome</th>
                <th>Resultado</th>
                <th><span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />Duração</span></th>
                <th>Interesse</th>
                <th><span className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5" />Score</span></th>
                {isAdminOrOwner && <th><span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Custo</span></th>}
                <th><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Data</span></th>
              </tr>
            </thead>
            <tbody>
              {pagedCalls.map((call) => {
                const reason = REASON_CONFIG[call.ended_reason ?? ""] ?? { label: call.ended_reason ?? "Em andamento", badge: "badge-gray" };
                const { relative, full } = formatRelativeTime(call.created_at);
                const isSelected = selected?.id === call.id;
                const result = call.structured_outputs ? extractResult(call.structured_outputs) : null;
                const score = result?.["Performance Global Score"];
                return (
                  <tr
                    key={call.id}
                    onClick={() => openDetail(call.id)}
                    className={`cursor-pointer ${isSelected ? "bg-red-50/40 ring-1 ring-inset ring-red-100" : "hover:bg-gray-50/80"}`}
                  >
                    <td className="font-mono font-medium text-gray-900">
                      {call.leads ? formatPhone(call.leads.phone_e164) : "—"}
                    </td>
                    <td className="text-sm text-gray-700">
                      {getNomeDisplay(call.leads?.data_json) || <span className="text-gray-300">—</span>}
                    </td>
                    <td>
                      <span className={reason.badge}>{reason.label}</span>
                    </td>
                    <td className="text-gray-600 font-mono text-sm">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td>
                      <InteresseBadge outputs={call.structured_outputs} />
                    </td>
                    <td className="text-gray-600 font-mono text-sm">
                      {score != null ? String(score) : "—"}
                    </td>
                    {isAdminOrOwner && (
                      <td className="text-gray-600 font-mono text-sm">
                        {call.cost != null ? `$${call.cost.toFixed(4)}` : "—"}
                      </td>
                    )}
                    <td>
                      <span title={full} className="text-gray-500 cursor-help">
                        {relative}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Linhas:</span>
              {[15, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => { setPageSize(n); setCurrentPage(1); }}
                  className="text-xs px-2 py-1 rounded-md border transition-all"
                  style={{
                    background: pageSize === n ? "#FF1A1A" : "white",
                    color: pageSize === n ? "white" : "#6b7280",
                    borderColor: pageSize === n ? "#FF1A1A" : "#e5e7eb",
                  }}
                >{n}</button>
              ))}
            </div>
            <p className="text-xs text-gray-400 flex-1 text-center">
              {pagedCalls.length > 0
                ? `${(safePage - 1) * pageSize + 1}–${(safePage - 1) * pageSize + pagedCalls.length} de ${sortedCalls.length}`
                : "0 chamadas"}
              {filterQueue !== "all" && queues.length > 0 && (
                <> · Fila: <strong>{queues.find(q => q.id === filterQueue)?.name}</strong></>
              )}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >← Anterior</button>
              <span className="text-xs text-gray-500 px-2">{safePage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >Próximo →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer lateral — painel fixo deslizante (não afeta layout da tabela) ── */}
      {selected && (
        <>
          {/* Backdrop semitransparente — clique fora para fechar */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setSelected(null)}
          />

          {/* Painel fixo da direita */}
          <div
            className="fixed right-0 top-0 h-full z-50 flex flex-col bg-white shadow-2xl border-l border-gray-200"
            style={{ width: "440px" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                  <PhoneCall className="w-3.5 h-3.5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Detalhe da Chamada</h2>
                  <p className="text-xs text-gray-400 font-mono truncate max-w-[240px]">
                    {isAdminOrOwner ? selected.vapi_call_id : `${selected.vapi_call_id.slice(0, 8)}…`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="btn-icon text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {/* Info básica — telefone + resultado */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Telefone</p>
                  <p className="font-mono text-base font-semibold text-gray-900">
                    {selected.leads ? formatPhone(selected.leads.phone_e164) : "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {(() => {
                    const r = REASON_CONFIG[selected.ended_reason ?? ""] ?? { label: selected.ended_reason ?? "—", badge: "badge-gray" };
                    return <span className={r.badge}>{r.label}</span>;
                  })()}
                </div>
              </div>

              {/* Métricas rápidas */}
              <div className={`grid gap-2 ${isAdminOrOwner ? "grid-cols-3" : "grid-cols-2"}`}>
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs text-gray-400 font-medium">Duração</p>
                  <p className="font-mono text-sm font-bold text-gray-800 mt-0.5">
                    {formatDuration(selected.duration_seconds)}
                  </p>
                </div>
                {isAdminOrOwner && (
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-xs text-gray-400 font-medium">Custo</p>
                    <p className="font-mono text-sm font-bold text-gray-800 mt-0.5">
                      {selected.cost != null ? `$${selected.cost.toFixed(4)}` : "—"}
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xs text-gray-400 font-medium">Data</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">
                    {new Date(selected.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {/* Avaliação estruturada */}
              {selected.structured_outputs && Object.keys(selected.structured_outputs).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Avaliação</p>
                  <EvaluationPanel outputs={selected.structured_outputs} />
                </div>
              )}

              {/* Resumo do assistente */}
              {selected.summary && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumo</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-3 leading-relaxed">
                    {selected.summary}
                  </p>
                </div>
              )}

              {/* Gravação */}
              {selected.recording_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" /> Gravação
                  </p>
                  <div className="bg-gray-50 rounded-xl px-3 py-3 space-y-2">
                    <audio
                      controls
                      src={selected.recording_url}
                      className="w-full"
                      style={{ height: "36px" }}
                    />
                    <div className="flex gap-3">
                      <a
                        href={selected.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Mono
                      </a>
                      {selected.stereo_recording_url && (
                        <a
                          href={selected.stereo_recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> Estéreo
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Transcrição colapsável */}
              {selected.transcript && (
                <div>
                  <button
                    onClick={() => setShowTranscript((v) => !v)}
                    className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide w-full hover:text-gray-600 py-1"
                  >
                    Transcrição
                    {showTranscript ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                  {showTranscript && (
                    <pre className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-3 whitespace-pre-wrap font-mono leading-relaxed">
                      {selected.transcript}
                    </pre>
                  )}
                </div>
              )}

              {/* Vapi ID — ID completo para admin/owner, truncado para member */}
              <div className="pt-2 border-t border-gray-50">
                {isAdminOrOwner ? (
                  <>
                    <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">Vapi Call ID</p>
                    <p className="font-mono text-xs text-gray-400 break-all bg-gray-50 rounded px-2 py-1.5 select-all">
                      {selected.vapi_call_id}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">Call ID</p>
                    <p className="font-mono text-xs text-gray-400 bg-gray-50 rounded px-2 py-1.5">
                      {selected.vapi_call_id.slice(0, 8)}…
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success" ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
