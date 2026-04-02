"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Search, X, ChevronDown, ChevronRight, Phone, Clock, DollarSign,
  RefreshCw, Play, FileText, AlertCircle, Check, ExternalLink,
  ListPlus, ChevronLeft, Mic, Filter, ArrowUpDown,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */
type EndedReason =
  | "customer-ended" | "assistant-ended" | "voicemail"
  | "no-answer" | "busy" | "failed" | "silence-timed-out"
  | "pipeline-error" | string;

interface CallRecord {
  id: string;
  createdAt: string;
  phone: string;
  duration: number | null;      // seconds
  cost: number | null;          // USD
  endedReason: EndedReason;
  success: boolean | null;
  transcript: string | null;
  audioUrl: string | null;
  structuredOutputs: Record<string, unknown> | null;
}

interface ApiResponse {
  calls: CallRecord[];
  total: number;
  role: "owner" | "admin" | "member";
}

/* ── Constants ──────────────────────────────────────────────────────── */
const ENDED_REASON_LABELS: Record<string, string> = {
  "customer-ended":  "Cliente encerrou",
  "assistant-ended": "Assistente encerrou",
  "voicemail":       "Voicemail",
  "no-answer":       "Não atendeu",
  "busy":            "Ocupado",
  "failed":          "Falhou",
  "silence-timed-out": "Silêncio",
  "pipeline-error":  "Erro de pipeline",
};

const ENDED_REASON_COLORS: Record<string, string> = {
  "customer-ended":  "var(--green)",
  "assistant-ended": "var(--cyan)",
  "voicemail":       "var(--yellow)",
  "no-answer":       "#888",
  "busy":            "var(--yellow)",
  "failed":          "var(--red)",
  "silence-timed-out": "var(--purple)",
  "pipeline-error":  "#666",
};

const ENDED_REASON_BG: Record<string, string> = {
  "customer-ended":  "rgba(0,230,118,0.12)",
  "assistant-ended": "rgba(0,210,255,0.12)",
  "voicemail":       "rgba(255,184,0,0.12)",
  "no-answer":       "rgba(120,120,140,0.12)",
  "busy":            "rgba(255,184,0,0.12)",
  "failed":          "rgba(255,21,55,0.12)",
  "silence-timed-out": "rgba(160,60,255,0.12)",
  "pipeline-error":  "rgba(80,80,80,0.12)",
};

const PER_PAGE_OPTIONS = [15, 50, 100];
const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Mais recentes" },
  { value: "createdAt_asc",  label: "Mais antigas" },
  { value: "duration_desc",  label: "Duração (maior)" },
  { value: "duration_asc",   label: "Duração (menor)" },
  { value: "cost_desc",      label: "Custo (maior)" },
  { value: "cost_asc",       label: "Custo (menor)" },
];
const ENDED_REASON_OPTIONS = [
  "customer-ended", "assistant-ended", "voicemail",
  "no-answer", "busy", "failed", "silence-timed-out", "pipeline-error",
];
const PERIOD_OPTIONS = [
  { value: "",       label: "Todos os períodos" },
  { value: "today",  label: "Hoje" },
  { value: "week",   label: "Esta semana" },
  { value: "month",  label: "Este mês" },
  { value: "custom", label: "Personalizado" },
];

