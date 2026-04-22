"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle,
  Clock, Phone, ChevronDown, Timer, Filter, AlertOctagon, Target, X,
} from "lucide-react";
import CallDetailDrawer from "@/components/CallDetailDrawer";
import { type CallDetail, formatPhone, formatDuration } from "@/lib/calls-shared";
import { getReasonInfo, getReasonTone, getReasonLabel } from "@/lib/call-reasons";
import { createClient } from "@/lib/supabase/browser";
import {
  FilterDropdownShell,
  FilterCheckItem,
  FilterClearFooter,
} from "@/components/FilterDropdown";

interface KanbanCard {
  lead_id: string;
  phone: string;
  name: string | null;
  status: string;
  attempt_count: number;
  last_call: {
    id: string;
    ended_reason: string | null;
    duration_seconds: number | null;
    success_evaluation: boolean | null;
    interesse: string | null;
    score: number | null;
  } | null;
}

interface KanbanColumn {
  index: number;
  label: string;
  total: number;
  leads: KanbanCard[];
}

interface KanbanResponse {
  maxAttempts: number;
  queueName: string;
  columns: KanbanColumn[];
}

interface ExpandResponse {
  maxAttempts: number;
  queueName: string;
  column: KanbanColumn;
}

const PAGE_SIZE = 100;

type CardTone = "success" | "failure" | "calling" | "waiting" | "neutral";

function getCardTone(card: KanbanCard): CardTone {
  if (card.last_call?.success_evaluation === true) return "success";
  if (card.last_call?.success_evaluation === false) return "failure";
  if (card.last_call && getReasonTone(card.last_call.ended_reason) === "failure") return "failure";
  if (card.status === "calling") return "calling";
  if (card.status === "completed") return "success";
  if (card.status === "failed") return "failure";
  if (card.status === "doNotCall") return "failure";
  if (card.attempt_count === 0) return "waiting";
  return "neutral";
}

function toneStyles(tone: CardTone): React.CSSProperties {
  switch (tone) {
    case "success":
      return {
        borderLeft: '3px solid var(--green)',
        background: 'rgba(0,214,143,0.08)',
      };
    case "failure":
      return {
        borderLeft: '3px solid var(--red)',
        background: 'rgba(232,0,45,0.06)',
      };
    case "calling":
      return {
        borderLeft: '3px solid var(--yellow)',
        background: 'rgba(255,184,0,0.08)',
      };
    case "waiting":
      return {
        borderLeft: '3px solid rgba(255,255,255,0.15)',
        background: 'var(--glass-bg)',
      };
    default:
      return {
        borderLeft: '3px solid var(--cyan)',
        background: 'var(--glass-bg)',
      };
  }
}

function ToneBadge({ tone }: { tone: CardTone }) {
  if (tone === "success") {
    return (
      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
        <CheckCircle2 style={{ width: 10, height: 10 }} /> Sucesso
      </span>
    );
  }
  if (tone === "failure") {
    return (
      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
        <XCircle style={{ width: 10, height: 10 }} /> Fracasso
      </span>
    );
  }
  if (tone === "calling") {
    return (
      <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
        <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} /> Em ligação
      </span>
    );
  }
  if (tone === "waiting") {
    return (
      <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
        <Clock style={{ width: 10, height: 10 }} /> Aguardando
      </span>
    );
  }
  return null;
}

