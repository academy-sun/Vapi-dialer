"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Play, Pause, Square, RotateCcw, Copy, Check, AlertTriangle,
  Loader2, X, Pencil, Trash2, Users, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Link2, Zap, CheckCircle2, XCircle,
  Stethoscope, Clock, Ban, Braces, Upload, ChevronDown, ChevronUp,
  ArrowRight, FileText, Settings2, Megaphone, Phone, Search, Webhook,
  UserPlus, AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LeadList { id: string; name: string }
interface VapiAssistant  { id: string; name: string }
interface VapiPhoneNumber { id: string; name?: string; number?: string }
interface VapiResources {
  assistants:   VapiAssistant[];
  phoneNumbers: VapiPhoneNumber[];
  tools:        { id: string; name: string }[];
}
interface Queue {
  id: string; name: string; status: string;
  assistant_id: string; phone_number_id: string;
  concurrency: number; max_attempts: number;
  retry_delay_minutes: number;
  max_daily_attempts: number;
  lead_list_id: string;
  webhook_url?: string;
  allowed_days?: unknown;
  allowed_time_window?: unknown;
  last_error?: string | null;
  avg_deal_value?: number | null;
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
  next_attempt_at?: string;
}
interface ToastMsg { id: string; message: string; type: "success" | "error" }

// ── Toast hook ──────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = useCallback((message: string, type: ToastMsg["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ── Config maps ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  draft:    { label: "Rascunho",  badge: "badge-gray"   },
  running:  { label: "Ativa",     badge: "badge-green"  },
  paused:   { label: "Pausada",   badge: "badge-yellow" },
  stopped:  { label: "Parada",    badge: "badge-red"    },
};

const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:               { label: "Novo",             color: "text-blue-600 bg-blue-50"     },
  queued:            { label: "Aguardando",        color: "text-indigo-600 bg-indigo-50" },
  calling:           { label: "Em ligação",        color: "text-amber-600 bg-amber-50"  },
  completed:         { label: "Concluído",         color: "text-emerald-600 bg-emerald-50" },
  failed:            { label: "Falhou",            color: "text-red-600 bg-red-50"      },
  doNotCall:         { label: "Não ligar",         color: "text-gray-600 bg-gray-100"   },
  callbackScheduled: { label: "Callback agendado", color: "text-purple-600 bg-purple-50" },
};

const DAYS_CONFIG = [
  { iso: 1, label: "Seg" }, { iso: 2, label: "Ter" }, { iso: 3, label: "Qua" },
  { iso: 4, label: "Qui" }, { iso: 5, label: "Sex" }, { iso: 6, label: "Sáb" },
  { iso: 7, label: "Dom" },
];

