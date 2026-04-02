"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, Pencil, Check, X, Upload, Search, Copy, ChevronDown,
  ChevronRight, FileText, Phone, Building2, User, RefreshCw, Webhook,
  ListPlus, AlertCircle, ArrowUpDown, MoreHorizontal, Download,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */
interface LeadList { id: string; name: string; leadsCount: number; }

type LeadStatus =
  | "new" | "queued" | "calling" | "completed"
  | "failed" | "do-not-call" | "callback";

interface Lead {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  status: LeadStatus;
  attempts: number;
  nextAttempt: string | null;
  customFields?: Record<string, string>;
}

interface WebhookInfo { webhookUrl: string; secret: string; }

type CsvStep = "upload" | "mapping" | "confirm";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Novo",
  queued: "Na fila",
  calling: "Ligando",
  completed: "Concluído",
  failed: "Falhou",
  "do-not-call": "Não ligar",
  callback: "Callback",
};

const STATUS_COLORS: Record<LeadStatus, { bg: string; color: string; pulse?: boolean }> = {
  new:           { bg: "rgba(0,210,255,0.13)", color: "var(--cyan)" },
  queued:        { bg: "rgba(255,184,0,0.13)",  color: "var(--yellow)" },
  calling:       { bg: "rgba(255,21,55,0.18)",  color: "var(--red)", pulse: true },
  completed:     { bg: "rgba(0,230,118,0.13)",  color: "var(--green)" },
  failed:        { bg: "rgba(255,21,55,0.13)",  color: "var(--red)" },
  "do-not-call": { bg: "rgba(120,120,140,0.15)", color: "#888" },
  callback:      { bg: "rgba(160,60,255,0.13)", color: "var(--purple)" },
};

/* ── Helpers ────────────────────────────────────────────────────────── */
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_COLORS[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 10px", borderRadius: "var(--radius-sm)",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.03em",
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.pulse && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: cfg.color, display: "inline-block",
          animation: "cx-pulse 1.2s infinite",
        }} />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */
