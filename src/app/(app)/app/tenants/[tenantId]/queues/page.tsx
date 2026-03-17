"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Play,
  Pause,
  Square,
  ListOrdered,
  Check,
  AlertTriangle,
  Loader2,
  X,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  Link2,
} from "lucide-react";

interface LeadList { id: string; name: string }
interface Queue {
  id: string; name: string; status: string;
  assistant_id: string; phone_number_id: string;
  concurrency: number; max_attempts: number;
  retry_delay_minutes: number;
  lead_list_id: string;
  webhook_url?: string;
  allowed_days?: unknown;       // JSONB from Supabase
  allowed_time_window?: unknown; // JSONB from Supabase
}
interface Progress {
  queueStatus: string; total: number; done: number;
  calling: number; pending: number; progressPct: number;
  byStatus: Record<string, number>;
}
interface Lead {
  id: string; phone_e164: string; status: string;
  attempt_count: number; data_json: Record<string, string>;
  last_outcome?: string; created_at: string;
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

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  draft:    { label: "Rascunho",  badge: "badge-gray"   },
  running:  { label: "Ativa",     badge: "badge-green"  },
  paused:   { label: "Pausada",   badge: "badge-yellow" },
  stopped:  { label: "Parada",    badge: "badge-red"    },
};

const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:               { label: "Novo",             color: "text-blue-600 bg-blue-50"    },
  queued:            { label: "Aguardando",        color: "text-indigo-600 bg-indigo-50"},
  calling:           { label: "Em ligação",        color: "text-amber-600 bg-amber-50"  },
  completed:         { label: "Concluído",         color: "text-emerald-600 bg-emerald-50"},
  failed:            { label: "Falhou",            color: "text-red-600 bg-red-50"     },
  doNotCall:         { label: "Não ligar",         color: "text-gray-600 bg-gray-100"  },
  callbackScheduled: { label: "Callback agendado", color: "text-purple-600 bg-purple-50"},
};

const DAYS_CONFIG = [
  { iso: 1, label: "Seg" },
  { iso: 2, label: "Ter" },
  { iso: 3, label: "Qua" },
  { iso: 4, label: "Qui" },
  { iso: 5, label: "Sex" },
  { iso: 6, label: "Sáb" },
  { iso: 7, label: "Dom" },
];

