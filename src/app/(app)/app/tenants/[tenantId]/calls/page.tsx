"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
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
  Plus,
  Loader2,
} from "lucide-react";

interface Queue { id: string; name: string; assistant_id: string | null }

interface AssistantConfig {
  assistant_id: string;
  success_field: string | null;
  success_value: string | null;
}

interface Call {
  id: string;
  vapi_call_id: string;
  status: string | null;
  ended_reason: string | null;
  cost: number | null;
  summary: string | null;
  duration_seconds: number | null;
  created_at: string;
  lead_phone: string | null;
  lead_name: string | null;
  interesse: string | null;
  performance_score: number | null;
  success_evaluation: boolean | null;
  resumo: string | null;
  pontos_melhoria: string | null;
  objecoes: string | null;
  motivos_falha: string | null;
  proximo_passo: string | null;
  score: number | null;
  outputs_flat: Record<string, unknown> | null;
  leads: { next_attempt_at: string | null } | null;
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
function InteresseBadge({ call }: { call: Call }) {
  if (call.success_evaluation === true) {
    return (
      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <CheckCircle2 style={{ width: 12, height: 12 }} /> Sucesso
      </span>
    );
  }
  if (call.success_evaluation === false) {
    return (
      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <XCircle style={{ width: 12, height: 12 }} /> Fracasso
      </span>
    );
  }
  if (call.interesse) {
    return (
      <span className="badge badge-blue">
        {valueToLabel(call.interesse)}
      </span>
    );
  }
  return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>;
}

/** Painel de avaliação detalhada no drawer */
function EvaluationPanel({ call }: { call: CallDetail }) {
  const result: Record<string, unknown> = {};
  if (call.outputs_flat) Object.assign(result, call.outputs_flat);

  if (call.interesse) result["Interesse"] = call.interesse;
  if (call.success_evaluation != null) result["Avaliação"] = call.success_evaluation ? "Sim" : "Não";
  if (call.resumo) result["resumo"] = call.resumo;
  if (call.pontos_melhoria) result["Pontos Melhoria"] = call.pontos_melhoria;
  if (call.objecoes) result["Lista Objeções"] = call.objecoes;
  if (call.motivos_falha) result["Possíveis Motivos de Falha"] = call.motivos_falha;
  if (call.proximo_passo) result["Próximo Passo"] = call.proximo_passo;

  if (Object.keys(result).length === 0) return null;

  // Separar campos curtos (badges/valores) dos longos (textos)
  const shortEntries: [string, unknown][] = [];
  const longEntries: [string, unknown][] = [];

  for (const [k, v] of Object.entries(result)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "Performance Global Score" || k === "score") continue;
    if (isLongTextField(k, v)) longEntries.push([k, v]);
    else shortEntries.push([k, v]);
  }