/* ── Helpers ────────────────────────────────────────────────────────── */
function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtCost(usd: number | null): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(4)}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function EndedReasonBadge({ reason }: { reason: string }) {
  const label = ENDED_REASON_LABELS[reason] ?? reason;
  const color = ENDED_REASON_COLORS[reason] ?? "var(--text-3)";
  const bg    = ENDED_REASON_BG[reason]     ?? "rgba(80,80,80,0.12)";
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px",
      borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 600,
      background: bg, color, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function SuccessBadge({ success }: { success: boolean | null }) {
  if (success === null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 600,
      background: success ? "rgba(0,230,118,0.12)" : "rgba(255,21,55,0.12)",
      color: success ? "var(--green)" : "var(--red)",
    }}>
      {success ? <Check size={10} /> : <X size={10} />}
      {success ? "Sucesso" : "Sem sucesso"}
    </span>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */
export default function CallsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  /* filter state */
  const [search, setSearch]               = useState("");
  const [endedReason, setEndedReason]     = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [period, setPeriod]               = useState("");
  const [sortKey, setSortKey]             = useState("createdAt_desc");

  /* pagination */
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(15);

  /* data */
  const [calls, setCalls]     = useState<CallRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [role, setRole]       = useState<"owner" | "admin" | "member">("member");
  const [loading, setLoading] = useState(false);
  const showCost = role === "owner" || role === "admin";

  /* drawer */
  const [selectedCall, setSelectedCall]     = useState<CallRecord | null>(null);
  const [drawerOpen, setDrawerOpen]         = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [outputsOpen, setOutputsOpen]       = useState(true);

  /* retrabalho */
  const [creatingRetrabalho, setCreatingRetrabalho] = useState(false);

  /* toast */
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: "success" | "error" }[]>([]);

  function toast(msg: string, type: "success" | "error" = "success") {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  }

  /* ── Load Calls ── */
  const loadCalls = useCallback(async () => {
    setLoading(true);
    try {
      const [sortBy, sortDir] = sortKey.split("_");
      const params = new URLSearchParams({
        page: String(page), limit: String(limit),
        sortBy, sortDir,
      });
      if (search.trim())  params.set("search", search.trim());
      if (endedReason)    params.set("endedReason", endedReason);
      if (successFilter)  params.set("success", successFilter);
      if (period && period !== "custom") params.set("period", period);
      const res = await fetch(`/api/tenants/${tenantId}/calls?${params}`);
      const data: ApiResponse = await res.json();
      setCalls(data.calls ?? []);
      setTotal(data.total ?? 0);
      setRole(data.role ?? "member");
    } catch { toast("Erro ao carregar chamadas", "error"); }
    finally { setLoading(false); }
  }, [tenantId, page, limit, sortKey, search, endedReason, successFilter, period]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  /* reset to page 1 on filter change */
  useEffect(() => { setPage(1); }, [search, endedReason, successFilter, period, sortKey, limit]);

  /* ── Retrabalho ── */
  async function createRetrabalho() {
    if (!confirm("Criar lista de retrabalho com chamadas curtas (< 30s) sem sucesso?")) return;
    setCreatingRetrabalho(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/leads/retrabalho`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedReason: "no-answer", maxDuration: 30 }),
      });
      if (res.ok) toast("Lista de retrabalho criada!");
      else toast("Erro ao criar lista de retrabalho", "error");
    } finally { setCreatingRetrabalho(false); }
  }

  const totalPages = Math.ceil(total / limit);

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* ── Filter strip ──────────────────────────────────────── */}
      <div className="gc" style={{ borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
          <input
            type="text" placeholder="Buscar por telefone ou ID..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)", color: "var(--text-1)", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Ended Reason */}
        <select className="cx-select" value={endedReason} onChange={e => setEndedReason(e.target.value)}>
          <option value="">Todos os motivos</option>
          {ENDED_REASON_OPTIONS.map(r => (
            <option key={r} value={r}>{ENDED_REASON_LABELS[r] ?? r}</option>
          ))}
        </select>

        {/* Success */}
        <select className="cx-select" value={successFilter} onChange={e => setSuccessFilter(e.target.value)}>
          <option value="">Qualquer status</option>
          <option value="true">Sucesso</option>
          <option value="false">Sem sucesso</option>
        </select>

        {/* Period */}
        <select className="cx-select" value={period} onChange={e => setPeriod(e.target.value)}>
          {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Sort */}
        <select className="cx-select" value={sortKey} onChange={e => setSortKey(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <button onClick={loadCalls} className="cx-filter-btn" title="Atualizar"><RefreshCw size={13} /></button>

        <button onClick={createRetrabalho} disabled={creatingRetrabalho} className="cx-filter-btn" style={{ gap: 6, whiteSpace: "nowrap" }}>
          <ListPlus size={13} />
          {creatingRetrabalho ? "Criando..." : "Criar retrabalho"}
        </button>
      </div>

      {/* ── Table + Drawer wrapper ────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", gap: 0 }}>

        {/* Table */}
        <div className="gc" style={{ flex: 1, borderRadius: "var(--radius)", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div className="cx-spinner" />
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>Carregando chamadas...</span>
            </div>
          ) : calls.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-3)" }}>
              <Phone size={36} style={{ opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>Nenhuma chamada encontrada</p>
              <p style={{ margin: 0, fontSize: 13 }}>Ajuste os filtros ou aguarde novas chamadas.</p>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--glass-border)", position: "sticky", top: 0, background: "var(--glass-bg)", zIndex: 2 }}>
                      {[
                        "Data / Hora", "Telefone", "Duração",
                        ...(showCost ? ["Custo"] : []),
                        "Motivo", "Sucesso", "Ações",
                      ].map(col => (
                        <th key={col} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call, i) => (
                      <tr
                        key={call.id}
                        onClick={() => { setSelectedCall(call); setDrawerOpen(true); setTranscriptOpen(false); setOutputsOpen(true); }}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          background: selectedCall?.id === call.id
                            ? "rgba(255,21,55,0.06)"
                            : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                          cursor: "pointer", transition: "background .12s",
                        }}
                      >
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-2)" }}>
                            {fmtDateTime(call.createdAt)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 5 }}>
                            <Phone size={11} style={{ color: "var(--text-3)" }} />
                            {call.phone}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 5 }}>
                            <Clock size={11} style={{ color: "var(--text-3)" }} />
                            {fmtDuration(call.duration)}
                          </span>
                        </td>
                        {showCost && (
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: call.cost && call.cost > 0 ? "var(--yellow)" : "var(--text-3)" }}>
                              {fmtCost(call.cost)}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: "10px 14px" }}>
                          <EndedReasonBadge reason={call.endedReason} />
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <SuccessBadge success={call.success} />
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedCall(call); setDrawerOpen(true); }}
                            className="cx-filter-btn"
                            style={{ padding: "4px 10px", fontSize: 11, gap: 5 }}
                            title="Ver detalhes"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderTop: "1px solid var(--glass-border)", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>Por página:</span>
                  {PER_PAGE_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setLimit(n)}
                      style={{
                        fontFamily: "JetBrains Mono, monospace", fontSize: 11,
                        padding: "3px 9px", borderRadius: "var(--radius-sm)",
                        border: `1px solid ${limit === n ? "var(--red)" : "var(--glass-border)"}`,
                        background: limit === n ? "rgba(255,21,55,0.12)" : "var(--glass-bg-2)",
                        color: limit === n ? "var(--red)" : "var(--text-3)",
                        cursor: "pointer", transition: "all .15s",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace", marginLeft: 6 }}>
                    {total.toLocaleString("pt-BR")} total
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="cx-filter-btn" style={{ padding: "4px 10px", fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>
                    <ChevronLeft size={13} />
                  </button>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "JetBrains Mono, monospace" }}>
                    {page} / {totalPages || 1}
                  </span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="cx-filter-btn" style={{ padding: "4px 10px", fontSize: 12, opacity: page >= totalPages ? 0.4 : 1 }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT DRAWER ─────────────────────────────────────── */}
        <div style={{
          position: "fixed", right: 0, top: 0, bottom: 0,
          width: drawerOpen ? 420 : 0,
          transition: "width .25s ease",
          overflow: "hidden", zIndex: 50,
        }}>
          {drawerOpen && selectedCall && (
            <div style={{
              width: 420, height: "100%", overflowY: "auto",
              background: "rgba(12,12,16,0.97)", backdropFilter: "blur(20px)",
              borderLeft: "1px solid var(--glass-border)",
              display: "flex", flexDirection: "column",
            }}>
              {/* Drawer header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Detalhes da Chamada</p>
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>
                    {selectedCall.id}
                  </p>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 6 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Drawer body */}
              <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* KPIs row */}
                <div style={{ display: "grid", gridTemplateColumns: showCost ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                  <DrawerKpi icon={<Phone size={14} />} label="Telefone" value={selectedCall.phone} mono />
                  <DrawerKpi icon={<Clock size={14} />} label="Duração" value={fmtDuration(selectedCall.duration)} mono />
                  {showCost && <DrawerKpi icon={<DollarSign size={14} />} label="Custo" value={fmtCost(selectedCall.cost)} mono accent="var(--yellow)" />}
                </div>

                {/* Status row */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <DrawerLabel>Motivo de encerramento</DrawerLabel>
                  <EndedReasonBadge reason={selectedCall.endedReason} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <DrawerLabel>Status de sucesso</DrawerLabel>
                  <SuccessBadge success={selectedCall.success} />
                </div>

                <div>
                  <DrawerLabel>Data e hora</DrawerLabel>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-2)" }}>
                    {fmtDateTime(selectedCall.createdAt)}
                  </span>
                </div>

                {/* Audio */}
                {selectedCall.audioUrl && (
                  <div>
                    <DrawerLabel>Áudio</DrawerLabel>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <a
                        href={selectedCall.audioUrl} target="_blank" rel="noreferrer"
                        className="cx-filter-btn"
                        style={{ gap: 6, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                      >
                        <Play size={12} /> Ouvir
                      </a>
                      <a
                        href={selectedCall.audioUrl} download
                        className="cx-filter-btn"
                        style={{ gap: 6, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                      >
                        <ExternalLink size={12} /> Download
                      </a>
                    </div>
                  </div>
                )}

                {/* Structured Outputs */}
                {selectedCall.structuredOutputs && Object.keys(selectedCall.structuredOutputs).length > 0 && (
                  <div>
                    <button
                      onClick={() => setOutputsOpen(v => !v)}
                      style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 8px", color: "var(--text-2)" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={13} style={{ color: "var(--cyan)" }} /> Saídas estruturadas
                      </span>
                      <ChevronDown size={13} style={{ transform: outputsOpen ? "rotate(180deg)" : "none", transition: "transform .2s", color: "var(--text-3)" }} />
                    </button>
                    {outputsOpen && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {Object.entries(selectedCall.structuredOutputs).map(([key, val]) => {
                          const strVal = typeof val === "string" ? val : JSON.stringify(val);
                          const isLong = strVal.length > 60;
                          return (
                            <div key={key} style={{ display: "flex", flexDirection: isLong ? "column" : "row", gap: isLong ? 4 : 10, alignItems: isLong ? "flex-start" : "center" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", minWidth: isLong ? undefined : 100 }}>
                                {key}
                              </span>
                              {isLong ? (
                                <div style={{ background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 12, color: "var(--text-1)", lineHeight: 1.6, width: "100%", boxSizing: "border-box" }}>
                                  {strVal}
                                </div>
                              ) : (
                                <span style={{
                                  fontSize: 12, fontWeight: 600,
                                  padding: "2px 10px", borderRadius: "var(--radius-sm)",
                                  background: "var(--glass-bg-2)", color: "var(--cyan)",
                                  border: "1px solid var(--glass-border)",
                                }}>
                                  {strVal}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <button
                      onClick={() => setTranscriptOpen(v => !v)}
                      style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 8px", color: "var(--text-2)" }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        <Mic size={13} style={{ color: "var(--purple)" }} /> Transcrição
                      </span>
                      <ChevronDown size={13} style={{ transform: transcriptOpen ? "rotate(180deg)" : "none", transition: "transform .2s", color: "var(--text-3)" }} />
                    </button>
                    {transcriptOpen && (
                      <div style={{
                        background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-sm)", padding: "12px 14px",
                        fontSize: 12, color: "var(--text-2)", lineHeight: 1.7,
                        maxHeight: 320, overflowY: "auto",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {selectedCall.transcript}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ TOASTS ══════════════════════════════════════════════════ */}
      <div className="cx-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`cx-toast cx-toast-${t.type}`}>
            {t.type === "success"
              ? <Check size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
              : <AlertCircle size={13} style={{ color: "var(--red)", flexShrink: 0 }} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */
function DrawerKpi({ icon, label, value, mono, accent }: {
  icon: React.ReactNode; label: string; value: string;
  mono?: boolean; accent?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid var(--glass-border)",
      borderRadius: "var(--radius-sm)", padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {icon} {label}
      </div>
      <span style={{ fontFamily: mono ? "JetBrains Mono, monospace" : "inherit", fontSize: 13, fontWeight: 600, color: accent ?? "var(--text-1)" }}>
        {value}
      </span>
    </div>
  );
}

function DrawerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}
    </div>
  );
}