// ── Queue form shared fields ──
function QueueFormFields({
  form,
  leadLists,
  update,
  isEdit = false,
}: {
  form: Record<string, string>;
  leadLists: LeadList[];
  update: (k: string, v: string) => void;
  isEdit?: boolean;
}) {
  // allowed_days stored as comma-separated string "1,2,3,4,5"
  const selectedDays: number[] = form.allowed_days
    ? form.allowed_days.split(",").map(Number).filter(Boolean)
    : [1, 2, 3, 4, 5];

  function toggleDay(iso: number) {
    const next = selectedDays.includes(iso)
      ? selectedDays.filter((d) => d !== iso)
      : [...selectedDays, iso].sort();
    update("allowed_days", next.join(","));
  }

  const noRestriction = form.allowed_days === "";

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <label className="form-label">Nome da Fila</label>
        <input className="form-input" placeholder="Ex: Campanha Janeiro" value={form.name}
          onChange={(e) => update("name", e.target.value)} required />
      </div>
      <div>
        <label className="form-label">Vapi Assistant ID</label>
        <input className="form-input font-mono" placeholder="asst_xxx" value={form.assistant_id}
          onChange={(e) => update("assistant_id", e.target.value)} required />
      </div>
      <div>
        <label className="form-label">Vapi Phone Number ID</label>
        <input className="form-input font-mono" placeholder="pn_xxx" value={form.phone_number_id}
          onChange={(e) => update("phone_number_id", e.target.value)} required />
      </div>
      {!isEdit && (
        <div>
          <label className="form-label">Lista de Leads</label>
          <select className="select-native" value={form.lead_list_id}
            onChange={(e) => update("lead_list_id", e.target.value)} required>
            <option value="">Selecionar lista...</option>
            {leadLists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className={isEdit ? "col-span-1" : ""}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Concorrência</label>
            <input className="form-input" type="number" min="1" max="10" value={form.concurrency}
              onChange={(e) => update("concurrency", e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Chamadas simultâneas</p>
          </div>
          <div>
            <label className="form-label">Máx. tentativas</label>
            <input className="form-input" type="number" min="1" max="10" value={form.max_attempts}
              onChange={(e) => update("max_attempts", e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Por lead</p>
          </div>
        </div>
      </div>

      {/* Janela de horário */}
      <div className="col-span-2 border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Horário permitido para ligações</label>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={noRestriction}
              onChange={(e) => update("allowed_days", e.target.checked ? "" : "1,2,3,4,5")}
              className="rounded"
            />
            Sem restrição (ligar 24h/7 dias)
          </label>
        </div>

        {!noRestriction && (
          <>
            {/* Dias da semana */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Dias da semana</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_CONFIG.map((d) => (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => toggleDay(d.iso)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedDays.includes(d.iso)
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Horário */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label text-xs">Início</label>
                <input type="time" className="form-input text-sm" value={form.time_start ?? "09:00"}
                  onChange={(e) => update("time_start", e.target.value)} />
              </div>
              <div>
                <label className="form-label text-xs">Fim</label>
                <input type="time" className="form-input text-sm" value={form.time_end ?? "18:00"}
                  onChange={(e) => update("time_end", e.target.value)} />
              </div>
              <div>
                <label className="form-label text-xs">Fuso horário</label>
                <select className="select-native text-sm" value={form.timezone ?? "America/Sao_Paulo"}
                  onChange={(e) => update("timezone", e.target.value)}>
                  <option value="America/Sao_Paulo">São Paulo (BRT)</option>
                  <option value="America/Manaus">Manaus (AMT)</option>
                  <option value="America/Belem">Belém (BRT)</option>
                  <option value="America/Recife">Recife (BRT)</option>
                  <option value="America/Fortaleza">Fortaleza (BRT)</option>
                  <option value="America/Noronha">Noronha (FNT)</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="col-span-2">
        <label className="form-label flex items-center gap-1">
          <Link2 className="w-3.5 h-3.5 text-gray-400" />
          Webhook de Saída (opcional)
        </label>
        <input className="form-input font-mono text-sm" placeholder="https://seu-n8n.com/webhook/xxx"
          value={form.webhook_url ?? ""}
          onChange={(e) => update("webhook_url", e.target.value)} />
        <p className="text-xs text-gray-400 mt-1">
          POST automático com resultado de cada chamada (compatível com n8n, Zapier, Make, etc.)
        </p>
      </div>
    </div>
  );
}

// ── Create modal ──
function CreateQueueModal({
  leadLists, onClose, onCreate,
}: {
  leadLists: LeadList[];
  onClose: () => void;
  onCreate: (form: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "", assistant_id: "", phone_number_id: "",
    lead_list_id: "", concurrency: "3", max_attempts: "3", webhook_url: "",
    allowed_days: "1,2,3,4,5", time_start: "09:00", time_end: "18:00",
    timezone: "America/Sao_Paulo",
  });
  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onCreate(form);
    setLoading(false);
    onClose();
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Nova Fila de Discagem</h2>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
          <QueueFormFields form={form} leadLists={leadLists} update={update} />
          <div className="flex gap-3 justify-end pt-5 mt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : <><Plus className="w-4 h-4" /> Criar Fila</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit modal ──
function EditQueueModal({
  queue, leadLists, onClose, onSave,
}: {
  queue: Queue;
  leadLists: LeadList[];
  onClose: () => void;
  onSave: (id: string, form: Record<string, string>) => Promise<void>;
}) {
  // Parse allowed_days from the queue (JSONB array → comma string)
  const existingDays = Array.isArray(queue.allowed_days)
    ? (queue.allowed_days as unknown as number[]).join(",")
    : "1,2,3,4,5";
  const existingWindow = queue.allowed_time_window as unknown as { start?: string; end?: string; timezone?: string } | null;

  const [form, setForm] = useState({
    name:                queue.name,
    assistant_id:        queue.assistant_id,
    phone_number_id:     queue.phone_number_id,
    concurrency:         String(queue.concurrency),
    max_attempts:        String(queue.max_attempts),
    retry_delay_minutes: String(queue.retry_delay_minutes ?? 30),
    webhook_url:         queue.webhook_url ?? "",
    allowed_days:        existingDays,
    time_start:          existingWindow?.start ?? "09:00",
    time_end:            existingWindow?.end   ?? "18:00",
    timezone:            existingWindow?.timezone ?? "America/Sao_Paulo",
  });
  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave(queue.id, form);
    setLoading(false);
    onClose();
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Editar Fila</h2>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
          <QueueFormFields form={form} leadLists={leadLists} update={update} isEdit />
          <div className="flex gap-3 justify-end pt-5 mt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leads drawer (painel lateral) ──
function LeadsDrawer({
  tenantId,
  queue,
  leadListName,
  onClose,
}: {
  tenantId: string;
  queue: Queue;
  leadListName: string;
  onClose: () => void;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const loadLeads = useCallback(async (p: number) => {
    setLoading(true);
    const res = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${queue.lead_list_id}/leads?page=${p}&limit=${limit}`
    );
    const data = await res.json();
    setLeads(data.leads ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [tenantId, queue.lead_list_id]);

  useEffect(() => { loadLeads(page); }, [loadLeads, page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{queue.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Lista: {leadListName} · {total} leads</p>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">Nenhum lead nesta lista.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Telefone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Tent.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.map((lead) => {
                  const sc = LEAD_STATUS_CONFIG[lead.status] ?? { label: lead.status, color: "text-gray-600 bg-gray-50" };
                  const name = lead.data_json?.name ?? lead.data_json?.nome ?? "—";
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{lead.phone_e164}</td>
                      <td className="px-4 py-2.5 text-gray-700 truncate max-w-[120px]">{name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-center">{lead.attempt_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-sm btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-xs text-gray-500">Página {page} de {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn btn-sm btn-secondary disabled:opacity-40"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──
export default function QueuesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [viewingQueue, setViewingQueue] = useState<Queue | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const { toasts, show: showToast } = useToast();

  const loadQueues = useCallback(async () => {
    const res = await fetch(`/api/tenants/${tenantId}/queues`);
    const data = await res.json();
    setQueues(data.queues ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadQueues();
    fetch(`/api/tenants/${tenantId}/lead-lists`)
      .then((r) => r.json())
      .then((d) => setLeadLists(d.leadLists ?? []));
  }, [tenantId, loadQueues]);

  useEffect(() => {
    const running = queues.filter((q) => q.status === "running");
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const q of running) {
        const res = await fetch(`/api/tenants/${tenantId}/queues/${q.id}/progress`);
        const data = await res.json();
        setProgress((prev) => ({ ...prev, [q.id]: data }));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [queues, tenantId]);

  function buildQueuePayload(form: Record<string, string>) {
    // Converte allowed_days de "1,2,3,4,5" → [1,2,3,4,5]
    const allowedDays = form.allowed_days
      ? form.allowed_days.split(",").map(Number).filter(Boolean)
      : []; // vazio = sem restrição

    const allowedTimeWindow = form.allowed_days && form.allowed_days.length > 0
      ? {
          start:    form.time_start  ?? "09:00",
          end:      form.time_end    ?? "18:00",
          timezone: form.timezone    ?? "America/Sao_Paulo",
        }
      : { start: "00:00", end: "23:59", timezone: "America/Sao_Paulo" };

    return {
      name:                 form.name,
      assistant_id:         form.assistant_id,
      phone_number_id:      form.phone_number_id,
      lead_list_id:         form.lead_list_id,
      concurrency:          parseInt(form.concurrency),
      max_attempts:         parseInt(form.max_attempts),
      retry_delay_minutes:  parseInt(form.retry_delay_minutes ?? "30"),
      webhook_url:          form.webhook_url?.trim() || null,
      allowed_days:         allowedDays,
      allowed_time_window:  allowedTimeWindow,
    };
  }

  async function createQueue(form: Record<string, string>) {
    const res = await fetch(`/api/tenants/${tenantId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQueuePayload(form)),
    });
    const data = await res.json();
    if (data.queue) {
      setQueues((prev) => [data.queue, ...prev]);
      showToast(`Fila "${data.queue.name}" criada!`);
    } else {
      showToast(data.error ?? "Erro ao criar fila", "error");
    }
  }

  async function saveQueue(id: string, form: Record<string, string>) {
    const payload = buildQueuePayload(form);
    const res = await fetch(`/api/tenants/${tenantId}/queues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.queue) {
      setQueues((prev) => prev.map((q) => q.id === id ? data.queue : q));
      showToast("Fila atualizada!");
    } else {
      showToast(data.error ?? "Erro ao salvar", "error");
    }
  }

  async function deleteQueue(queue: Queue) {
    if (!confirm(`Deletar a fila "${queue.name}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/tenants/${tenantId}/queues/${queue.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setQueues((prev) => prev.filter((q) => q.id !== queue.id));
      showToast("Fila deletada");
    } else {
      showToast(data.error ?? "Erro ao deletar", "error");
    }
  }

  async function queueAction(queueId: string, action: "start" | "pause" | "stop") {
    await fetch(`/api/tenants/${tenantId}/queues/${queueId}/${action}`, { method: "POST" });
    showToast(
      action === "start" ? "Fila iniciada!" :
      action === "pause" ? "Fila pausada!" :
      "Fila parada!"
    );
    loadQueues();
  }

  const leadListName = (id: string) =>
    leadLists.find((l) => l.id === id)?.name ?? id.slice(0, 8) + "...";

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Filas de Discagem</h1>
          <p className="page-subtitle">Gerencie campanhas de discagem automática</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nova Fila
        </button>
      </div>

      {/* Skeleton */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="skeleton h-3 w-64 mb-3" />
              <div className="skeleton h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : queues.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
                <rect x="10" y="10" width="44" height="10" rx="3" fill="#e0e7ff" />
                <rect x="10" y="26" width="44" height="10" rx="3" fill="#c7d2fe" />
                <rect x="10" y="42" width="30" height="10" rx="3" fill="#ddd6fe" />
                <circle cx="52" cy="47" r="10" fill="#6366f1" />
                <path d="M48.5 47l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="empty-state-title">Nenhuma fila criada</p>
            <p className="empty-state-desc">
              Crie uma fila, vincule uma lista de leads e um assistente Vapi para iniciar uma campanha de discagem automática.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Criar Primeira Fila
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {queues.map((q) => {
            const prog = progress[q.id];
            const statusCfg = STATUS_CONFIG[q.status] ?? { label: q.status, badge: "badge-gray" };
            return (
              <div key={q.id} className="card p-5 hover:shadow-md transition-shadow">
                {/* Queue header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <ListOrdered className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{q.name}</h3>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          Lista: <span className="font-medium text-gray-700">{leadListName(q.lead_list_id)}</span>
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-500">
                          Concorrência: <span className="font-medium text-gray-700">{q.concurrency}</span>
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-500">
                          Tentativas: <span className="font-medium text-gray-700">{q.max_attempts}</span>
                        </span>
                        {(() => {
                          const days = Array.isArray(q.allowed_days) ? (q.allowed_days as unknown as number[]) : [];
                          const tw = q.allowed_time_window as { start?: string; end?: string } | null;
                          if (days.length > 0 && tw?.start && tw?.end) {
                            const dayLabels = ["","Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
                            return (
                              <>
                                <span className="text-gray-200">·</span>
                                <span className="text-xs text-gray-500">
                                  {days.map((d) => dayLabels[d]).join(" ")} {tw.start}–{tw.end}
                                </span>
                              </>
                            );
                          }
                          return null;
                        })()}
                        {q.webhook_url && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-emerald-600 flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> Webhook ativo
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">
                        {q.assistant_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={statusCfg.badge}>{statusCfg.label}</span>
                    {/* Edit button */}
                    <button
                      onClick={() => setEditingQueue(q)}
                      className="btn-icon text-gray-400 hover:text-indigo-600"
                      title="Editar fila"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {/* Delete button — só em draft/stopped */}
                    {(q.status === "draft" || q.status === "stopped") && (
                      <button
                        onClick={() => deleteQueue(q)}
                        className="btn-icon text-gray-400 hover:text-red-500"
                        title="Deletar fila"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress */}
                {prog ? (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span>
                        <span className="font-semibold text-gray-700">{prog.done}</span>/{prog.total} concluídos
                        <span className="ml-1 text-indigo-600 font-medium">({prog.progressPct}%)</span>
                      </span>
                      {prog.calling > 0 && (
                        <span className="text-amber-600 font-medium">
                          {prog.calling} em ligação agora
                        </span>
                      )}
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${prog.progressPct}%` }} />
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                <div className="flex gap-2 pt-1 flex-wrap">
                  {q.status === "draft" && (
                    <button
                      onClick={() => queueAction(q.id, "start")}
                      className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Iniciar
                    </button>
                  )}
                  {q.status === "running" && (
                    <button
                      onClick={() => queueAction(q.id, "pause")}
                      className="btn btn-sm bg-amber-500 text-white hover:bg-amber-600"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pausar
                    </button>
                  )}
                  {q.status === "paused" && (
                    <button
                      onClick={() => queueAction(q.id, "start")}
                      className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Retomar
                    </button>
                  )}
                  {(q.status === "running" || q.status === "paused") && (
                    <button
                      onClick={() => queueAction(q.id, "stop")}
                      className="btn btn-sm bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Parar
                    </button>
                  )}
                  {/* Ver leads */}
                  <button
                    onClick={() => setViewingQueue(q)}
                    className="btn btn-sm bg-gray-100 text-gray-700 hover:bg-gray-200 ml-auto"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Ver Leads
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateQueueModal
          leadLists={leadLists}
          onClose={() => setShowCreate(false)}
          onCreate={createQueue}
        />
      )}

      {editingQueue && (
        <EditQueueModal
          queue={editingQueue}
          leadLists={leadLists}
          onClose={() => setEditingQueue(null)}
          onSave={saveQueue}
        />
      )}

      {/* Leads drawer */}
      {viewingQueue && (
        <LeadsDrawer
          tenantId={tenantId}
          queue={viewingQueue}
          leadListName={leadListName(viewingQueue.lead_list_id)}
          onClose={() => setViewingQueue(null)}
        />
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