// ── Advanced config fields (shared between wizard step 1 and edit modal) ───────
function AdvancedConfigFields({
  form, update, isAdmin = false,
}: {
  form: Record<string, string>;
  update: (k: string, v: string) => void;
  isAdmin?: boolean;
}) {
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
    <div className="space-y-4">
      {/* Concurrency / attempts / retry */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="form-label">Concorrência</label>
          <input className="form-input" type="number" min="1" max="5"
            value={form.concurrency}
            onChange={(e) => update("concurrency", String(Math.min(5, Math.max(1, parseInt(e.target.value) || 1))))} />
          <p className="text-xs text-gray-400 mt-1">Máx. 5 por campanha</p>
        </div>
        <div>
          <label className="form-label">Máx. tentativas</label>
          <input className="form-input" type="number" min="1" max="10"
            value={form.max_attempts} onChange={(e) => update("max_attempts", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Por lead (total)</p>
        </div>
        <div>
          <label className="form-label">Intervalo</label>
          <div className="relative">
            <input className="form-input pr-12" type="number" min="1"
              value={form.retry_delay_minutes ?? "30"}
              onChange={(e) => update("retry_delay_minutes", e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">min</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Entre tentativas</p>
        </div>
      </div>

      {/* Daily attempt limit */}
      <div>
        <label className="form-label">Limite de tentativas por dia</label>
        <div className="flex items-center gap-3">
          <input className="form-input w-28" type="number" min="1" max="10"
            value={form.max_daily_attempts ?? "3"}
            onChange={(e) => update("max_daily_attempts", String(Math.min(10, Math.max(1, parseInt(e.target.value) || 1))))} />
          <p className="text-xs text-gray-400">
            Por lead por dia (1–10). Leads que atingirem o limite são
            reagendados para o próximo dia dentro da janela de horário.
          </p>
        </div>
      </div>

      {/* Ticket médio para cálculo de ROI no Dossiê */}
      <div>
        <label className="form-label flex items-center gap-1">
          Ticket Médio de Conversão
          <span className="ml-1 text-xs font-normal text-gray-400">(opcional)</span>
        </label>
        <div className="relative w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">R$</span>
          <input
            className="form-input pl-8"
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={form.avg_deal_value ?? ""}
            onChange={(e) => update("avg_deal_value", e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Usado no Dossiê para calcular oportunidades não trabalhadas
        </p>
      </div>

      {/* Time window */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Horário de ligações</label>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={noRestriction}
              onChange={(e) => update("allowed_days", e.target.checked ? "" : "1,2,3,4,5")}
              className="rounded" />
            Sem restrição (24h / 7 dias)
          </label>
        </div>
        {!noRestriction && (
          <>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS_CONFIG.map((d) => (
                <button key={d.iso} type="button" onClick={() => toggleDay(d.iso)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedDays.includes(d.iso)
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
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

      {/* Webhook — visível e editável apenas para SuperAdmin */}
      {isAdmin ? (
        <div>
          <label className="form-label flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5 text-gray-400" />
            Webhook de saída (opcional)
            <span className="ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Admin</span>
          </label>
          <input className="form-input font-mono text-sm"
            placeholder="https://seu-n8n.com/webhook/xxx"
            value={form.webhook_url ?? ""}
            onChange={(e) => update("webhook_url", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            POST automático com resultado de cada chamada (n8n, Zapier, Make…)
          </p>
        </div>
      ) : (
        <div>
          <label className="form-label flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5 text-gray-400" />
            Webhook de saída
          </label>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-500">
            <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
            {form.webhook_url
              ? <span className="font-mono truncate">{form.webhook_url}</span>
              : <span>Campanha sem Webhook de Saída configurado — solicite ao Admin</span>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campaign Creation Wizard (3 steps) ─────────────────────────────────────────
// IMPORTANT: NO backdrop click to close — only X button or Cancelar
function CampaignWizard({
  leadLists, tenantId, onClose, onCreated, vapiResources, vapiLoading, isAdmin = false,
}: {
  leadLists: LeadList[];
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
  vapiResources?: VapiResources;
  vapiLoading?: boolean;
  isAdmin?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Step 1: campaign config
  const [form, setForm] = useState({
    name: "", assistant_id: "", phone_number_id: "",
    concurrency: "3", max_attempts: "3", retry_delay_minutes: "30",
    max_daily_attempts: "3",
    webhook_url: "", avg_deal_value: "", allowed_days: "1,2,3,4,5",
    time_start: "09:00", time_end: "18:00", timezone: "America/Sao_Paulo",
  });

  // Step 2: leads
  const leadsMode = "existing";
  const [selectedListId, setSelectedListId] = useState(leadLists[0]?.id ?? "");

  // Step 3
  const [startImmediately, setStartImmediately] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function updateForm(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const step1Valid = !!(form.name.trim() && form.assistant_id && form.phone_number_id);
  const step2Valid = !!selectedListId;

  const selectedAssistant  = vapiResources?.assistants.find((a) => a.id === form.assistant_id);
  const selectedPhone      = vapiResources?.phoneNumbers.find((p) => p.id === form.phone_number_id);
  const selectedList       = leadLists.find((l) => l.id === selectedListId);

  function buildQueuePayload(leadListId: string) {
    const allowedDays = form.allowed_days
      ? form.allowed_days.split(",").map(Number).filter(Boolean)
      : [];
    const allowedTimeWindow = allowedDays.length > 0
      ? { start: form.time_start ?? "09:00", end: form.time_end ?? "18:00", timezone: form.timezone }
      : { start: "00:00", end: "23:59", timezone: "America/Sao_Paulo" };
    return {
      name: form.name,
      assistant_id: form.assistant_id,
      phone_number_id: form.phone_number_id,
      lead_list_id: leadListId,
      concurrency: parseInt(form.concurrency),
      max_attempts: parseInt(form.max_attempts),
      retry_delay_minutes: parseInt(form.retry_delay_minutes ?? "30"),
      max_daily_attempts: parseInt(form.max_daily_attempts ?? "0") || 0,
      webhook_url: form.webhook_url?.trim() || null,
      avg_deal_value: form.avg_deal_value ? parseFloat(form.avg_deal_value) || null : null,
      allowed_days: allowedDays,
      allowed_time_window: allowedTimeWindow,
    };
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const listId = selectedListId;

      // 3. Create campaign (queue)
      const queueRes = await fetch(`/api/tenants/${tenantId}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildQueuePayload(listId)),
      });
      const queueData = await queueRes.json();
      if (!queueData.queue) throw new Error(queueData.error ?? "Erro ao criar campanha");

      // 4. Start if requested
      if (startImmediately) {
        await fetch(`/api/tenants/${tenantId}/queues/${queueData.queue.id}/start`, { method: "POST" });
      }

      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setCreating(false);
    }
  }

  return (
    // NO onClick on this wrapper — modal doesn't close on backdrop click
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-10 pb-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Nova Campanha</h2>
              <p className="text-xs text-gray-400">
                {step === 1 ? "Configurar campanha" : step === 2 ? "Adicionar leads" : "Revisar e criar"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center px-6 py-3 border-b border-gray-50 shrink-0">
          {[{ n: 1, label: "Configurar" }, { n: 2, label: "Leads" }, { n: 3, label: "Revisar" }].map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${step === s.n ? "text-indigo-600" : step > s.n ? "text-emerald-600" : "text-gray-400"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  step > s.n ? "border-emerald-500 bg-emerald-50" :
                  step === s.n ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
                }`}>
                  {step > s.n ? <Check className="w-3 h-3" /> : s.n}
                </div>
                <span className="text-xs font-medium">{s.label}</span>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 mx-3 ${step > s.n ? "bg-emerald-300" : "bg-gray-100"}`} />}
            </div>
          ))}
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Configure ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="form-label">Nome da Campanha *</label>
                <input className="form-input" placeholder="Ex: Prospecção Janeiro 2026"
                  value={form.name} onChange={(e) => updateForm("name", e.target.value)} autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    Assistente Vapi *
                    {vapiLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                  </label>
                  {vapiResources && vapiResources.assistants.length > 0 ? (
                    <select className="select-native" value={form.assistant_id}
                      onChange={(e) => updateForm("assistant_id", e.target.value)}>
                      <option value="">Selecionar assistente…</option>
                      {vapiResources.assistants.map((a) => (
                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input font-mono text-sm"
                      placeholder={vapiLoading ? "Carregando…" : "asst_xxx (cole o ID)"}
                      value={form.assistant_id} onChange={(e) => updateForm("assistant_id", e.target.value)} />
                  )}
                  {form.assistant_id && (
                    <p className="text-xs text-gray-400 mt-1 font-mono truncate">{form.assistant_id}</p>
                  )}
                </div>
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    Número de Telefone *
                    {vapiLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                  </label>
                  {vapiResources && vapiResources.phoneNumbers.length > 0 ? (
                    <select className="select-native" value={form.phone_number_id}
                      onChange={(e) => updateForm("phone_number_id", e.target.value)}>
                      <option value="">Selecionar número…</option>
                      {vapiResources.phoneNumbers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number ? `${p.number}${p.name ? ` — ${p.name}` : ""}` : (p.name || p.id)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input font-mono text-sm"
                      placeholder={vapiLoading ? "Carregando…" : "pn_xxx (cole o ID)"}
                      value={form.phone_number_id} onChange={(e) => updateForm("phone_number_id", e.target.value)} />
                  )}
                  {form.phone_number_id && (
                    <p className="text-xs text-gray-400 mt-1 font-mono truncate">{form.phone_number_id}</p>
                  )}
                </div>
              </div>

              {/* Advanced settings (collapsible) */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-gray-400" />
                    Configurações avançadas
                    <span className="text-xs font-normal text-gray-400">
                      (concorrência, horários, webhook…)
                    </span>
                  </span>
                  {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="pt-4">
                      <AdvancedConfigFields form={form} update={updateForm} isAdmin={isAdmin} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Leads ─────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Escolha a lista de leads que será vinculada a esta campanha:</p>

              {/* Existing list */}
              {leadLists.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma lista de leads criada ainda.</p>
                  <p className="text-xs text-gray-400 mt-1">Acesse &quot;Listas de Leads&quot; no menu para criar uma nova.</p>
                </div>
              ) : (
                <div>
                  <label className="form-label">Selecionar lista *</label>
                  <select className="select-native" value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}>
                    <option value="">— Escolher lista —</option>
                    {leadLists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Review ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Resumo da Campanha</h3>
                <div className="space-y-2.5 text-sm">
                  {[
                    { icon: Megaphone, color: "bg-indigo-100 text-indigo-600", label: "Campanha", value: form.name },
                    { icon: Zap, color: "bg-purple-100 text-purple-600", label: "Assistente", value: selectedAssistant?.name || form.assistant_id.slice(0, 20) + "…", mono: true },
                    { icon: ArrowRight, color: "bg-emerald-100 text-emerald-600", label: "Número", value: selectedPhone?.number || selectedPhone?.name || form.phone_number_id.slice(0, 20) + "…", mono: true },
                    { icon: Users, color: "bg-blue-100 text-blue-600", label: "Lista de leads", value: selectedList?.name ?? "—" },
                  ].map(({ icon: Icon, color, label, value, mono }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${color}`}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <span className="text-gray-500 w-28 shrink-0">{label}</span>
                      <span className={`font-semibold text-gray-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3 flex gap-4 text-xs text-gray-500 flex-wrap">
                  <span>Concorrência: <strong>{form.concurrency}</strong></span>
                  <span>Tentativas: <strong>{form.max_attempts}</strong></span>
                  <span>Intervalo: <strong>{form.retry_delay_minutes}min</strong></span>
                </div>
              </div>

              {/* Start immediately toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                <div onClick={() => setStartImmediately((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer ${startImmediately ? "bg-emerald-500" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${startImmediately ? "left-5" : "left-0.5"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Iniciar campanha imediatamente</p>
                  <p className="text-xs text-gray-400">
                    {startImmediately ? "Vai começar a discar assim que criada" : "Ficará em rascunho — inicie manualmente"}
                  </p>
                </div>
              </label>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 rounded-xl px-3 py-2.5 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button"
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
            className="btn-secondary flex items-center gap-1.5">
            {step === 1 ? "Cancelar" : <><ChevronLeft className="w-4 h-4" /> Voltar</>}
          </button>
          {step < 3 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 ? !step1Valid : !step2Valid}
              className="btn-primary disabled:opacity-40 flex items-center gap-1.5">
              Próximo <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={handleCreate} disabled={creating}
              className="btn-primary flex items-center gap-1.5">
              {creating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando…</>
                : startImmediately
                  ? <><Play className="w-4 h-4" /> Criar e Iniciar</>
                  : <><Check className="w-4 h-4" /> Criar Campanha</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Campaign Modal (NO backdrop click to close) ───────────────────────────
function EditCampaignModal({
  queue, leadLists, onClose, onSave, vapiResources, vapiLoading, isAdmin = false,
}: {
  queue: Queue;
  leadLists: LeadList[];
  onClose: () => void;
  onSave: (id: string, form: Record<string, string>) => Promise<void>;
  vapiResources?: VapiResources;
  vapiLoading?: boolean;
  isAdmin?: boolean;
}) {
  const existingDays = Array.isArray(queue.allowed_days)
    ? (queue.allowed_days as unknown as number[]).join(",")
    : "1,2,3,4,5";
  const existingWindow = queue.allowed_time_window as { start?: string; end?: string; timezone?: string } | null;

  const [form, setForm] = useState({
    name:                queue.name,
    assistant_id:        queue.assistant_id,
    phone_number_id:     queue.phone_number_id,
    concurrency:         String(queue.concurrency),
    max_attempts:        String(queue.max_attempts),
    retry_delay_minutes: String(queue.retry_delay_minutes ?? 30),
    max_daily_attempts:  String(Math.min(10, Math.max(1, queue.max_daily_attempts ?? 3))),
    webhook_url:         queue.webhook_url ?? "",
    avg_deal_value:      queue.avg_deal_value != null ? String(queue.avg_deal_value) : "",
    allowed_days:        existingDays,
    time_start:          existingWindow?.start ?? "09:00",
    time_end:            existingWindow?.end   ?? "18:00",
    timezone:            existingWindow?.timezone ?? "America/Sao_Paulo",
  });
  const [loading, setLoading] = useState(false);

  function update(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave(queue.id, form);
    setLoading(false);
    onClose();
  }

  // NO onClick on the overlay wrapper — only X and Cancelar close the modal
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-10 pb-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Editar Campanha</h2>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Name */}
            <div>
              <label className="form-label">Nome da Campanha</label>
              <input className="form-input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </div>

            {/* Assistant + Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label flex items-center gap-1.5">
                  Assistente Vapi
                  {vapiLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                </label>
                {vapiResources && vapiResources.assistants.length > 0 ? (
                  <select className="select-native" value={form.assistant_id} onChange={(e) => update("assistant_id", e.target.value)} required>
                    <option value="">Selecionar…</option>
                    {vapiResources.assistants.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input font-mono text-sm" value={form.assistant_id}
                    onChange={(e) => update("assistant_id", e.target.value)} required />
                )}
                {form.assistant_id && (
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">{form.assistant_id}</p>
                )}
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  Número de Telefone
                  {vapiLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                </label>
                {vapiResources && vapiResources.phoneNumbers.length > 0 ? (
                  <select className="select-native" value={form.phone_number_id} onChange={(e) => update("phone_number_id", e.target.value)} required>
                    <option value="">Selecionar…</option>
                    {vapiResources.phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number ? `${p.number}${p.name ? ` — ${p.name}` : ""}` : (p.name || p.id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input font-mono text-sm" value={form.phone_number_id}
                    onChange={(e) => update("phone_number_id", e.target.value)} required />
                )}
                {form.phone_number_id && (
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">{form.phone_number_id}</p>
                )}
              </div>
            </div>

            <AdvancedConfigFields form={form} update={update} isAdmin={isAdmin} />
          </div>

          <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-1.5">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><Check className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leads Tab (inline inside expanded campaign card) ───────────────────────────
function LeadsTab({
  tenantId, queue, leadListName,
}: {
  tenantId: string;
  queue: Queue;
  leadListName: string;
}) {
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageInput, setPageInput]   = useState("1");
  const [loading, setLoading]       = useState(true);
  const [showVars, setShowVars]     = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limit = 20;

  const loadLeads = useCallback(async (p: number, q?: string) => {
    setLoading(true);
    const s = q !== undefined ? q : search;
    const qs = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (s) qs.set("search", s);
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${queue.lead_list_id}/leads?${qs}`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [tenantId, queue.lead_list_id, search]);

  useEffect(() => {
    loadLeads(page);
    setPageInput(String(page));
  }, [loadLeads, page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function goToPage(p: number) { setPage(Math.max(1, Math.min(totalPages, p))); }
  function handlePageBlur()    { const n = parseInt(pageInput); if (!isNaN(n)) goToPage(n); else setPageInput(String(page)); }
  function handlePageKey(e: React.KeyboardEvent<HTMLInputElement>) { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(v);
      setPage(1);
    }, 400);
  }

  async function removeLead(lead: Lead) {
    if (!confirm(`Remover ${lead.phone_e164} da campanha?\nO lead permanecerá na lista de leads, mas não será mais discado.`)) return;
    setRemovingId(lead.id);
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/lead-lists/${queue.lead_list_id}/leads/${lead.id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "doNotCall" }) }
      );
      if (res.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== lead.id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } finally {
      setRemovingId(null);
    }
  }

  const liquidVars: string[] = leads.length > 0
    ? ["phone", "phone_e164", ...Object.keys(leads[0].data_json ?? {})]
    : ["phone", "phone_e164"];

  return (
    <div>
      {/* Leads tab header */}
      <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/50 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Lista: <span className="font-medium text-gray-700">{leadListName}</span> · <strong>{total}</strong> leads
          </p>
          <div className="flex items-center gap-2">
            {/* LiquidJS vars */}
            <button onClick={() => setShowVars((v) => !v)}
              title="Variáveis LiquidJS"
              className={`btn-icon ${showVars ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-indigo-500"}`}>
              <Braces className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por telefone, nome ou campo…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 bg-white"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); handleSearchChange(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* LiquidJS variables */}
      {showVars && (
        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
            <Braces className="w-3.5 h-3.5" />
            Variáveis disponíveis no assistente Vapi (LiquidJS)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {liquidVars.map((v) => (
              <code key={v}
                className="text-xs px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 font-mono cursor-pointer select-all"
                title={`Clique para copiar: {{${v}}}`}
                onClick={() => navigator.clipboard?.writeText(`{{${v}}}`)}>
                {`{{${v}}}`}
              </code>
            ))}
          </div>
          <p className="text-xs text-indigo-500 mt-1.5">Clique numa variável para copiar · Use no prompt do assistente Vapi</p>
        </div>
      )}

      {/* Leads table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          {search ? (
            <>Nenhum lead encontrado para &ldquo;<strong>{search}</strong>&rdquo;.</>
          ) : (
            <>
              Nenhum lead nesta lista.
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Tent.</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Atendido?</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide">Próx. tentativa</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map((lead) => {
                const sc   = LEAD_STATUS_CONFIG[lead.status] ?? { label: lead.status, color: "text-gray-600 bg-gray-50" };
                const dj   = lead.data_json ?? {};
                const name = dj.first_name ?? dj.nome ?? dj.name ?? dj.Name ?? dj.Nome ?? dj.full_name ?? dj.fullName ?? dj.cliente ?? dj.contact ?? "";
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{lead.phone_e164}</td>
                    <td className="px-4 py-2.5 text-gray-700 truncate max-w-[140px]">{name || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-center font-mono text-xs">{lead.attempt_count}</td>
                    <td className="px-4 py-2.5 text-center">
                      {(() => {
                        // Fonte canônica — idêntica à usada no menu Lista de Leads (leads/page.tsx)
                        const ANSWERED = new Set([
                          "customer-ended-call",
                          "assistant-ended-call",
                          "exceeded-max-duration",
                        ]);
                        const NO_ANSWER = new Set([
                          // Vapi v1
                          "no-answer", "busy", "voicemail",
                          "machine_end_silence", "machine_end_other",
                          // Vapi v2
                          "customer-did-not-answer", "customer-busy", "silence-timed-out",
                          // Erros técnicos
                          "pipeline-error", "transport-error",
                        ]);
                        const outcome = lead.last_outcome ?? "";
                        if (ANSWERED.has(outcome)) return <CheckCircle2 className="w-4 h-4 text-emerald-500 inline-block" />;
                        if (NO_ANSWER.has(outcome) || outcome.startsWith("sip-") || outcome.startsWith("pipeline-error")) return <XCircle className="w-4 h-4 text-gray-300 inline-block" />;
                        return <span className="text-gray-200">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {lead.next_attempt_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                          {new Date(lead.next_attempt_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {lead.status !== "doNotCall" && lead.status !== "completed" && (
                        <button
                          onClick={() => removeLead(lead)}
                          disabled={removingId === lead.id}
                          title="Remover da campanha (não será mais discado)"
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {removingId === lead.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Ban className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(1)} disabled={page === 1} className="btn-icon w-7 h-7 disabled:opacity-30" title="Primeira">
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="btn-icon w-7 h-7 disabled:opacity-30" title="Anterior">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Página</span>
            <input type="number" min={1} max={totalPages} value={pageInput}
              onChange={(e) => setPageInput(e.target.value)} onBlur={handlePageBlur} onKeyDown={handlePageKey}
              className="w-12 text-center border border-gray-200 rounded-lg py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
            <span>de {totalPages}</span>
            <span className="text-gray-300">·</span>
            <span>{total} leads</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="btn-icon w-7 h-7 disabled:opacity-30" title="Próxima">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} className="btn-icon w-7 h-7 disabled:opacity-30" title="Última">
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [queues,       setQueues]       = useState<Queue[]>([]);
  const [leadLists,    setLeadLists]    = useState<LeadList[]>([]);
  const [showCreate,   setShowCreate]   = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [expandedId,   setExpandedId]  = useState<string | null>(null);
  const [activeTab,    setActiveTab]   = useState<Record<string, "overview" | "leads">>({});
  const [progress,     setProgress]    = useState<Record<string, Progress>>({});
  const [loading,      setLoading]     = useState(true);
  const [webhookTesting,   setWebhookTesting]   = useState<Record<string, boolean>>({});
  const [webhookResults,   setWebhookResults]   = useState<Record<string, { ok: boolean; message: string; status: number | null; elapsed_ms: number }>>({});
  const [diagnosing,       setDiagnosing]       = useState<Record<string, boolean>>({});
  const [diagnoseResults,  setDiagnoseResults]  = useState<Record<string, { ok: boolean; issues: string[]; leads: { by_status: Record<string, number>; ready_to_call: number }; time_window: { status: string; now_in_tz?: string; window_start?: string; window_end?: string; timezone?: string }; vapi_key_configured: boolean } | null>>({});
  const [vapiResources, setVapiResources] = useState<VapiResources | undefined>(undefined);
  const [vapiLoading,   setVapiLoading]   = useState(false);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const { toasts, show: showToast } = useToast();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setIsAdmin(d.isAdmin ?? false)).catch(() => {});
  }, []);

  const loadQueues = useCallback(async () => {
    const res  = await fetch(`/api/tenants/${tenantId}/queues`);
    const data = await res.json();
    setQueues(data.queues ?? []);
    setLoading(false);
  }, [tenantId]);

  const loadVapiResources = useCallback(async () => {
    setVapiLoading(true);
    try {
      const res  = await fetch(`/api/tenants/${tenantId}/vapi-resources`);
      const data = await res.json();
      if (res.ok) setVapiResources(data);
    } finally {
      setVapiLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadQueues();
    fetch(`/api/tenants/${tenantId}/lead-lists`)
      .then((r) => r.json())
      .then((d) => setLeadLists(d.leadLists ?? []));
  }, [tenantId, loadQueues]);

  // Lazy Load dos assistentes/números da Vapi apenas quando um modal for aberto
  useEffect(() => {
    if ((showCreate || editingQueue) && !vapiResources && !vapiLoading) {
      loadVapiResources();
    }
  }, [showCreate, editingQueue, vapiResources, vapiLoading, loadVapiResources]);

  // Poll progress for running campaigns
  useEffect(() => {
    const running = queues.filter((q) => q.status === "running");
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const q of running) {
        const res  = await fetch(`/api/tenants/${tenantId}/queues/${q.id}/progress`);
        const data = await res.json();
        setProgress((prev) => ({ ...prev, [q.id]: data }));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [queues, tenantId]);

  function buildQueuePayload(form: Record<string, string>) {
    const allowedDays = form.allowed_days
      ? form.allowed_days.split(",").map(Number).filter(Boolean)
      : [];
    const allowedTimeWindow = allowedDays.length > 0
      ? { start: form.time_start ?? "09:00", end: form.time_end ?? "18:00", timezone: form.timezone ?? "America/Sao_Paulo" }
      : { start: "00:00", end: "23:59", timezone: "America/Sao_Paulo" };
    return {
      name:                form.name,
      assistant_id:        form.assistant_id,
      phone_number_id:     form.phone_number_id,
      lead_list_id:        form.lead_list_id,
      concurrency:         parseInt(form.concurrency),
      max_attempts:        parseInt(form.max_attempts),
      retry_delay_minutes: parseInt(form.retry_delay_minutes ?? "30"),
      max_daily_attempts:  parseInt(form.max_daily_attempts ?? "0") || 0,
      webhook_url:         form.webhook_url?.trim() || null,
      avg_deal_value:      form.avg_deal_value ? parseFloat(form.avg_deal_value) || null : null,
      allowed_days:        allowedDays,
      allowed_time_window: allowedTimeWindow,
    };
  }

  async function saveQueue(id: string, form: Record<string, string>) {
    const payload = buildQueuePayload({ ...form, lead_list_id: queues.find((q) => q.id === id)?.lead_list_id ?? "" });
    const res  = await fetch(`/api/tenants/${tenantId}/queues/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.queue) {
      setQueues((prev) => prev.map((q) => q.id === id ? data.queue : q));
      showToast("Campanha atualizada!");
    } else {
      showToast(data.error ?? "Erro ao salvar", "error");
    }
  }

  async function deleteQueue(queue: Queue) {
    if (!confirm(`Deletar a campanha "${queue.name}"? Esta ação não pode ser desfeita.`)) return;
    const res  = await fetch(`/api/tenants/${tenantId}/queues/${queue.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setQueues((prev) => prev.filter((q) => q.id !== queue.id));
      showToast("Campanha deletada");
    } else {
      showToast(data.error ?? "Erro ao deletar", "error");
    }
  }

  async function queueAction(queueId: string, action: "start" | "pause" | "stop") {
    const res  = await fetch(`/api/tenants/${tenantId}/queues/${queueId}/${action}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Erro ao executar ação", "error");
    } else {
      showToast(
        action === "start" ? "Campanha iniciada!" :
        action === "pause" ? "Campanha pausada!" :
        "Campanha encerrada!"
      );
    }
    loadQueues();
  }

  async function duplicateQueue(queue: Queue) {
    const allowedDays = Array.isArray(queue.allowed_days) ? (queue.allowed_days as unknown as number[]) : [1, 2, 3, 4, 5];
    const tw = queue.allowed_time_window as { start?: string; end?: string; timezone?: string } | null;

    // 1. Criar nova lista de leads vazia (sem copiar os leads da original)
    const origListName = leadLists.find((l) => l.id === queue.lead_list_id)?.name ?? "Lista";
    const listRes = await fetch(`/api/tenants/${tenantId}/lead-lists`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${origListName} (cópia)` }),
    });
    const listData = await listRes.json();
    if (!listRes.ok || !listData.leadList) {
      showToast(listData.error ?? "Erro ao criar lista para cópia", "error");
      return;
    }

    // 2. Criar campanha duplicada apontando para a nova lista vazia
    const payload = {
      name:                `Cópia de ${queue.name}`,
      assistant_id:        queue.assistant_id,
      phone_number_id:     queue.phone_number_id,
      lead_list_id:        listData.leadList.id,
      concurrency:         queue.concurrency,
      max_attempts:        queue.max_attempts,
      retry_delay_minutes: queue.retry_delay_minutes ?? 30,
      webhook_url:         queue.webhook_url ?? null,
      allowed_days:        allowedDays,
      allowed_time_window: tw ?? { start: "09:00", end: "18:00", timezone: "America/Sao_Paulo" },
    };
    const res  = await fetch(`/api/tenants/${tenantId}/queues`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.queue) {
      setQueues((prev) => [data.queue, ...prev]);
      setLeadLists((prev) => [listData.leadList, ...prev]);
      showToast(`Campanha "${data.queue.name}" duplicada (sem leads). Use "Lista de Leads" para adicionar leads.`);
    } else {
      showToast(data.error ?? "Erro ao duplicar", "error");
    }
  }

  async function testWebhook(queueId: string) {
    setWebhookTesting((p) => ({ ...p, [queueId]: true }));
    setWebhookResults((p) => { const n = { ...p }; delete n[queueId]; return n; });
    try {
      const res  = await fetch(`/api/tenants/${tenantId}/queues/${queueId}/test-webhook`, { method: "POST" });
      const data = await res.json();
      setWebhookResults((p) => ({ ...p, [queueId]: data }));
    } catch {
      setWebhookResults((p) => ({ ...p, [queueId]: { ok: false, message: "Erro de rede ao testar webhook", status: null, elapsed_ms: 0 } }));
    } finally {
      setWebhookTesting((p) => ({ ...p, [queueId]: false }));
    }
  }

  async function diagnoseQueue(queueId: string) {
    setDiagnosing((p) => ({ ...p, [queueId]: true }));
    setDiagnoseResults((p) => ({ ...p, [queueId]: null }));
    try {
      const res  = await fetch(`/api/tenants/${tenantId}/queues/${queueId}/diagnose`);
      const data = await res.json();
      setDiagnoseResults((p) => ({ ...p, [queueId]: data }));
    } catch {
      setDiagnoseResults((p) => ({ ...p, [queueId]: { ok: false, issues: ["Erro de rede ao diagnosticar"], leads: { by_status: {}, ready_to_call: 0 }, time_window: { status: "no_restriction" }, vapi_key_configured: false } }));
    } finally {
      setDiagnosing((p) => ({ ...p, [queueId]: false }));
    }
  }

  const leadListName = (id: string) =>
    leadLists.find((l) => l.id === id)?.name ?? id.slice(0, 8) + "…";

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      setActiveTab((p) => ({ ...p, [id]: p[id] ?? "overview" }));
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Campanhas</h1>
          <p className="page-subtitle">Crie e gerencie campanhas de discagem automática</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {/* ── Skeleton ── */}
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
            <p className="empty-state-title">Nenhuma campanha criada</p>
            <p className="empty-state-desc">
              Crie sua primeira campanha, vincule um assistente Vapi e importe seus leads para iniciar a discagem automática.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Criar Primeira Campanha
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {queues.map((q) => {
            const prog      = progress[q.id];
            const statusCfg = STATUS_CONFIG[q.status] ?? { label: q.status, badge: "badge-gray" };
            const isExpanded = expandedId === q.id;
            const tab = activeTab[q.id] ?? "overview";

            return (
              <div key={q.id} className="card overflow-hidden hover:shadow-md transition-shadow">
                {/* ── Campaign header ── */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        <Megaphone className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{q.name}</h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                          <span>Lista: <span className="font-medium text-gray-700">{leadListName(q.lead_list_id)}</span></span>
                          <span className="text-gray-200">·</span>
                          <span>Concorrência: <span className="font-medium text-gray-700">{q.concurrency}</span></span>
                          <span className="text-gray-200">·</span>
                          <span>Tentativas: <span className="font-medium text-gray-700">{q.max_attempts}</span></span>
                          <span className="text-gray-200">·</span>
                          <span>Intervalo: <span className="font-medium text-gray-700">{q.retry_delay_minutes ?? 30}min</span></span>
                          {(() => {
                            const days = Array.isArray(q.allowed_days) ? (q.allowed_days as unknown as number[]) : [];
                            const tw = q.allowed_time_window as { start?: string; end?: string } | null;
                            if (days.length > 0 && tw?.start && tw?.end) {
                              const dl = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
                              return (
                                <>
                                  <span className="text-gray-200">·</span>
                                  <span>{days.map((d) => dl[d]).join(" ")} {tw.start}–{tw.end}</span>
                                </>
                              );
                            }
                            return null;
                          })()}
                          {isAdmin && q.webhook_url && (
                            <>
                              <span className="text-gray-200">·</span>
                              <span className="text-emerald-600 flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> Webhook ativo
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-sm">{q.assistant_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={statusCfg.badge}>{statusCfg.label}</span>

                      <button onClick={() => setEditingQueue(q)} className="btn-icon text-gray-400 hover:text-indigo-600" title="Editar campanha">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {(q.status === "draft" || q.status === "stopped") && (
                        <button onClick={() => deleteQueue(q)} className="btn-icon text-gray-400 hover:text-red-500" title="Deletar campanha">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Banner de erro de configuração (ex: assistente/número deletado no Vapi) */}
                  {q.last_error && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800">Campanha pausada automaticamente por erro de configuração</p>
                        <p className="text-xs text-amber-700 mt-0.5">{q.last_error}</p>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {prog && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>
                          <span className="font-semibold text-gray-700">{prog.done}</span>/{prog.total} concluídos
                          <span className="ml-1 text-indigo-600 font-medium">({prog.progressPct}%)</span>
                        </span>
                        {prog.calling > 0 && (
                          <span className="text-amber-600 font-medium">{prog.calling} em ligação agora</span>
                        )}
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${prog.progressPct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Lista esgotada banner */}
                  {prog && prog.total > 0 && prog.pending === 0 && prog.calling === 0 && (q.status === "running" || q.status === "paused") && (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-amber-800">Todos os leads já foram contatados</p>
                          <p className="text-xs text-amber-600">Adicione mais leads para continuar ou encerre a campanha.</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => { setExpandedId(q.id); setActiveTab((p) => ({ ...p, [q.id]: "leads" })); }}
                          className="btn btn-sm bg-amber-100 text-amber-800 hover:bg-amber-200">
                          <UserPlus className="w-3.5 h-3.5" /> Adicionar leads
                        </button>
                        <button onClick={() => queueAction(q.id, "stop")}
                          className="btn btn-sm bg-red-100 text-red-700 hover:bg-red-200">
                          <Square className="w-3.5 h-3.5" /> Encerrar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {q.status === "draft" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
                        <Play className="w-3.5 h-3.5" /> Iniciar
                      </button>
                    )}
                    {q.status === "running" && (
                      <button onClick={() => queueAction(q.id, "pause")}
                        className="btn btn-sm bg-amber-500 text-white hover:bg-amber-600"
                        title="Pausa temporariamente — os leads ficam na fila e a campanha pode ser retomada depois">
                        <Pause className="w-3.5 h-3.5" /> Pausar
                      </button>
                    )}
                    {q.status === "paused" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
                        <Play className="w-3.5 h-3.5" /> Retomar
                      </button>
                    )}
                    {q.status === "stopped" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700">
                        <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
                      </button>
                    )}
                    {(q.status === "running" || q.status === "paused") && (
                      <button onClick={() => queueAction(q.id, "stop")}
                        className="btn btn-sm bg-red-100 text-red-700 hover:bg-red-200"
                        title="Encerra a campanha definitivamente — para reiniciar será necessário criar uma nova campanha">
                        <Square className="w-3.5 h-3.5" /> Encerrar
                      </button>
                    )}
                    <button onClick={() => duplicateQueue(q)}
                      className="btn btn-sm bg-gray-100 text-gray-700 hover:bg-gray-200">
                      <Copy className="w-3.5 h-3.5" /> Duplicar
                    </button>
                    <button onClick={() => diagnoseQueue(q.id)} disabled={diagnosing[q.id]}
                      className="btn btn-sm bg-gray-100 text-gray-700 hover:bg-gray-200">
                      {diagnosing[q.id]
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Stethoscope className="w-3.5 h-3.5" />}
                      Diagnosticar
                    </button>
                    {/* Expand/collapse */}
                    <button onClick={() => toggleExpand(q.id)}
                      className="btn btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ml-auto flex items-center gap-1.5">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? "Fechar" : "Ver detalhes"}
                    </button>
                  </div>
                </div>

                {/* ── Expanded section with tabs ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Tab bar */}
                    <div className="flex border-b border-gray-100 bg-gray-50/80">
                      {[
                        { key: "overview", label: "Visão Geral" },
                        { key: "leads",    label: "Leads" },
                      ].map(({ key, label }) => (
                        <button key={key}
                          onClick={() => setActiveTab((p) => ({ ...p, [q.id]: key as "overview" | "leads" }))}
                          className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                            tab === key
                              ? "text-indigo-600 border-indigo-500 bg-white"
                              : "text-gray-500 border-transparent hover:text-gray-700"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Tab: Visão Geral */}
                    {tab === "overview" && (
                      <div className="p-5 space-y-4">
                        {/* Summary stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-1">Status</p>
                            <span className={statusCfg.badge}>{statusCfg.label}</span>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-1">Ligações atendidas</p>
                            <p className="text-xl font-bold text-emerald-600">{prog?.byStatus?.completed ?? 0}</p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-1">Não atendidas</p>
                            <p className="text-xl font-bold text-red-500">{prog?.byStatus?.failed ?? 0}</p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-xs text-gray-400 mb-1">Falta ligar para</p>
                            <p className="text-xl font-bold text-indigo-600">{prog?.pending ?? "—"}</p>
                          </div>
                        </div>

                        {/* Webhook — visível apenas para SuperAdmin */}
                        {isAdmin && q.webhook_url && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-xs text-gray-500 font-mono truncate flex-1">{q.webhook_url}</span>
                              <button onClick={() => testWebhook(q.id)} disabled={webhookTesting[q.id]}
                                className="btn btn-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 shrink-0">
                                {webhookTesting[q.id]
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Zap className="w-3.5 h-3.5" />}
                                {webhookTesting[q.id] ? "Testando…" : "Testar"}
                              </button>
                            </div>
                            {webhookResults[q.id] && (
                              <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                                webhookResults[q.id].ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                              }`}>
                                {webhookResults[q.id].ok
                                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                                <span>
                                  {webhookResults[q.id].message}
                                  {webhookResults[q.id].elapsed_ms > 0 && (
                                    <span className="opacity-60 ml-1">({webhookResults[q.id].elapsed_ms}ms)</span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Diagnose results */}
                        {diagnoseResults[q.id] && (() => {
                          const d = diagnoseResults[q.id]!;
                          return (
                            <div className={`rounded-xl border px-3 py-3 space-y-2 text-xs ${d.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                              <div className="flex items-center gap-2 font-semibold">
                                {d.ok
                                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Tudo certo — pronto para discar</span></>
                                  : <><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700">{d.issues.length} problema(s) detectado(s)</span></>}
                              </div>
                              {d.issues.length > 0 && (
                                <ul className="space-y-1">
                                  {d.issues.map((issue, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-amber-800">
                                      <Ban className="w-3 h-3 shrink-0 mt-0.5" />{issue}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="flex gap-4 flex-wrap pt-1 border-t border-amber-200/60">
                                <span className="flex items-center gap-1 text-gray-600">
                                  <Users className="w-3 h-3" /> Prontos: <strong>{d.leads.ready_to_call}</strong>
                                </span>
                                {Object.entries(d.leads.by_status).map(([s, c]) => (
                                  <span key={s} className="text-gray-500">{s}: {c}</span>
                                ))}
                                {d.time_window.now_in_tz && (
                                  <span className="flex items-center gap-1 text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    {d.time_window.now_in_tz} ({d.time_window.timezone}) — janela: {d.time_window.window_start}–{d.time_window.window_end}
                                    {d.time_window.status === "blocked_day"  && <span className="text-red-600 font-semibold ml-1">DIA BLOQUEADO</span>}
                                    {d.time_window.status === "blocked_hour" && <span className="text-red-600 font-semibold ml-1">FORA DO HORÁRIO</span>}
                                    {d.time_window.status === "allowed"      && <span className="text-emerald-600 font-semibold ml-1">✓</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Empty overview */}
                        {!(isAdmin && q.webhook_url) && !diagnoseResults[q.id] && (
                          <p className="text-sm text-gray-400 text-center py-4">
                            Use o botão <strong>Diagnosticar</strong> para verificar o estado desta campanha.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tab: Leads */}
                    {tab === "leads" && (
                      <LeadsTab tenantId={tenantId} queue={q} leadListName={leadListName(q.lead_list_id)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Campaign Wizard ── */}
      {showCreate && (
        <CampaignWizard
          leadLists={leadLists}
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            loadQueues();
            fetch(`/api/tenants/${tenantId}/lead-lists`).then((r) => r.json()).then((d) => setLeadLists(d.leadLists ?? []));
            showToast("Campanha criada com sucesso!");
            setShowCreate(false);
          }}
          vapiResources={vapiResources}
          vapiLoading={vapiLoading}
          isAdmin={isAdmin}
        />
      )}

      {/* ── Edit Modal ── */}
      {editingQueue && (
        <EditCampaignModal
          queue={editingQueue}
          leadLists={leadLists}
          onClose={() => setEditingQueue(null)}
          onSave={saveQueue}
          vapiResources={vapiResources}
          vapiLoading={vapiLoading}
          isAdmin={isAdmin}
        />
      )}

      {/* ── Toasts ── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success"
              ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