export default function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

  /* lists state */
  const [lists, setLists] = useState<LeadList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listsLoading, setListsLoading] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);

  /* leads state */
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [leadsLoading, setLeadsLoading] = useState(false);
  const LIMIT = 50;

  /* add lead modal */
  const [showAddLead, setShowAddLead] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [addingLead, setAddingLead] = useState(false);

  /* CSV import */
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvStep, setCsvStep] = useState<CsvStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* webhook */
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [webhookExpanded, setWebhookExpanded] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  /* toast */
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: "success" | "error" }[]>([]);

  function toast(msg: string, type: "success" | "error" = "success") {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  }

  /* ── Load Lists ── */
  const loadLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/lead-lists`);
      const data = await res.json();
      if (data.lists) {
        setLists(data.lists);
        if (!activeListId && data.lists.length > 0) setActiveListId(data.lists[0].id);
      }
    } catch { toast("Erro ao carregar listas", "error"); }
    finally { setListsLoading(false); }
  }, [tenantId, activeListId]);

  /* ── Load Leads ── */
  const loadLeads = useCallback(async () => {
    if (!activeListId) return;
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams({
        listId: activeListId, page: String(page), limit: String(LIMIT),
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/tenants/${tenantId}/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch { toast("Erro ao carregar leads", "error"); }
    finally { setLeadsLoading(false); }
  }, [tenantId, activeListId, page, search]);

  /* ── Load Webhook ── */
  const loadWebhook = useCallback(async () => {
    if (!activeListId) return;
    setWebhookLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/webhooks?listId=${activeListId}`);
      const data = await res.json();
      setWebhookInfo(data.webhookUrl ? data : null);
    } catch { /* silent */ }
    finally { setWebhookLoading(false); }
  }, [tenantId, activeListId]);

  useEffect(() => { loadLists(); }, [tenantId]);
  useEffect(() => { loadLeads(); }, [activeListId, page, search]);
  useEffect(() => { if (webhookExpanded) loadWebhook(); }, [webhookExpanded, activeListId]);

  /* ── List CRUD ── */
  async function createList() {
    if (!newListName.trim()) return;
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    const data = await res.json();
    if (data.list) {
      setLists(p => [...p, data.list]);
      setActiveListId(data.list.id);
      setNewListName(""); setShowNewList(false);
      toast("Lista criada!");
    } else { toast("Erro ao criar lista", "error"); }
  }

  async function renameList(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists?listId=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue }),
    });
    if (res.ok) {
      setLists(p => p.map(l => l.id === id ? { ...l, name: renameValue } : l));
      toast("Lista renomeada!");
    } else { toast("Erro ao renomear lista", "error"); }
    setRenamingId(null);
  }

  async function deleteList(id: string) {
    if (!confirm("Excluir esta lista e todos os leads? Esta ação não pode ser desfeita.")) return;
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists?listId=${id}`, { method: "DELETE" });
    if (res.ok) {
      const next = lists.filter(l => l.id !== id);
      setLists(next);
      if (activeListId === id) setActiveListId(next[0]?.id ?? null);
      toast("Lista excluída!");
    } else { toast("Erro ao excluir lista", "error"); }
  }

  /* ── Add Lead ── */
  async function addLead() {
    if (!newPhone.trim() || !activeListId) return;
    setAddingLead(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: activeListId, phone: newPhone, name: newName, company: newCompany }),
      });
      if (res.ok) {
        toast("Lead adicionado!");
        setShowAddLead(false);
        setNewPhone(""); setNewName(""); setNewCompany("");
        loadLeads();
      } else { toast("Erro ao adicionar lead", "error"); }
    } finally { setAddingLead(false); }
  }

  /* ── Delete Lead ── */
  async function deleteLead(leadId: string) {
    if (!confirm("Remover este lead?")) return;
    const res = await fetch(`/api/tenants/${tenantId}/leads?leadId=${leadId}`, { method: "DELETE" });
    if (res.ok) { toast("Lead removido!"); loadLeads(); }
    else toast("Erro ao remover lead", "error");
  }

  /* ── CSV Helpers ── */
  function parseCSV(text: string): string[][] {
    return text.trim().split("\n").map(row => {
      const cells: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
        else { cur += c; }
      }
      cells.push(cur.trim());
      return cells;
    });
  }

  function handleCsvFile(file: File) {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast("CSV vazio ou inválido", "error"); return; }
      const [header, ...body] = rows;
      setCsvHeaders(header);
      setCsvRawRows(body);
      const autoMap: Record<string, string> = {};
      const phoneKeys = ["phone", "telefone", "fone", "celular", "numero"];
      const nameKeys  = ["nome", "name", "contato"];
      const compKeys  = ["empresa", "company", "organização", "org"];
      header.forEach((h, i) => {
        const hl = h.toLowerCase();
        if (phoneKeys.some(k => hl.includes(k))) autoMap[String(i)] = "phone";
        else if (nameKeys.some(k => hl.includes(k))) autoMap[String(i)] = "name";
        else if (compKeys.some(k => hl.includes(k))) autoMap[String(i)] = "company";
      });
      setCsvMapping(autoMap);
      setCsvStep("mapping");
    };
    reader.readAsText(file);
  }

  async function importCSV() {
    if (!activeListId) return;
    setCsvImporting(true);
    const phoneIdx = Object.entries(csvMapping).find(([, v]) => v === "phone")?.[0];
    if (!phoneIdx) { toast("Mapeie a coluna de telefone", "error"); setCsvImporting(false); return; }
    const rows = csvRawRows.map(row => {
      const obj: Record<string, string> = {};
      Object.entries(csvMapping).forEach(([i, field]) => { obj[field] = row[Number(i)] ?? ""; });
      return obj;
    }).filter(r => r.phone);
    const res = await fetch(`/api/tenants/${tenantId}/leads/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: activeListId, rows }),
    });
    setCsvImporting(false);
    if (res.ok) {
      toast(`${rows.length} leads importados!`);
      setShowCsvModal(false); setCsvStep("upload"); setCsvFile(null);
      setCsvRawRows([]); setCsvHeaders([]); setCsvMapping({});
      loadLeads(); loadLists();
    } else { toast("Erro ao importar CSV", "error"); }
  }

  /* ── Copy helper ── */
  async function copyText(text: string, setter: (v: boolean) => void) {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  }

  const activeList = lists.find(l => l.id === activeListId);
  const totalPages = Math.ceil(total / LIMIT);

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", height: "100%", gap: 0, overflow: "hidden", position: "relative" }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <aside
        className="gc"
        style={{
          width: leftCollapsed ? 44 : 224,
          minWidth: leftCollapsed ? 44 : 224,
          transition: "width .22s ease, min-width .22s ease",
          display: "flex", flexDirection: "column",
          borderRadius: "var(--radius)", marginRight: 16,
          padding: leftCollapsed ? "12px 6px" : 16,
          overflow: "hidden", flexShrink: 0,
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setLeftCollapsed(v => !v)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-3)", padding: 4, borderRadius: "var(--radius-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            alignSelf: leftCollapsed ? "center" : "flex-end", marginBottom: 8,
          }}
          title={leftCollapsed ? "Expandir painel" : "Recolher painel"}
        >
          <ChevronRight size={15} style={{ transform: leftCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform .2s" }} />
        </button>

        {!leftCollapsed && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Listas
            </div>

            {listsLoading ? (
              <div className="cx-spinner" style={{ margin: "12px auto" }} />
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {lists.map(list => (
                  <div key={list.id}>
                    {renamingId === list.id ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          autoFocus value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") renameList(list.id); if (e.key === "Escape") setRenamingId(null); }}
                          style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius-sm)", background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)", color: "var(--text-1)", outline: "none" }}
                        />
                        <button onClick={() => renameList(list.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", padding: 2 }}><Check size={13} /></button>
                        <button onClick={() => setRenamingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 2 }}><X size={13} /></button>
                      </div>
                    ) : (
                      <div
                        onClick={() => { setActiveListId(list.id); setPage(1); setSearch(""); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", borderRadius: "var(--radius-sm)",
                          cursor: "pointer", fontSize: 13, fontWeight: 500,
                          background: activeListId === list.id ? "rgba(255,21,55,0.12)" : "transparent",
                          color: activeListId === list.id ? "var(--red)" : "var(--text-2)",
                          borderLeft: activeListId === list.id ? "2px solid var(--red)" : "2px solid transparent",
                          transition: "all .15s",
                        }}
                        className="cx-list-item"
                      >
                        <ListPlus size={13} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {list.name}
                        </span>
                        <span style={{
                          fontSize: 10, fontFamily: "JetBrains Mono, monospace",
                          color: activeListId === list.id ? "var(--red)" : "var(--text-3)",
                          background: activeListId === list.id ? "rgba(255,21,55,0.15)" : "var(--glass-bg-2)",
                          borderRadius: "var(--radius-sm)", padding: "1px 5px",
                        }}>
                          {list.leadsCount}
                        </span>
                        <div style={{ display: "flex", gap: 2, marginLeft: 2 }}>
                          <button
                            onClick={e => { e.stopPropagation(); setRenamingId(list.id); setRenameValue(list.name); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 2, opacity: 0.7 }}
                            title="Renomear"
                          ><Pencil size={11} /></button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 2, opacity: 0.7 }}
                            title="Excluir"
                          ><Trash2 size={11} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {lists.length === 0 && !listsLoading && (
                  <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "20px 0" }}>
                    Nenhuma lista ainda.
                  </div>
                )}
              </div>
            )}

            {/* New List */}
            <div style={{ marginTop: 12, borderTop: "1px solid var(--glass-border)", paddingTop: 10 }}>
              {showNewList ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    autoFocus value={newListName} placeholder="Nome da lista"
                    onChange={e => setNewListName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") setShowNewList(false); }}
                    style={{ fontSize: 12, padding: "6px 8px", borderRadius: "var(--radius-sm)", background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)", color: "var(--text-1)", outline: "none", width: "100%", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={createList} className="cx-refresh-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "5px 0" }}>Criar</button>
                    <button onClick={() => { setShowNewList(false); setNewListName(""); }} className="cx-filter-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "5px 0" }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewList(true)}
                  className="cx-filter-btn"
                  style={{ width: "100%", justifyContent: "center", fontSize: 12, gap: 6 }}
                >
                  <Plus size={13} /> Nova lista
                </button>
              )}
            </div>
          </>
        )}

        {leftCollapsed && (
          <button
            onClick={() => setLeftCollapsed(false)}
            title="Nova lista"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4, marginTop: 8, display: "flex", justifyContent: "center" }}
          >
            <ListPlus size={16} />
          </button>
        )}
      </aside>

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
            <input
              type="text" placeholder="Buscar por telefone, nome ou empresa..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{
                width: "100%", boxSizing: "border-box",
                paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-sm)", color: "var(--text-1)", fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Count badge */}
          <span style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 12,
            color: "var(--text-3)", background: "var(--glass-bg-2)",
            border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)",
            padding: "6px 12px", whiteSpace: "nowrap",
          }}>
            {total.toLocaleString("pt-BR")} leads
          </span>

          <button
            onClick={() => loadLeads()}
            className="cx-filter-btn"
            title="Atualizar"
          >
            <RefreshCw size={13} />
          </button>

          <button
            onClick={() => { if (activeListId) { setShowCsvModal(true); setCsvStep("upload"); } else toast("Selecione uma lista primeiro", "error"); }}
            className="cx-filter-btn"
            style={{ gap: 6 }}
          >
            <Upload size={13} /> Importar CSV
          </button>

          <button
            onClick={() => { if (activeListId) setShowAddLead(true); else toast("Selecione uma lista primeiro", "error"); }}
            className="cx-refresh-btn"
            style={{ gap: 6 }}
          >
            <Plus size={14} /> Adicionar Lead
          </button>
        </div>

        {/* Active list name */}
        {activeList && (
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{activeList.name}</span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>#{activeListId?.slice(0, 8)}</span>
          </div>
        )}

        {/* Table */}
        <div className="gc" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: 0, borderRadius: "var(--radius)" }}>
          {leadsLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: 10 }}>
              <div className="cx-spinner" />
              <span style={{ color: "var(--text-3)", fontSize: 13 }}>Carregando leads...</span>
            </div>
          ) : !activeListId ? (
            <EmptyState icon={<ListPlus size={36} />} title="Selecione uma lista" sub="Escolha uma lista no painel à esquerda ou crie uma nova." />
          ) : leads.length === 0 ? (
            <EmptyState icon={<User size={36} />} title="Nenhum lead encontrado" sub={search ? "Tente uma busca diferente." : "Importe um CSV ou adicione leads manualmente."} />
          ) : (
            <>
              <div style={{ overflowX: "auto", flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--glass-border)", position: "sticky", top: 0, background: "var(--glass-bg)", zIndex: 2 }}>
                      {["Telefone", "Nome", "Empresa", "Status", "Tentativas", "Próxima Tentativa", "Ações"].map(col => (
                        <th key={col} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <tr key={lead.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)", transition: "background .12s" }}>
                        <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
                            <Phone size={11} style={{ color: "var(--text-3)" }} /> {lead.phone}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", color: "var(--text-1)" }}>{lead.name ?? <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td style={{ padding: "11px 14px", color: "var(--text-2)" }}>
                          {lead.company ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <Building2 size={11} style={{ color: "var(--text-3)" }} /> {lead.company}
                            </span>
                          ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <StatusBadge status={lead.status} />
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--text-2)" }}>
                            {lead.attempts}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace" }}>
                          {fmtDate(lead.nextAttempt)}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <button
                            onClick={() => deleteLead(lead.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 4, opacity: 0.7, borderRadius: "var(--radius-sm)", transition: "opacity .15s" }}
                            title="Remover lead"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--glass-border)", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>
                    Página {page} de {totalPages}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="cx-filter-btn" style={{ padding: "5px 12px", fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>Anterior</button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="cx-filter-btn" style={{ padding: "5px 12px", fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}>Próxima</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Webhook Section ─────────────────────────────────── */}
        {activeListId && (
          <div className="gc" style={{ marginTop: 12, borderRadius: "var(--radius)", overflow: "hidden" }}>
            <button
              onClick={() => setWebhookExpanded(v => !v)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", color: "var(--text-2)", fontSize: 13, fontWeight: 600 }}
            >
              <Webhook size={14} style={{ color: "var(--cyan)" }} />
              Webhook desta lista
              <ChevronDown size={13} style={{ marginLeft: "auto", transform: webhookExpanded ? "rotate(180deg)" : "none", transition: "transform .2s", color: "var(--text-3)" }} />
            </button>
            {webhookExpanded && (
              <div style={{ padding: "0 16px 14px" }}>
                {webhookLoading ? (
                  <div className="cx-spinner" style={{ margin: "8px 0" }} />
                ) : webhookInfo ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <WebhookField label="URL do Webhook" value={webhookInfo.webhookUrl} copied={copiedUrl} onCopy={() => copyText(webhookInfo.webhookUrl, setCopiedUrl)} />
                    <WebhookField label="Secret" value={webhookInfo.secret} copied={copiedSecret} onCopy={() => copyText(webhookInfo.secret, setCopiedSecret)} mono />
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhum webhook configurado para esta lista.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ ADD LEAD MODAL ══════════════════════════════════════════ */}
      {showAddLead && (
        <Modal title="Adicionar Lead" onClose={() => setShowAddLead(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModalField label="Telefone *">
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+55 11 99999-9999"
                style={{ fontFamily: "JetBrains Mono, monospace" }} />
            </ModalField>
            <ModalField label="Nome">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" />
            </ModalField>
            <ModalField label="Empresa">
              <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Nome da empresa" />
            </ModalField>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={addLead} disabled={addingLead || !newPhone.trim()} className="cx-refresh-btn" style={{ flex: 1, justifyContent: "center" }}>
                {addingLead ? "Adicionando..." : "Adicionar"}
              </button>
              <button onClick={() => setShowAddLead(false)} className="cx-filter-btn" style={{ flex: 1, justifyContent: "center" }}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ CSV IMPORT MODAL ════════════════════════════════════════ */}
      {showCsvModal && (
        <Modal title="Importar CSV" onClose={() => { setShowCsvModal(false); setCsvStep("upload"); setCsvFile(null); }} wide>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--glass-border)" }}>
            {(["upload", "mapping", "confirm"] as CsvStep[]).map((step, i) => {
              const labels = ["1. Upload", "2. Colunas", "3. Confirmar"];
              const isDone = (csvStep === "mapping" && i === 0) || (csvStep === "confirm" && i < 2);
              const isActive = csvStep === step;
              return (
                <div key={step} style={{ flex: 1, padding: "8px 0", textAlign: "center", fontSize: 12, fontWeight: 600, background: isActive ? "var(--red)" : isDone ? "rgba(255,21,55,0.15)" : "var(--glass-bg-2)", color: isActive ? "#fff" : isDone ? "var(--red)" : "var(--text-3)", transition: "all .2s" }}>
                  {labels[i]}
                </div>
              );
            })}
          </div>

          {csvStep === "upload" && (
            <div
              onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
              onDragLeave={() => setCsvDragOver(false)}
              onDrop={e => { e.preventDefault(); setCsvDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${csvDragOver ? "var(--red)" : "var(--glass-border)"}`,
                borderRadius: "var(--radius)", padding: "40px 20px",
                textAlign: "center", cursor: "pointer",
                background: csvDragOver ? "rgba(255,21,55,0.05)" : "var(--glass-bg-2)",
                transition: "all .2s",
              }}
            >
              <Upload size={32} style={{ color: "var(--text-3)", marginBottom: 12 }} />
              <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                Arraste um arquivo CSV ou clique para selecionar
              </p>
              <p style={{ color: "var(--text-3)", fontSize: 12 }}>
                O arquivo deve conter colunas: telefone, nome, empresa
              </p>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleCsvFile(e.target.files[0]); }} />
            </div>
          )}

          {csvStep === "mapping" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                Mapeie as colunas do seu CSV para os campos do sistema.
                Arquivo: <strong style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--cyan)" }}>{csvFile?.name}</strong> — {csvRawRows.length} linhas
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {csvHeaders.map((header, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{header}</label>
                    <select
                      className="cx-select"
                      value={csvMapping[String(i)] ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        setCsvMapping(prev => {
                          const next = { ...prev };
                          if (!val) { delete next[String(i)]; }
                          else {
                            Object.keys(next).forEach(k => { if (next[k] === val) delete next[k]; });
                            next[String(i)] = val;
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="">— ignorar —</option>
                      <option value="phone">Telefone</option>
                      <option value="name">Nome</option>
                      <option value="company">Empresa</option>
                    </select>
                    <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>
                      ex: {csvRawRows[0]?.[i] ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setCsvStep("upload")} className="cx-filter-btn" style={{ flex: 1, justifyContent: "center" }}>Voltar</button>
                <button
                  onClick={() => {
                    if (!Object.values(csvMapping).includes("phone")) { toast("Mapeie a coluna de telefone", "error"); return; }
                    setCsvStep("confirm");
                  }}
                  className="cx-refresh-btn" style={{ flex: 1, justifyContent: "center" }}
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {csvStep === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="gc" style={{ padding: 14, borderRadius: "var(--radius-sm)" }}>
                <p style={{ fontSize: 13, color: "var(--text-1)", marginBottom: 6, fontWeight: 600 }}>Resumo da importação</p>
                <div style={{ display: "flex", gap: 20 }}>
                  <Stat label="Total de linhas" value={String(csvRawRows.length)} />
                  <Stat label="Lista de destino" value={activeList?.name ?? "—"} />
                  <Stat label="Mapeamentos" value={String(Object.keys(csvMapping).length)} />
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                      {Object.entries(csvMapping).map(([i, field]) => (
                        <th key={i} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", fontSize: 10 }}>
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRawRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        {Object.keys(csvMapping).map(i => (
                          <td key={i} style={{ padding: "6px 10px", color: "var(--text-2)", fontFamily: csvMapping[i] === "phone" ? "JetBrains Mono, monospace" : "inherit" }}>
                            {row[Number(i)] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvRawRows.length > 5 && (
                  <p style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginTop: 6 }}>
                    ... e mais {csvRawRows.length - 5} linhas
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCsvStep("mapping")} className="cx-filter-btn" style={{ flex: 1, justifyContent: "center" }}>Voltar</button>
                <button onClick={importCSV} disabled={csvImporting} className="cx-refresh-btn" style={{ flex: 1, justifyContent: "center" }}>
                  {csvImporting ? "Importando..." : `Importar ${csvRawRows.length} leads`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ══ TOASTS ══════════════════════════════════════════════════ */}
      <div className="cx-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`cx-toast cx-toast-${t.type}`}>
            {t.type === "success" ? <Check size={13} style={{ color: "var(--green)", flexShrink: 0 }} /> : <AlertCircle size={13} style={{ color: "var(--red)", flexShrink: 0 }} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes cx-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */
function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-3)", padding: 40 }}>
      <div style={{ opacity: 0.4 }}>{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)", margin: 0 }}>{title}</p>
      <p style={{ fontSize: 13, margin: 0, textAlign: "center" }}>{sub}</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="gc" style={{ width: wide ? 560 : 400, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", borderRadius: "var(--radius)", padding: 24, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
      <div style={{ display: "contents" }}>
        {/* inject base styles via global class applied by parent */}
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </div>
  );
}

function WebhookField({ label, value, copied, onCopy, mono }: { label: string; value: string; copied: boolean; onCopy: () => void; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code style={{ flex: 1, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--cyan)", background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)", padding: "6px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {mono ? "•".repeat(Math.min(value.length, 24)) : value}
        </code>
        <button onClick={onCopy} className="cx-filter-btn" style={{ padding: "5px 10px", gap: 5, fontSize: 11, flexShrink: 0 }}>
          {copied ? <Check size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
