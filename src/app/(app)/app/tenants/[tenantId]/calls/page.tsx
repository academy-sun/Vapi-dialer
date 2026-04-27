"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Phone,
  DollarSign,
  Calendar,
  Filter,
  Timer,
  ListOrdered,
  Star,
  ChevronDown,
  ChevronUp,
  Hash,
  AlertCircle,
  Plus,
  Loader2,
  Target,
  AlertOctagon,
} from "lucide-react";
import CallDetailDrawer, { InteresseBadge } from "@/components/CallDetailDrawer";
import {
  type Call, type CallDetail,
  formatPhone, formatDuration, formatRelativeTime,
} from "@/lib/calls-shared";
import { getReasonInfo, getReasonLabel } from "@/lib/call-reasons";
import {
  FilterDropdownShell,
  FilterCheckItem,
  FilterRadioItem,
  FilterClearFooter,
} from "@/components/FilterDropdown";

interface Queue { id: string; name: string; assistant_id: string | null }

interface AssistantConfig {
  assistant_id: string;
  success_field: string | null;
  success_value: string | null;
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
  const [filterReasons, setFilterReasons] = useState<string[]>([]);
  const [filterQueue, setFilterQueue] = useState("all");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchCallId, setSearchCallId] = useState("");
  const [shortDurationMode, setShortDurationMode] = useState(false);
  const [maxDuration, setMaxDuration] = useState("30");
  const [filterInteresse, setFilterInteresse] = useState<string>("all");
  const [showRetrabalhoModal, setShowRetrabalhoModal] = useState(false);
  const [retrabalhoName, setRetrabalhoName] = useState("");
  const [retrabalhoLoading, setRetrabalhoLoading] = useState(false);
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
    const res = await fetch(`/api/tenants/${tenantId}/calls/${callId}`);
    const data = await res.json();
    setSelected(data.call);
  }

  const filteredCalls = calls.filter((c) => {
    const matchReason = filterReasons.length === 0 || (c.ended_reason !== null && filterReasons.includes(c.ended_reason));
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
  const hasActiveFilters = filterReasons.length > 0 || searchPhone || filterQueue !== "all" || searchCallId;

  // Valores únicos de ended_reason presentes nos dados (inclui erros dinâmicos do Vapi)
  const dynamicReasons: string[] = useMemo(
    () => Array.from(new Set(calls.map((c) => c.ended_reason).filter(Boolean) as string[]))
      .sort((a, b) => getReasonLabel(a).localeCompare(getReasonLabel(b), "pt-BR")),
    [calls]
  );

  const reasonCounts: Record<string, number> = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of calls) {
      if (c.ended_reason) acc[c.ended_reason] = (acc[c.ended_reason] ?? 0) + 1;
    }
    return acc;
  }, [calls]);

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
            <FilterDropdownShell
              icon={<ListOrdered style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
              active={filterQueue !== "all"}
              minWidth={220}
              buttonLabel={
                filterQueue === "all"
                  ? "Todas as campanhas"
                  : (queues.find((q) => q.id === filterQueue)?.name ?? "Campanha")
              }
            >
              {(close) => (
                <>
                  <FilterRadioItem
                    checked={filterQueue === "all"}
                    onSelect={() => { setFilterQueue("all"); close(); }}
                    label="Todas as campanhas"
                  />
                  {queues.map((q) => (
                    <FilterRadioItem
                      key={q.id}
                      checked={filterQueue === q.id}
                      onSelect={() => { setFilterQueue(q.id); close(); }}
                      label={q.name}
                    />
                  ))}
                  {filterQueue !== "all" && (
                    <FilterClearFooter onClear={() => { setFilterQueue("all"); close(); }} />
                  )}
                </>
              )}
            </FilterDropdownShell>
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
          <FilterDropdownShell
            icon={<AlertOctagon style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
            active={filterReasons.length > 0}
            minWidth={220}
            buttonLabel={
              filterReasons.length === 0 ? `Todos os resultados (${calls.length})`
              : filterReasons.length === 1 ? getReasonLabel(filterReasons[0])
              : `${filterReasons.length} motivos selecionados`
            }
          >
            {() => (
              <>
                {dynamicReasons.length === 0 ? (
                  <p style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                    Nenhum motivo disponível
                  </p>
                ) : (
                  <>
                    {dynamicReasons.map((reason) => (
                      <FilterCheckItem
                        key={reason}
                        checked={filterReasons.includes(reason)}
                        onToggle={() => setFilterReasons((prev) =>
                          prev.includes(reason) ? prev.filter((x) => x !== reason) : [...prev, reason]
                        )}
                        label={getReasonLabel(reason)}
                        count={reasonCounts[reason] ?? 0}
                      />
                    ))}
                    {filterReasons.length > 0 && (
                      <FilterClearFooter onClear={() => setFilterReasons([])} />
                    )}
                  </>
                )}
              </>
            )}
          </FilterDropdownShell>

          {/* Filtro por Critério de Sucesso */}
          <FilterDropdownShell
            icon={<Target style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
            active={filterInteresse !== "all"}
            minWidth={200}
            buttonLabel={
              filterInteresse === "all" ? "Qualquer critério"
              : filterInteresse === "none" ? "Sem avaliação"
              : filterInteresse
            }
          >
            {(close) => (
              <>
                <FilterRadioItem
                  checked={filterInteresse === "all"}
                  onSelect={() => { setFilterInteresse("all"); close(); }}
                  label="Qualquer critério"
                />
                <FilterRadioItem
                  checked={filterInteresse === "none"}
                  onSelect={() => { setFilterInteresse("none"); close(); }}
                  label="— Sem avaliação"
                />
                {uniqueInteresseValues.map((v) => (
                  <FilterRadioItem
                    key={v}
                    checked={filterInteresse === v}
                    onSelect={() => { setFilterInteresse(v); close(); }}
                    label={v}
                  />
                ))}
                {filterInteresse !== "all" && (
                  <FilterClearFooter onClear={() => { setFilterInteresse("all"); close(); }} />
                )}
              </>
            )}
          </FilterDropdownShell>

          {(hasActiveFilters || filterInteresse !== "all") && (
            <button
              onClick={() => { setFilterReasons([]); setSearchPhone(""); setSearchCallId(""); setFilterQueue("all"); setFilterInteresse("all"); }}
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
                  : getReasonInfo(call.ended_reason);
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
      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        isAdminOrOwner={isAdminOrOwner}
        tenantId={tenantId}
      />

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