  const score = call.score ?? call.performance_score ?? result["Performance Global Score"];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Score global destacado */}
      {score != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,194,255,0.08)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(0,194,255,0.15)' }}>
          <Star style={{ width: 16, height: 16, color: 'var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score Global</span>
          <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--cyan)', fontFamily: "'JetBrains Mono', monospace" }}>{String(score)}</span>
        </div>
      )}

      {/* Campos curtos em grid */}
      {shortEntries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {shortEntries.map(([k, v]) => {
            const label = RESULT_PRIORITY_FIELDS[k] ?? k;
            const isScore = k === "Performance Global Score";
            if (isScore) return null; // já exibido acima
            const isSuccess = isSuccessValue(v);
            const isFailure = isFailureValue(v);
            return (
              <div key={k} style={{ background: 'var(--glass-bg)', borderRadius: 10, padding: '8px 10px', border: '1px solid var(--glass-border)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
                {isSuccess ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} /> Sim
                  </span>
                ) : isFailure ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                    <XCircle style={{ width: 12, height: 12 }} /> Não
                  </span>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valueToLabel(v)}</p>
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
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
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
  const [totalCalls, setTotalCalls] = useState(0);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [assistantConfigs, setAssistantConfigs] = useState<AssistantConfig[]>([]);
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterReason, setFilterReason] = useState("all");
  const [filterQueue, setFilterQueue] = useState("all");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchCallId, setSearchCallId] = useState("");
  const [shortDurationMode, setShortDurationMode] = useState(false);
  const [maxDuration, setMaxDuration] = useState("30");
  const [filterInteresse, setFilterInteresse] = useState<string>("all");
  const [showRetrabalhoModal, setShowRetrabalhoModal] = useState(false);
  const [retrabalhoName, setRetrabalhoName] = useState("");
  const [retrabalhoLoading, setRetrabalhoLoading] = useState(false);
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
    Promise.all([
      fetch(`/api/tenants/${tenantId}/queues`).then((r) => r.json()),
      fetch(`/api/tenants/${tenantId}/assistant-configs`).then((r) => r.json()),
    ])
      .then(([queueData, configData]) => {
        setQueues(queueData.queues ?? []);
        setAssistantConfigs(configData.configs ?? []);
      })
      .catch(() => setPageError("Falha ao carregar filas."));
  }, [tenantId]);

  const loadCalls = useCallback(async (showRefresh = false) => {
    setPageError(null);
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (filterQueue !== "all") params.set("queueId", filterQueue);
      if (shortDurationMode) {
        params.set("answered_only", "true");
        params.set("max_duration", maxDuration);
      }
      // Server-side sort for everything except score (score requires client-side JSONB parsing)
      if (sortBy !== "score") {
        const colMap: Record<string, string> = { created_at: "created_at", cost: "cost", duration: "duration_seconds" };
        params.set("sort_by", colMap[sortBy] ?? "created_at");
        params.set("sort_dir", sortDir);
      }

      const res = await fetch(`/api/tenants/${tenantId}/calls?${params}`);
      if (!res.ok) { setPageError("Falha ao carregar chamadas."); setLoading(false); setRefreshing(false); return; }
      const data = await res.json();
      setCalls(data.calls ?? []);
      setTotalCalls(data.total ?? 0);
      if (showRefresh) showToast("Chamadas atualizadas!");
    } catch {
      setPageError("Erro de conexão ao carregar chamadas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, filterQueue, shortDurationMode, maxDuration, sortBy, sortDir, showToast]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  async function createRetrabalhoList() {
    if (!retrabalhoName.trim()) return;
    setRetrabalhoLoading(true);
    try {
      const leads = filteredCalls
        .filter((c) => c.lead_phone)
        .map((c) => ({ phone_e164: c.lead_phone!, data_json: { nome: c.lead_name ?? "" } }));
      const res = await fetch(`/api/tenants/${tenantId}/lead-lists/from-calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: retrabalhoName.trim(), leads }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Erro ao criar lista", "error"); return; }
      showToast(`Lista "${retrabalhoName.trim()}" criada com ${data.imported} leads!`);
      setShowRetrabalhoModal(false);
      setRetrabalhoName("");
    } catch {
      showToast("Erro de conexão", "error");
    } finally {
      setRetrabalhoLoading(false);
    }
  }

  async function openDetail(callId: string) {
    setShowTranscript(false);
    const res = await fetch(`/api/tenants/${tenantId}/calls/${callId}`);
    const data = await res.json();
    setSelected(data.call);
  }

  const filteredCalls = calls.filter((c) => {
    const matchReason = filterReason === "all" || c.ended_reason === filterReason;
    const matchPhone  = !searchPhone
      || (c.lead_phone ?? "").includes(searchPhone.replace(/\D/g, ""))
      || (c.lead_name ?? "").toLowerCase().includes(searchPhone.trim().toLowerCase());
    const matchCallId = !searchCallId || c.vapi_call_id.toLowerCase().includes(searchCallId.trim().toLowerCase());
    let matchInteresse = true;
    if (filterInteresse !== "all") {
      const val = c.interesse;
      if (filterInteresse === "none") {
        matchInteresse = val === undefined || val === null;
      } else {
        matchInteresse = val !== undefined && val !== null &&
          String(val).toLowerCase() === filterInteresse.toLowerCase();
      }
    }
    return matchReason && matchPhone && matchCallId && matchInteresse;
  });

  // Server already sorts by created_at/cost/duration_seconds.
  // Client-side sort only needed for score (requires JSONB parsing).
  const sortedCalls = sortBy === "score"
    ? [...filteredCalls].sort((a, b) => {
        const getScore = (c: Call) => {
          return c.score ?? c.performance_score ?? -1;
        };
        const diff = getScore(b) - getScore(a);
        return sortDir === "desc" ? diff : -diff;
      })
    : filteredCalls;

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

  // Valores únicos do campo de interesse/critério de sucesso presentes nos dados
  const uniqueInteresseValues = useMemo(() => {
    const seen = new Set<string>();
    for (const call of calls) {
      if (call.interesse && typeof call.interesse === "string" && call.interesse.trim() !== "") {
        seen.add(call.interesse.trim());
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [calls]);

  return (
    <div>
      {/* Error banner */}
      {pageError && (
        <div className="alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{pageError}</span>
          <button onClick={() => setPageError(null)} style={{ marginLeft: 'auto', color: 'var(--red)', opacity: 0.7 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Chamadas</h1>
          <p className="page-subtitle">
            {totalCalls > 0 && (
              <>
                {totalCalls.toLocaleString("pt-BR")} chamadas
                {isAdminOrOwner && ` · Custo: $${totalCost.toFixed(4)}`}
                {totalDurSec > 0 && ` · Tempo total: ${formatDuration(totalDurSec)}`}
              </>
            )}
          </p>
        </div>
        <button onClick={() => loadCalls(true)} className="btn btn-secondary" disabled={refreshing}>
          <RefreshCw style={{ width: 16, height: 16, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="gc" style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Filter style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />

          {queues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ListOrdered style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
              <select
                className="cx-select"
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

          <div style={{ position: 'relative' }}>
            <Phone style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 32, maxWidth: 220, fontSize: 13 }}
              placeholder="Buscar por telefone ou nome..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <Hash style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 32, maxWidth: 220, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
              placeholder="Buscar por ID da chamada"
              value={searchCallId}
              onChange={(e) => setSearchCallId(e.target.value)}
            />
          </div>
          <select
            className="cx-select"
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
          {/* Filtro por Critério de Sucesso */}
          <select
            className="cx-select"
            value={filterInteresse}
            onChange={(e) => setFilterInteresse(e.target.value)}
          >
            <option value="all">Qualquer critério de sucesso</option>
            <option value="none">— Sem avaliação</option>
            {uniqueInteresseValues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          {(hasActiveFilters || filterInteresse !== "all") && (
            <button
              onClick={() => { setFilterReason("all"); setSearchPhone(""); setSearchCallId(""); setFilterQueue("all"); setFilterInteresse("all"); }}
              style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, transition: 'color .15s' }}
            >
              <X style={{ width: 14, height: 14 }} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Filtro duração curta + Retrabalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
          <Timer style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={shortDurationMode}
              onChange={(e) => setShortDurationMode(e.target.checked)}
              style={{ accentColor: 'var(--red)' }}
            />
            Atendidas com duração menor que
          </label>
          {shortDurationMode && (
            <>
              <input
                type="number"
                min="1"
                max="600"
                className="form-input"
                style={{ width: 80, fontSize: 13 }}
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>segundos</span>
              <span style={{ fontSize: 11, color: 'var(--red)', background: 'var(--red-lo)', padding: '4px 8px', borderRadius: 8 }}>
                Leads que atenderam mas desligaram rápido — candidatos a re-trabalho
              </span>
            </>
          )}

          {/* Botão Criar Lista de Retrabalho */}
          {filteredCalls.length > 0 && (
            <div style={{ marginLeft: 'auto', position: 'relative' }}>
              {!showRetrabalhoModal ? (
                <button
                  onClick={() => { setRetrabalhoName(`Retrabalho ${new Date().toLocaleDateString("pt-BR")}`); setShowRetrabalhoModal(true); }}
                  className="cx-filter-btn"
                  style={{ gap: 6 }}
                >
                  <Plus style={{ width: 14, height: 14 }} />
                  Criar lista de retrabalho ({filteredCalls.length})
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '8px 12px' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: 12, padding: '6px 10px', width: 200 }}
                    placeholder="Nome da lista..."
                    value={retrabalhoName}
                    onChange={(e) => setRetrabalhoName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createRetrabalhoList(); if (e.key === "Escape") setShowRetrabalhoModal(false); }}
                    autoFocus
                  />
                  <button
                    onClick={createRetrabalhoList}
                    disabled={retrabalhoLoading || !retrabalhoName.trim()}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
                  >
                    {retrabalhoLoading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : "Criar"}
                  </button>
                  <button onClick={() => setShowRetrabalhoModal(false)} style={{ color: 'var(--text-3)' }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sort controls */}
      {!loading && sortedCalls.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>Ordenar por:</span>
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
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'all .15s',
                  background: active ? 'var(--red)' : 'var(--glass-bg)',
                  color: active ? '#fff' : 'var(--text-3)',
                  border: `1px solid ${active ? 'var(--red)' : 'var(--glass-border)'}`,
                }}
              >
                {labels[col]}
                {active && (sortDir === "desc" ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronUp style={{ width: 12, height: 12 }} />)}
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="gc" style={{ overflow: 'hidden' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding: '14px 18px', display: 'flex', gap: 18, borderBottom: '1px solid var(--glass-border)' }}>
              <div className="skeleton" style={{ height: 16, width: 140 }} />
              <div className="skeleton" style={{ height: 16, width: 96, borderRadius: 999 }} />
              <div className="skeleton" style={{ height: 16, width: 64 }} />
              <div className="skeleton" style={{ height: 16, width: 80 }} />
            </div>
          ))}
        </div>
      ) : sortedCalls.length === 0 ? (
        <div className="gc">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" style={{ width: '100%', height: '100%' }}>
                <circle cx="32" cy="32" r="24" fill="rgba(232,0,45,0.1)" />
                <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" fill="var(--red)" opacity=".4" />
                <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" stroke="var(--red)" strokeWidth="1.5" fill="none" />
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
        <div className="gc" style={{ overflow: 'hidden' }}>
          <table className="cx-table">
            <thead>
              <tr>
                <th><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone style={{ width: 14, height: 14 }} />Telefone</span></th>
                <th>Nome</th>
                <th>Resultado</th>
                <th><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Timer style={{ width: 14, height: 14 }} />Duração</span></th>
                <th>Interesse</th>
                <th><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Star style={{ width: 14, height: 14 }} />Score</span></th>
                {isAdminOrOwner && <th><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><DollarSign style={{ width: 14, height: 14 }} />Custo</span></th>}
                <th>Próx. Tentativa</th>
                <th><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar style={{ width: 14, height: 14 }} />Data</span></th>
              </tr>
            </thead>
            <tbody>
              {pagedCalls.map((call) => {
                const isUraSuspect = call.ended_reason === "customer-did-not-answer" && call.duration_seconds != null && call.duration_seconds >= 1 && call.duration_seconds <= 30;
                const reason = isUraSuspect
                  ? { label: "Poss. URA/Caixa postal", badge: "badge-purple" }
                  : (REASON_CONFIG[call.ended_reason ?? ""] ?? { label: call.ended_reason ?? "Em andamento", badge: "badge-gray" });
                const { relative, full } = formatRelativeTime(call.created_at);
                const isSelected = selected?.id === call.id;
                const score = call.score ?? call.performance_score;
                return (
                  <tr
                    key={call.id}
                    onClick={() => openDetail(call.id)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(232,0,45,0.06)' : undefined,
                    }}
                  >
                    <td className="mono" style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                      {call.lead_phone ? formatPhone(call.lead_phone) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      {call.lead_name || <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td>
                      <span className={`badge ${reason.badge}`}>{reason.label}</span>
                    </td>
                    <td className="mono" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td>
                      <InteresseBadge call={call} />
                    </td>
                    <td className="mono" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                      {score != null ? String(score) : "—"}
                    </td>
                    {isAdminOrOwner && (
                      <td className="mono" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                        {call.cost != null ? `$${call.cost.toFixed(4)}` : "—"}
                      </td>
                    )}
                    <td>
                      {(() => {
                        const nextAt = call.leads?.next_attempt_at ? new Date(call.leads.next_attempt_at) : null;
                        if (!nextAt) return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>;
                        const isPast = nextAt < new Date();
                        if (isPast) return <span className="badge badge-yellow" style={{ fontSize: 10 }}>Imediato</span>;
                        return (
                          <span title={nextAt.toLocaleString("pt-BR")} className="badge badge-blue" style={{ fontSize: 10, cursor: 'help' }}>
                            {nextAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <span title={full} style={{ color: 'var(--text-3)', cursor: 'help', fontSize: 12 }}>
                        {relative}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Linhas:</span>
              {[15, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => { setPageSize(n); setCurrentPage(1); }}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: `1px solid ${pageSize === n ? 'var(--red)' : 'var(--glass-border)'}`,
                    background: pageSize === n ? 'var(--red)' : 'var(--glass-bg)',
                    color: pageSize === n ? '#fff' : 'var(--text-3)',
                    transition: 'all .15s',
                  }}
                >{n}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', flex: 1, textAlign: 'center' }}>
              {pagedCalls.length > 0
                ? `${(safePage - 1) * pageSize + 1}–${(safePage - 1) * pageSize + pagedCalls.length} de ${sortedCalls.length}`
                : "0 chamadas"}
              {filterQueue !== "all" && queues.length > 0 && (
                <> · Fila: <strong>{queues.find(q => q.id === filterQueue)?.name}</strong></>
              )}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="cx-filter-btn"
                style={{ fontSize: 12, padding: '4px 10px', opacity: safePage <= 1 ? 0.4 : 1, cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
              >← Anterior</button>
              <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 8px' }}>{safePage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="cx-filter-btn"
                style={{ fontSize: 12, padding: '4px 10px', opacity: safePage >= totalPages ? 0.4 : 1, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
              >Próximo →</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer lateral */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            className="modal-overlay"
            style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)', alignItems: 'stretch', justifyContent: 'flex-end' }}
            onClick={() => setSelected(null)}
          />

          {/* Painel fixo da direita */}
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100%',
              zIndex: 51,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              borderLeft: '1px solid var(--glass-border)',
              boxShadow: '0 0 64px rgba(0,0,0,0.5)',
              width: 440,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 10, background: 'var(--red-lo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PhoneCall style={{ width: 14, height: 14, color: 'var(--red)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Detalhe da Chamada</h2>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                    {isAdminOrOwner ? selected.vapi_call_id : `${selected.vapi_call_id.slice(0, 8)}…`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="btn-icon"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Info básica — telefone + resultado */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Telefone</p>
                  <p className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                    {selected.lead_phone ? formatPhone(selected.lead_phone) : "—"}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {(() => {
                    const r = REASON_CONFIG[selected.ended_reason ?? ""] ?? { label: selected.ended_reason ?? "—", badge: "badge-gray" };
                    return <span className={`badge ${r.badge}`}>{r.label}</span>;
                  })()}
                </div>
              </div>

              {/* Métricas rápidas */}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isAdminOrOwner ? '1fr 1fr 1fr' : '1fr 1fr' }}>
                <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Duração</p>
                  <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                    {formatDuration(selected.duration_seconds)}
                  </p>
                </div>
                {isAdminOrOwner && (
                  <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Custo</p>
                    <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                      {selected.cost != null ? `$${selected.cost.toFixed(4)}` : "—"}
                    </p>
                  </div>
                )}
                <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Data</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                    {new Date(selected.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {/* Avaliação estruturada */}
              {(selected.outputs_flat || selected.interesse || selected.success_evaluation || selected.resumo) && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Avaliação</p>
                  <EvaluationPanel call={selected} />
                </div>
              )}

              {/* Resumo do assistente */}
              {selected.summary && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Resumo</p>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
                    {selected.summary}
                  </p>
                </div>
              )}

              {/* Gravação */}
              {selected.recording_url && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mic style={{ width: 14, height: 14 }} /> Gravação
                  </p>
                  <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: 12, border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <audio
                      controls
                      src={selected.recording_url}
                      style={{ width: '100%', height: 36 }}
                    />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <a
                        href={selected.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                      >
                        <ExternalLink style={{ width: 12, height: 12 }} /> Mono
                      </a>
                      {selected.stereo_recording_url && (
                        <a
                          href={selected.stereo_recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                        >
                          <ExternalLink style={{ width: 12, height: 12 }} /> Estéreo
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
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100%', padding: '4px 0', transition: 'color .15s' }}
                  >
                    Transcrição
                    {showTranscript ? <ChevronUp style={{ width: 14, height: 14, marginLeft: 'auto' }} /> : <ChevronDown style={{ width: 14, height: 14, marginLeft: 'auto' }} />}
                  </button>
                  {showTranscript && (
                    <pre style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
                      {selected.transcript}
                    </pre>
                  )}
                </div>
              )}

              {/* Vapi ID */}
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--glass-border)' }}>
                {isAdminOrOwner ? (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Vapi Call ID</p>
                    <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all', background: 'var(--glass-bg)', borderRadius: 8, padding: '6px 8px', userSelect: 'all', border: '1px solid var(--glass-border)' }}>
                      {selected.vapi_call_id}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Call ID</p>
                    <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--glass-bg)', borderRadius: 8, padding: '6px 8px', border: '1px solid var(--glass-border)' }}>
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
            {t.type === "success" ? <Check style={{ width: 16, height: 16 }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
