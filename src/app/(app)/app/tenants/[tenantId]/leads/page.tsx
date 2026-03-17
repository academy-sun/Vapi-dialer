"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Upload,
  Users,
  Phone,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Check,
  Download,
  UserPlus,
  Loader2,
} from "lucide-react";

interface LeadList {
  id: string;
  name: string;
  created_at: string;
}

interface Lead {
  id: string;
  phone_e164: string;
  status: string;
  attempt_count: number;
  data_json: Record<string, string>;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  new:               { label: "Novo",       badge: "badge-gray"   },
  queued:            { label: "Na fila",    badge: "badge-blue"   },
  calling:           { label: "Em ligação", badge: "badge-yellow" },
  completed:         { label: "Concluído",  badge: "badge-green"  },
  failed:            { label: "Falhou",     badge: "badge-red"    },
  doNotCall:         { label: "Não ligar",  badge: "badge-gray"   },
  callbackScheduled: { label: "Callback",   badge: "badge-purple" },
};

/* ── Toast ── */
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

/* ── Modal: Criar lista ── */
function CreateListModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await onCreate(name.trim());
    setLoading(false);
    onClose();
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Nova Lista de Leads</h2>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div>
            <label className="form-label">Nome da lista</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Leads Janeiro 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary">
              {loading ? "Criando..." : "Criar Lista"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal: Adicionar lead manualmente ── */
function AddLeadModal({ onClose, onAdd, listName }: {
  onClose: () => void;
  onAdd: (fields: Record<string, string>) => Promise<void>;
  listName: string;
}) {
  const [phone, setPhone]     = useState("");
  const [name, setName]       = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onAdd({ phone, name, company });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar lead");
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adicionar Lead</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Lista: <span className="font-medium text-gray-600">{listName}</span>
            </p>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card-body space-y-4">
          {error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div>
            <label className="form-label flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-500" />
              Telefone <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="tel"
              className="form-input"
              placeholder="+55 (11) 99999-9999  ou  11999990001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Aceita com ou sem{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">+55</code>, com ou sem máscara.
            </p>
          </div>

          <div>
            <label className="form-label">Nome</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: João Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Empresa</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Empresa Ltda"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !phone.trim()} className="btn-primary">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : (
                <><UserPlus className="w-4 h-4" />Adicionar Lead</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function downloadTemplate() {
  const csv = [
    "phone,name,company",
    "+5511999990001,João Silva,Empresa A",
    "+5511999990002,Maria Santos,Empresa B",
    "11988880003,Carlos Lima,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "template_leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════
   Página principal
══════════════════════════════════════════════════════════════ */
export default function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [lists, setLists]                   = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [leads, setLeads]                   = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads]     = useState(false);
  const [importing, setImporting]           = useState(false);
  const [showCreate, setShowCreate]         = useState(false);
  const [showAddLead, setShowAddLead]       = useState(false);
  const [dragOver, setDragOver]             = useState(false);
  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toasts, show: showToast } = useToast();

  useEffect(() => { loadLists(); }, [tenantId]);
  useEffect(() => { if (selectedListId) loadLeads(); }, [selectedListId]);

  async function loadLists() {
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists`);
    const data = await res.json();
    setLists(data.leadLists ?? []);
    if (data.leadLists?.length > 0) setSelectedListId(data.leadLists[0].id);
  }

  async function loadLeads() {
    setLoadingLeads(true);
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoadingLeads(false);
  }

  async function createList(name: string) {
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.leadList) {
      setLists((prev) => [data.leadList, ...prev]);
      setSelectedListId(data.leadList.id);
      showToast(`Lista "${data.leadList.name}" criada!`);
    }
  }

  async function addLeadManual(fields: Record<string, string>) {
    const res  = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar lead");
    showToast(`Lead ${fields.phone} adicionado com sucesso!`);
    loadLeads();
  }

  async function importCSV(file: File) {
    if (!file || !selectedListId) return;
    setImporting(true);
    const form = new FormData();
    form.append("file", file);
    const res  = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${selectedListId}/import`,
      { method: "POST", body: form }
    );
    const data = await res.json();
    if (res.ok) {
      showToast(
        `✓ ${data.imported} leads importados${data.skipped > 0 ? `, ${data.skipped} ignorados` : ""}`,
        "success"
      );
      if (data.errors?.length > 0) {
        setTimeout(() => showToast(`Atenção: ${data.errors[0]}`, "error"), 600);
      }
      loadLeads();
    } else {
      showToast(`Erro: ${data.error}`, "error");
    }
    setImporting(false);
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) setSelectedFile(file);
    else showToast("Apenas arquivos .csv são aceitos", "error");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  const activeList = lists.find((l) => l.id === selectedListId);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Lead Lists</h1>
          <p className="page-subtitle">Gerencie suas listas de contatos para discagem</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nova Lista
        </button>
      </div>

      {/* Empty state */}
      {lists.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
                <rect x="8" y="12" width="48" height="40" rx="4" fill="#e0e7ff" />
                <rect x="16" y="22" width="24" height="3" rx="1.5" fill="#a5b4fc" />
                <rect x="16" y="30" width="32" height="3" rx="1.5" fill="#c7d2fe" />
                <rect x="16" y="38" width="20" height="3" rx="1.5" fill="#ddd6fe" />
                <circle cx="50" cy="50" r="10" fill="#6366f1" />
                <path d="M46 50h8M50 46v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="empty-state-title">Nenhuma lista de leads ainda</p>
            <p className="empty-state-desc">
              Crie sua primeira lista para começar a importar contatos e disparar campanhas de discagem.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Criar Primeira Lista
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Coluna esquerda: seleção de lista */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Suas Listas</h2>
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
                className={`w-full text-left card px-4 py-4 transition-all ${
                  list.id === selectedListId
                    ? "ring-2 ring-indigo-500 bg-indigo-50/50"
                    : "hover:shadow-md hover:border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      list.id === selectedListId ? "bg-indigo-100" : "bg-gray-100"
                    }`}>
                      <Users className={`w-4 h-4 ${list.id === selectedListId ? "text-indigo-600" : "text-gray-500"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{list.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(list.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${
                    list.id === selectedListId ? "text-indigo-500" : "text-gray-300"
                  }`} />
                </div>
              </button>
            ))}
          </div>

          {/* Coluna direita: importar CSV + tabela */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── Card: Importar CSV ── */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Importar Leads via CSV</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Para: <span className="font-medium text-gray-600">{activeList?.name}</span>
                  </p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="btn-secondary text-xs gap-1.5"
                  title="Baixar modelo CSV com o formato correto"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template CSV
                </button>
              </div>

              <div className="card-body space-y-4">
                {/* Instruções de formato */}
                <div className="alert-info text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                  <div className="space-y-1.5">
                    <p className="font-semibold text-indigo-800">Formato esperado do CSV</p>
                    <p className="text-indigo-700">
                      Coluna obrigatória:{" "}
                      <code className="bg-indigo-100 px-1 rounded font-mono">phone</code>
                      {" · "}Opcionais:{" "}
                      <code className="bg-indigo-100 px-1 rounded font-mono">name</code>,{" "}
                      <code className="bg-indigo-100 px-1 rounded font-mono">company</code>{" "}
                      (ou qualquer outra coluna extra)
                    </p>
                    <pre className="font-mono bg-indigo-100/60 px-2 py-1.5 rounded text-indigo-800 text-xs leading-relaxed">
{`phone,name,company
+5511999990001,João Silva,Empresa A
11988880002,Maria Santos,`}
                    </pre>
                    <p className="text-indigo-600">
                      Aceita com/sem <code className="bg-indigo-100 px-1 rounded font-mono">+55</code> e com/sem máscara.
                      Clique em <strong>Template CSV</strong> para baixar um modelo pronto.
                    </p>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`upload-area ${dragOver ? "dragover" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-semibold text-indigo-700">{selectedFile.name}</p>
                      <p className="text-xs text-indigo-400 mt-1">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        Arraste um arquivo CSV ou clique para selecionar
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Somente arquivos <code className="bg-gray-100 px-1 rounded font-mono">.csv</code>
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 px-3 py-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
                      <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-sm text-indigo-700 truncate">{selectedFile.name}</span>
                    </div>
                    <button
                      onClick={() => importCSV(selectedFile)}
                      disabled={importing}
                      className="btn-primary shrink-0"
                    >
                      {importing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Importando...</>
                      ) : (
                        <><Upload className="w-4 h-4" />Importar</>
                      )}
                    </button>
                    <button
                      onClick={() => { setSelectedFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="btn-secondary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Tabela de leads ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Leads da Lista{" "}
                  {leads.length > 0 && (
                    <span className="text-gray-400 font-normal normal-case">({leads.length})</span>
                  )}
                </h3>
                {selectedListId && (
                  <button
                    onClick={() => setShowAddLead(true)}
                    className="btn-secondary text-xs gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Adicionar Lead
                  </button>
                )}
              </div>

              {loadingLeads ? (
                <div className="card">
                  <div className="divide-y divide-gray-50">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="px-5 py-4 flex gap-4">
                        <div className="skeleton h-4 w-32" />
                        <div className="skeleton h-4 w-28" />
                        <div className="skeleton h-4 w-20" />
                        <div className="skeleton h-4 w-12" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : leads.length > 0 ? (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" />
                            Telefone
                          </span>
                        </th>
                        <th>Nome / Empresa</th>
                        <th>Status</th>
                        <th>Tentativas</th>
                        <th>Outros dados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => {
                        const statusCfg = STATUS_CONFIG[lead.status] ?? { label: lead.status, badge: "badge-gray" };
                        const { name, company, ...rest } = lead.data_json ?? {};
                        const extras = Object.entries(rest)
                          .slice(0, 2)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ");
                        return (
                          <tr key={lead.id}>
                            <td className="font-mono font-medium text-gray-900">{lead.phone_e164}</td>
                            <td>
                              {name ? (
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{name}</p>
                                  {company && <p className="text-xs text-gray-400">{company}</p>}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td>
                              <span className={statusCfg.badge}>{statusCfg.label}</span>
                            </td>
                            <td className="text-gray-500">{lead.attempt_count}</td>
                            <td className="text-gray-400 text-xs">{extras || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state py-12">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="empty-state-title">Nenhum lead nesta lista</p>
                    <p className="empty-state-desc">
                      Importe um CSV ou adicione leads manualmente para começar.
                    </p>
                    <button onClick={() => setShowAddLead(true)} className="btn-secondary">
                      <UserPlus className="w-4 h-4" />
                      Adicionar primeiro lead
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar lista */}
      {showCreate && (
        <CreateListModal onClose={() => setShowCreate(false)} onCreate={createList} />
      )}

      {/* Modal: Adicionar lead manualmente */}
      {showAddLead && activeList && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onAdd={addLeadManual}
          listName={activeList.name}
        />
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success"
              ? <Check className="w-4 h-4 text-emerald-400" />
              : <AlertCircle className="w-4 h-4" />
            }
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
