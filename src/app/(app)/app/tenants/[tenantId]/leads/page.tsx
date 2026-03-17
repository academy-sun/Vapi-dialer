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
  new: { label: "Novo", badge: "badge-gray" },
  queued: { label: "Na fila", badge: "badge-blue" },
  calling: { label: "Em ligação", badge: "badge-yellow" },
  completed: { label: "Concluído", badge: "badge-green" },
  failed: { label: "Falhou", badge: "badge-red" },
  doNotCall: { label: "Não ligar", badge: "badge-gray" },
  callbackScheduled: { label: "Callback", badge: "badge-purple" },
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

/* ── Modal criar lista ── */
function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
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
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary">
              {loading ? "Criando..." : "Criar Lista"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [lists, setLists] = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toasts, show: showToast } = useToast();

  useEffect(() => { loadLists(); }, [tenantId]);
  useEffect(() => { if (selectedListId) loadLeads(); }, [selectedListId]);

  async function loadLists() {
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists`);
    const data = await res.json();
    setLists(data.leadLists ?? []);
    if (data.leadLists?.length > 0) setSelectedListId(data.leadLists[0].id);
  }

  async function loadLeads() {
    setLoadingLeads(true);
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoadingLeads(false);
  }

  async function createList(name: string) {
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists`, {
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

  async function importCSV(file: File) {
    if (!file || !selectedListId) return;
    setImporting(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${selectedListId}/import`,
      { method: "POST", body: form }
    );
    const data = await res.json();
    if (res.ok) {
      showToast(`✓ ${data.imported} leads importados${data.skipped > 0 ? `, ${data.skipped} ignorados` : ""}`, "success");
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

      {/* Empty state — sem listas */}
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

          {/* Lista de listas */}
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
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        list.id === selectedListId ? "bg-indigo-100" : "bg-gray-100"
                      }`}
                    >
                      <Users
                        className={`w-4 h-4 ${list.id === selectedListId ? "text-indigo-600" : "text-gray-500"}`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{list.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(list.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 ${
                      list.id === selectedListId ? "text-indigo-500" : "text-gray-300"
                    }`}
                  />
                </div>
              </button>
            ))}
          </div>

          {/* Painel direito */}
          <div className="lg:col-span-2 space-y-5">

            {/* Import CSV */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Importar Leads via CSV</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Para: <span className="font-medium text-gray-600">{activeList?.name}</span>
                  </p>
                </div>
              </div>
              <div className="card-body space-y-4">
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
                        O arquivo deve conter a coluna <code className="bg-gray-100 px-1 rounded font-mono">phone</code>
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
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Importar
                        </>
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

            {/* Tabela de leads */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Leads da Lista
              </h3>

              {loadingLeads ? (
                <div className="card">
                  <div className="divide-y divide-gray-50">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="px-5 py-4 flex gap-4">
                        <div className="skeleton h-4 w-32" />
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
                        <th>Status</th>
                        <th>Tentativas</th>
                        <th>Dados Extras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => {
                        const statusCfg = STATUS_CONFIG[lead.status] ?? { label: lead.status, badge: "badge-gray" };
                        return (
                          <tr key={lead.id}>
                            <td className="font-mono font-medium text-gray-900">{lead.phone_e164}</td>
                            <td>
                              <span className={statusCfg.badge}>{statusCfg.label}</span>
                            </td>
                            <td className="text-gray-500">{lead.attempt_count}</td>
                            <td className="text-gray-400 text-xs">
                              {Object.entries(lead.data_json ?? {})
                                .slice(0, 2)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </td>
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
                      Importe um arquivo CSV para adicionar contatos a esta lista.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar */}
      {showCreate && (
        <CreateListModal onClose={() => setShowCreate(false)} onCreate={createList} />
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success" ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