export default function KanbanPage() {
  const { tenantId, queueId } = useParams<{ tenantId: string; queueId: string }>();

  const [maxAttempts, setMaxAttempts] = useState<number>(0);
  const [queueName, setQueueName] = useState<string>("");
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanding, setExpanding] = useState<Record<number, boolean>>({});
  const [userRole, setUserRole] = useState<string>("member");

  const [drawerCall, setDrawerCall] = useState<CallDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Filters (client-side)
  const [minDuration, setMinDuration] = useState<string>("");
  const [maxDuration, setMaxDuration] = useState<string>("");
  const [filterReasons, setFilterReasons] = useState<string[]>([]);
  const [filterInteresses, setFilterInteresses] = useState<string[]>([]);

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

  const loadKanban = useCallback(async (showRefresh = false) => {
    setError(null);
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues/${queueId}/kanban?limit=${PAGE_SIZE}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Falha ao carregar Kanban");
        return;
      }
      const data = (await res.json()) as KanbanResponse;
      setMaxAttempts(data.maxAttempts);
      setQueueName(data.queueName);
      setColumns(data.columns);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, queueId]);

  useEffect(() => { loadKanban(); }, [loadKanban]);

  async function expandColumn(colIndex: number) {
    const col = columns.find((c) => c.index === colIndex);
    if (!col) return;
    setExpanding((prev) => ({ ...prev, [colIndex]: true }));
    try {
      const offset = col.leads.length;
      const res = await fetch(
        `/api/tenants/${tenantId}/queues/${queueId}/kanban?column=${colIndex}&offset=${offset}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as ExpandResponse;
      setColumns((prev) => prev.map((c) =>
        c.index === colIndex
          ? { ...c, leads: [...c.leads, ...data.column.leads], total: data.column.total }
          : c
      ));
    } finally {
      setExpanding((prev) => ({ ...prev, [colIndex]: false }));
    }
  }

  async function openCardDrawer(card: KanbanCard) {
    if (!card.last_call) return;
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/calls/${card.last_call.id}`);
      const data = await res.json();
      setDrawerCall(data.call ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  // Unique reasons + interesse values across all loaded cards (for filter options)
  const allCards: KanbanCard[] = useMemo(
    () => columns.flatMap((c) => c.leads),
    [columns]
  );

  const dynamicReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of allCards) {
      const r = c.last_call?.ended_reason;
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => getReasonLabel(a[0]).localeCompare(getReasonLabel(b[0]), "pt-BR"));
  }, [allCards]);

  const dynamicInteresses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of allCards) {
      const v = c.last_call?.interesse;
      if (v && typeof v === "string" && v.trim() !== "") {
        counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [allCards]);

  const minDur = minDuration === "" ? null : Number(minDuration);
  const maxDur = maxDuration === "" ? null : Number(maxDuration);

  const passesFilters = useCallback((card: KanbanCard) => {
    // Duration range
    if (minDur !== null || maxDur !== null) {
      const d = card.last_call?.duration_seconds;
      if (d == null) return false;
      if (minDur !== null && d < minDur) return false;
      if (maxDur !== null && d > maxDur) return false;
    }
    // Motivos
    if (filterReasons.length > 0) {
      const r = card.last_call?.ended_reason;
      if (!r || !filterReasons.includes(r)) return false;
    }
    // Critérios de sucesso
    if (filterInteresses.length > 0) {
      const v = card.last_call?.interesse;
      if (!v || !filterInteresses.includes(v)) return false;
    }
    return true;
  }, [minDur, maxDur, filterReasons, filterInteresses]);

  const hasActiveFilters =
    minDuration !== "" || maxDuration !== "" || filterReasons.length > 0 || filterInteresses.length > 0;

  const filteredColumns = useMemo(
    () => columns.map((col) => ({
      ...col,
      leads: hasActiveFilters ? col.leads.filter(passesFilters) : col.leads,
    })),
    [columns, hasActiveFilters, passesFilters]
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link
            href={`/app/tenants/${tenantId}/queues`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 8, textDecoration: 'none' }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} /> Voltar para campanhas
          </Link>
          <h1 className="page-title">Kanban de Cadência</h1>
          <p className="page-subtitle">
            {queueName && <><strong>{queueName}</strong> · </>}
            {maxAttempts > 0 && `${maxAttempts} tentativas configuradas`}
          </p>
        </div>
        <button
          onClick={() => loadKanban(true)}
          className="btn btn-secondary"
          disabled={refreshing || loading}
        >
          <RefreshCw style={{ width: 16, height: 16, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="alert-error" style={{ marginBottom: 16 }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* Filters */}
      {!loading && allCards.length > 0 && (
        <div className="gc" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Filter style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }} />

            {/* Duration range */}
            <FilterDropdownShell
              icon={<Timer style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
              active={minDuration !== "" || maxDuration !== ""}
              minWidth={200}
              panelMinWidth={240}
              buttonLabel={
                minDuration === "" && maxDuration === "" ? "Duração"
                : `${minDuration || "0"}s – ${maxDuration || "∞"}`
              }
            >
              {(close) => (
                <div style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Intervalo de duração (segundos)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="mín"
                      className="form-input"
                      style={{ width: 90, fontSize: 12 }}
                      value={minDuration}
                      onChange={(e) => setMinDuration(e.target.value)}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="máx"
                      className="form-input"
                      style={{ width: 90, fontSize: 12 }}
                      value={maxDuration}
                      onChange={(e) => setMaxDuration(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setMinDuration(""); setMaxDuration(""); }}
                      className="cx-filter-btn"
                      style={{ fontSize: 11, flex: 1, justifyContent: 'center' }}
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="btn btn-primary"
                      style={{ fontSize: 11, flex: 1, padding: '6px 10px' }}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </FilterDropdownShell>

            {/* Motivos de encerramento */}
            <FilterDropdownShell
              icon={<AlertOctagon style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
              active={filterReasons.length > 0}
              minWidth={220}
              buttonLabel={
                filterReasons.length === 0 ? "Motivos de encerramento"
                : filterReasons.length === 1 ? getReasonLabel(filterReasons[0])
                : `${filterReasons.length} motivos`
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
                      {dynamicReasons.map(([reason, count]) => (
                        <FilterCheckItem
                          key={reason}
                          checked={filterReasons.includes(reason)}
                          onToggle={() => setFilterReasons((prev) =>
                            prev.includes(reason) ? prev.filter((x) => x !== reason) : [...prev, reason]
                          )}
                          label={getReasonLabel(reason)}
                          count={count}
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

            {/* Critérios de sucesso */}
            <FilterDropdownShell
              icon={<Target style={{ width: 14, height: 14, color: 'var(--text-3)' }} />}
              active={filterInteresses.length > 0}
              minWidth={200}
              buttonLabel={
                filterInteresses.length === 0 ? "Critérios de sucesso"
                : filterInteresses.length === 1 ? filterInteresses[0]
                : `${filterInteresses.length} critérios`
              }
            >
              {() => (
                <>
                  {dynamicInteresses.length === 0 ? (
                    <p style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                      Nenhum critério disponível
                    </p>
                  ) : (
                    <>
                      {dynamicInteresses.map(([v, count]) => (
                        <FilterCheckItem
                          key={v}
                          checked={filterInteresses.includes(v)}
                          onToggle={() => setFilterInteresses((prev) =>
                            prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
                          )}
                          label={v}
                          count={count}
                        />
                      ))}
                      {filterInteresses.length > 0 && (
                        <FilterClearFooter onClear={() => setFilterInteresses([])} />
                      )}
                    </>
                  )}
                </>
              )}
            </FilterDropdownShell>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setMinDuration(""); setMaxDuration("");
                  setFilterReasons([]); setFilterInteresses([]);
                }}
                style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <X style={{ width: 14, height: 14 }} /> Limpar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Kanban board */}
      {loading ? (
        <div className="gc" style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Loader2 style={{ width: 18, height: 18, color: 'var(--red)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Carregando leads...</span>
        </div>
      ) : columns.length === 0 ? (
        <div className="gc" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum lead nesta campanha.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 14,
            overflowX: 'auto',
            paddingBottom: 14,
          }}
        >
          {filteredColumns.map((col) => {
            const isLoadingMore = expanding[col.index] ?? false;
            const canLoadMore = col.leads.length < col.total && !hasActiveFilters;
            return (
              <div
                key={col.index}
                className="gc"
                style={{
                  minWidth: 300,
                  width: 300,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: 'calc(100vh - 220px)',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    background: col.index === 0 ? 'rgba(255,255,255,0.02)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {col.index === 0 ? <Clock style={{ width: 14, height: 14, color: 'var(--text-3)' }} /> :
                     col.index === 1 ? <Phone style={{ width: 14, height: 14, color: 'var(--text-3)' }} /> :
                     col.index === 2 ? <XCircle style={{ width: 14, height: 14, color: 'var(--text-3)' }} /> :
                     col.index === 3 ? <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--green)' }} /> :
                     <AlertCircle style={{ width: 14, height: 14, color: 'var(--red)' }} />}
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {col.label}
                    </h3>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-2)',
                      background: 'var(--glass-bg)',
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--glass-border)',
                    }}
                  >
                    {col.total}
                  </span>
                </div>

                {/* Cards */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {col.leads.length === 0 ? (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>
                      Vazio
                    </p>
                  ) : (
                    col.leads.map((card) => {
                      const tone = getCardTone(card);
                      const reason = card.last_call ? getReasonInfo(card.last_call.ended_reason) : null;
                      const clickable = !!card.last_call;
                      return (
                        <button
                          key={card.lead_id}
                          type="button"
                          onClick={() => clickable && openCardDrawer(card)}
                          disabled={!clickable}
                          style={{
                            ...toneStyles(tone),
                            borderRadius: 10,
                            borderTop: '1px solid var(--glass-border)',
                            borderRight: '1px solid var(--glass-border)',
                            borderBottom: '1px solid var(--glass-border)',
                            padding: '10px 12px',
                            textAlign: 'left',
                            cursor: clickable ? 'pointer' : 'default',
                            transition: 'transform .12s, box-shadow .12s',
                            opacity: clickable ? 1 : 0.85,
                          }}
                          onMouseEnter={(e) => {
                            if (clickable) {
                              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'none';
                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                          }}
                        >
                          {/* Header row: phone + score */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                            <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formatPhone(card.phone)}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {card.attempt_count > 0 && (
                                <span className="mono" title="Número de tentativas realizadas" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '2px 6px', borderRadius: 999, lineHeight: 1.2 }}>
                                  {card.attempt_count} tent.
                                </span>
                              )}
                              {card.last_call?.score != null && (
                                <span className="mono" title="Score da ligação" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', padding: '2px 6px', borderRadius: 999, lineHeight: 1.2 }}>
                                  ★ {card.last_call.score}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Name */}
                          {card.name && (
                            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {card.name}
                            </div>
                          )}
                          {/* Reason */}
                          {reason && card.last_call && (
                            <div style={{ marginTop: 6 }}>
                              <span className={`badge ${reason.badge}`} style={{ fontSize: 10 }}>{reason.label}</span>
                            </div>
                          )}
                          {/* Footer: duration + tone badge */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                            {card.last_call?.duration_seconds != null ? (
                              <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Timer style={{ width: 10, height: 10 }} />
                                {formatDuration(card.last_call.duration_seconds)}
                              </span>
                            ) : <span />}
                            <ToneBadge tone={tone} />
                          </div>
                        </button>
                      );
                    })
                  )}

                  {/* Load more */}
                  {canLoadMore && (
                    <button
                      type="button"
                      onClick={() => expandColumn(col.index)}
                      disabled={isLoadingMore}
                      className="cx-filter-btn"
                      style={{ fontSize: 11, justifyContent: 'center', marginTop: 4 }}
                    >
                      {isLoadingMore ? (
                        <><Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> Carregando...</>
                      ) : (
                        <><ChevronDown style={{ width: 12, height: 12 }} /> Ver mais ({Math.min(PAGE_SIZE, col.total - col.leads.length)} de {col.total - col.leads.length})</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      <CallDetailDrawer
        call={drawerCall}
        onClose={() => setDrawerCall(null)}
        isAdminOrOwner={isAdminOrOwner}
      />

      {drawerLoading && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 60, background: 'var(--glass-bg-2)', padding: '10px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--glass-border)' }}>
          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12 }}>Carregando detalhe...</span>
        </div>
      )}
    </div>
  );
}
