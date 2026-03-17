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
  ChevronRight,
} from "lucide-react";

interface LeadList { id: string; name: string }
interface Queue {
  id: string; name: string; status: string;
  assistant_id: string; phone_number_id: string;
  concurrency: number; max_attempts: number;
  lead_list_id: string;
}
interface Progress {
  queueStatus: string; total: number; done: number;
  calling: number; pending: number; progressPct: number;
  byStatus: Record<string, number>;
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
  draft: { label: "Rascunho", badge: "badge-gray" },
  running: { label: "Ativa", badge: "badge-green" },
  paused: { label: "Pausada", badge: "badge-yellow" },
  stopped: { label: "Parada", badge: "badge-red" },
};

function CreateQueueModal({
  leadLists,
  onClose,
  onCreate,
}: {
  leadLists: LeadList[];
  onClose: () => void;
  onCreate: (form: Record<string, string>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "", assistant_id: "", phone_number_id: "",
    lead_list_id: "", concurrency: "3", max_attempts: "3",
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
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
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

export default function QueuesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
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

  async function createQueue(form: Record<string, string>) {
    const res = await fetch(`/api/tenants/${tenantId}/queues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        concurrency: parseInt(form.concurrency),
        max_attempts: parseInt(form.max_attempts),
      }),
    });
    const data = await res.json();
    if (data.queue) {
      setQueues((prev) => [data.queue, ...prev]);
      showToast(`Fila "${data.queue.name}" criada!`);
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

  const leadListName = (id: string) => leadLists.find((l) => l.id === id)?.name ?? id.slice(0, 8) + "...";

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
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">
                        {q.assistant_id}
                      </p>
                    </div>
                  </div>
                  <span className={statusCfg.badge}>{statusCfg.label}</span>
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
                <div className="flex gap-2 pt-1">
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateQueueModal
          leadLists={leadLists}
          onClose={() => setShowCreate(false)}
          onCreate={createQueue}
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
