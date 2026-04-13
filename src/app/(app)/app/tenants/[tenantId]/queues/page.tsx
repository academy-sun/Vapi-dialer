"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, Play, Pause, Square, RotateCcw, Copy, Check, AlertTriangle,
  Loader2, X, Pencil, Trash2, Users, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Link2, Zap, CheckCircle2, XCircle,
  Stethoscope, Clock, Ban, Braces, Upload, ChevronDown, ChevronUp,
  ArrowRight, FileText, Settings2, Megaphone, Phone, Search, Webhook,
  UserPlus, AlertCircle, LayoutGrid,
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
  call_records?: { id: string; duration_seconds: number; ended_reason: string }[];
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

const LEAD_STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  new:               { label: "Novo",             badge: "badge-blue"   },
  queued:            { label: "Aguardando",        badge: "badge-purple" },
  calling:           { label: "Em ligação",        badge: "badge-yellow" },
  completed:         { label: "Concluído",         badge: "badge-green"  },
  failed:            { label: "Falhou",            badge: "badge-red"    },
  doNotCall:         { label: "Não ligar",         badge: "badge-gray"   },
  callbackScheduled: { label: "Callback agendado", badge: "badge-purple" },
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Concurrency / attempts / retry */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <div>
          <label className="form-label">Concorrência</label>
          <input className="form-input" type="number" min="1" max="5"
            value={form.concurrency}
            onChange={(e) => update("concurrency", String(Math.min(5, Math.max(1, parseInt(e.target.value) || 1))))} />
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>Máx. 5 por campanha</p>
        </div>
        <div>
          <label className="form-label">Máx. tentativas</label>
          <input className="form-input" type="number" min="1" max="10"
            value={form.max_attempts} onChange={(e) => update("max_attempts", e.target.value)} />
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>Por lead (total)</p>
        </div>
        <div>
          <label className="form-label">Intervalo</label>
          <div style={{ position: "relative" }}>
            <input className="form-input" type="number" min="1"
              style={{ paddingRight: "48px" }}
              value={form.retry_delay_minutes ?? "30"}
              onChange={(e) => update("retry_delay_minutes", e.target.value)} />
            <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "var(--text-3)", pointerEvents: "none" }}>min</span>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>Entre tentativas</p>
        </div>
      </div>

      {/* Daily attempt limit */}
      <div>
        <label className="form-label">Limite de tentativas por dia</label>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input className="form-input" type="number" min="1" max="10"
            style={{ width: "112px" }}
            value={form.max_daily_attempts ?? "3"}
            onChange={(e) => update("max_daily_attempts", String(Math.min(10, Math.max(1, parseInt(e.target.value) || 1))))} />
          <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
            Por lead por dia (1–10). Leads que atingirem o limite são
            reagendados para o próximo dia dentro da janela de horário.
          </p>
        </div>
      </div>

      {/* Ticket médio para cálculo de ROI no Dossiê */}
      <div>
        <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          Ticket Médio de Conversão
          <span style={{ marginLeft: "4px", fontSize: "11px", fontWeight: 400, color: "var(--text-3)" }}>(opcional)</span>
        </label>
        <div style={{ position: "relative", width: "192px" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "var(--text-3)", pointerEvents: "none" }}>R$</span>
          <input
            className="form-input"
            style={{ paddingLeft: "32px" }}
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={form.avg_deal_value ?? ""}
            onChange={(e) => update("avg_deal_value", e.target.value)}
          />
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>
          Usado no Dossiê para calcular oportunidades não trabalhadas
        </p>
      </div>

      {/* Time window */}
      <div className="gc" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>Horário de ligações</label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={noRestriction}
              onChange={(e) => update("allowed_days", e.target.checked ? "" : "1,2,3,4,5")}
              style={{ borderRadius: "4px" }} />
            Sem restrição (24h / 7 dias)
          </label>
        </div>
        {!noRestriction && (
          <>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {DAYS_CONFIG.map((d) => (
                <button key={d.iso} type="button" onClick={() => toggleDay(d.iso)}
                  className={selectedDays.includes(d.iso) ? "cx-filter-btn" : "cx-filter-btn"}
                  style={selectedDays.includes(d.iso)
                    ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" }
                    : {}
                  }>
                  {d.label}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label className="form-label" style={{ fontSize: "11px" }}>Início</label>
                <input type="time" className="form-input" style={{ fontSize: "13px" }} value={form.time_start ?? "09:00"}
                  onChange={(e) => update("time_start", e.target.value)} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "11px" }}>Fim</label>
                <input type="time" className="form-input" style={{ fontSize: "13px" }} value={form.time_end ?? "18:00"}
                  onChange={(e) => update("time_end", e.target.value)} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "11px" }}>Fuso horário</label>
                <select className="cx-select" style={{ width: "100%", fontSize: "13px" }} value={form.timezone ?? "America/Sao_Paulo"}
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

      <div>
        <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Link2 style={{ width: "14px", height: "14px", color: "var(--text-3)" }} />
          Webhook de saída (opcional)
        </label>
        <input className="form-input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}
          placeholder="https://seu-n8n.com/webhook/xxx"
          value={form.webhook_url ?? ""}
          onChange={(e) => update("webhook_url", e.target.value)} />
        <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>
          POST automático com resultado de cada chamada (n8n, Zapier, Make…)
        </p>
      </div>
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
    <div className="modal-overlay" style={{ alignItems: "flex-start", paddingTop: "40px", paddingBottom: "32px", paddingLeft: "16px", paddingRight: "16px" }}>
      <div className="modal" style={{ maxWidth: "42rem", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--glass-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "var(--red-lo)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Megaphone style={{ width: "16px", height: "16px", color: "var(--red)" }} />
            </div>
            <div>
              <h2 style={{ fontWeight: 700, color: "var(--text-1)", fontSize: "15px" }}>Nova Campanha</h2>
              <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                {step === 1 ? "Configurar campanha" : step === 2 ? "Adicionar leads" : "Revisar e criar"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid var(--glass-border)", flexShrink: 0 }}>
          {[{ n: 1, label: "Configurar" }, { n: 2, label: "Leads" }, { n: 3, label: "Revisar" }].map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: step === s.n ? "var(--red)" : step > s.n ? "var(--green)" : "var(--text-3)" }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700,
                  border: `2px solid ${step > s.n ? "var(--green)" : step === s.n ? "var(--red)" : "var(--glass-border)"}`,
                  background: step > s.n ? "rgba(0,214,143,0.12)" : step === s.n ? "var(--red-lo)" : "transparent",
                }}>
                  {step > s.n ? <Check style={{ width: "12px", height: "12px" }} /> : s.n}
                </div>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>{s.label}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: "2px", margin: "0 12px", background: step > s.n ? "var(--green)" : "var(--glass-border)" }} />}
            </div>
          ))}
        </div>

        {/* Content (scrollable) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* ── Step 1: Configure ─────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label className="form-label">Nome da Campanha *</label>
                <input className="form-input" placeholder="Ex: Prospecção Janeiro 2026"
                  value={form.name} onChange={(e) => updateForm("name", e.target.value)} autoFocus />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    Assistente Vapi *
                    {vapiLoading && <Loader2 style={{ width: "12px", height: "12px", color: "var(--red)", animation: "cx-spin .8s linear infinite" }} />}
                  </label>
                  {vapiResources && vapiResources.assistants.length > 0 ? (
                    <select className="cx-select" style={{ width: "100%" }} value={form.assistant_id}
                      onChange={(e) => updateForm("assistant_id", e.target.value)}>
                      <option value="">Selecionar assistente…</option>
                      {vapiResources.assistants.map((a) => (
                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}
                      placeholder={vapiLoading ? "Carregando…" : "asst_xxx (cole o ID)"}
                      value={form.assistant_id} onChange={(e) => updateForm("assistant_id", e.target.value)} />
                  )}
                  {form.assistant_id && (
                    <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.assistant_id}</p>
                  )}
                </div>
                <div>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    Número de Telefone *
                    {vapiLoading && <Loader2 style={{ width: "12px", height: "12px", color: "var(--red)", animation: "cx-spin .8s linear infinite" }} />}
                  </label>
                  {vapiResources && vapiResources.phoneNumbers.length > 0 ? (
                    <select className="cx-select" style={{ width: "100%" }} value={form.phone_number_id}
                      onChange={(e) => updateForm("phone_number_id", e.target.value)}>
                      <option value="">Selecionar número…</option>
                      {vapiResources.phoneNumbers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number ? `${p.number}${p.name ? ` — ${p.name}` : ""}` : (p.name || p.id)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }}
                      placeholder={vapiLoading ? "Carregando…" : "pn_xxx (cole o ID)"}
                      value={form.phone_number_id} onChange={(e) => updateForm("phone_number_id", e.target.value)} />
                  )}
                  {form.phone_number_id && (
                    <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.phone_number_id}</p>
                  )}
                </div>
              </div>

              {/* Advanced settings (collapsible) */}
              <div className="gc" style={{ overflow: "hidden" }}>
                <button type="button" onClick={() => setShowAdvanced((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "var(--text-1)", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Settings2 style={{ width: "16px", height: "16px", color: "var(--text-3)" }} />
                    Configurações avançadas
                    <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-3)" }}>
                      (concorrência, horários, webhook…)
                    </span>
                  </span>
                  {showAdvanced ? <ChevronUp style={{ width: "16px", height: "16px", color: "var(--text-3)" }} /> : <ChevronDown style={{ width: "16px", height: "16px", color: "var(--text-3)" }} />}
                </button>
                {showAdvanced && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--glass-border)" }}>
                    <div style={{ paddingTop: "16px" }}>
                      <AdvancedConfigFields form={form} update={updateForm} isAdmin={isAdmin} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Leads ─────────────────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13px", color: "var(--text-2)" }}>Escolha a lista de leads que será vinculada a esta campanha:</p>

              {/* Existing list */}
              {leadLists.length === 0 ? (
                <div className="gc" style={{ textAlign: "center", padding: "32px", border: "1px dashed var(--glass-border)" }}>
                  <Users style={{ width: "32px", height: "32px", color: "var(--text-3)", margin: "0 auto 8px" }} />
                  <p style={{ fontSize: "13px", color: "var(--text-2)" }}>Nenhuma lista de leads criada ainda.</p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>Acesse &quot;Listas de Leads&quot; no menu para criar uma nova.</p>
                </div>
              ) : (
                <div>
                  <label className="form-label">Selecionar lista *</label>
                  <select className="cx-select" style={{ width: "100%" }} value={selectedListId}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="gc" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>Resumo da Campanha</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                  {[
                    { icon: Megaphone, color: "var(--red-lo)", iconColor: "var(--red)", label: "Campanha", value: form.name },
                    { icon: Zap, color: "rgba(168,85,247,0.12)", iconColor: "var(--purple)", label: "Assistente", value: selectedAssistant?.name || form.assistant_id.slice(0, 20) + "…", mono: true },
                    { icon: ArrowRight, color: "rgba(0,214,143,0.12)", iconColor: "var(--green)", label: "Número", value: selectedPhone?.number || selectedPhone?.name || form.phone_number_id.slice(0, 20) + "…", mono: true },
                    { icon: Users, color: "rgba(0,194,255,0.12)", iconColor: "var(--cyan)", label: "Lista de leads", value: selectedList?.name ?? "—" },
                  ].map(({ icon: Icon, color, iconColor, label, value, mono }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: color }}>
                        <Icon style={{ width: "12px", height: "12px", color: iconColor }} />
                      </div>
                      <span style={{ color: "var(--text-2)", width: "112px", flexShrink: 0 }}>{label}</span>
                      <span style={{ fontWeight: 700, color: "var(--text-1)", ...(mono ? { fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" } : {}) }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "12px", display: "flex", gap: "16px", fontSize: "11px", color: "var(--text-2)", flexWrap: "wrap" }}>
                  <span>Concorrência: <strong style={{ color: "var(--text-1)" }}>{form.concurrency}</strong></span>
                  <span>Tentativas: <strong style={{ color: "var(--text-1)" }}>{form.max_attempts}</strong></span>
                  <span>Intervalo: <strong style={{ color: "var(--text-1)" }}>{form.retry_delay_minutes}min</strong></span>
                </div>
              </div>

              {/* Start immediately toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}>
                <div onClick={() => setStartImmediately((v) => !v)}
                  style={{ position: "relative", width: "40px", height: "20px", borderRadius: "999px", transition: "background .2s", flexShrink: 0, cursor: "pointer", background: startImmediately ? "var(--green)" : "var(--glass-bg-2)" }}>
                  <div style={{ position: "absolute", top: "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "transform .2s", transform: startImmediately ? "translateX(20px)" : "translateX(2px)" }} />
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>Iniciar campanha imediatamente</p>
                  <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
                    {startImmediately ? "Vai começar a discar assim que criada" : "Ficará em rascunho — inicie manualmente"}
                  </p>
                </div>
              </label>

              {error && (
                <div className="alert-error">
                  <AlertTriangle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid var(--glass-border)", flexShrink: 0 }}>
          <button type="button"
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
            className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {step === 1 ? "Cancelar" : <><ChevronLeft style={{ width: "16px", height: "16px" }} /> Voltar</>}
          </button>
          {step < 3 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 ? !step1Valid : !step2Valid}
              className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              Próximo <ArrowRight style={{ width: "16px", height: "16px" }} />
            </button>
          ) : (
            <button type="button" onClick={handleCreate} disabled={creating}
              className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {creating
                ? <><Loader2 style={{ width: "16px", height: "16px", animation: "cx-spin .8s linear infinite" }} /> Criando…</>
                : startImmediately
                  ? <><Play style={{ width: "16px", height: "16px" }} /> Criar e Iniciar</>
                  : <><Check style={{ width: "16px", height: "16px" }} /> Criar Campanha</>}
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
    <div className="modal-overlay" style={{ alignItems: "flex-start", paddingTop: "40px", paddingBottom: "32px", paddingLeft: "16px", paddingRight: "16px" }}>
      <div className="modal" style={{ maxWidth: "42rem", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--glass-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "var(--red-lo)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Pencil style={{ width: "16px", height: "16px", color: "var(--red)" }} />
            </div>
            <h2 style={{ fontWeight: 700, color: "var(--text-1)", fontSize: "15px" }}>Editar Campanha</h2>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: "16px", height: "16px" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Name */}
            <div>
              <label className="form-label">Nome da Campanha</label>
              <input className="form-input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </div>

            {/* Assistant + Phone */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  Assistente Vapi
                  {vapiLoading && <Loader2 style={{ width: "12px", height: "12px", color: "var(--red)", animation: "cx-spin .8s linear infinite" }} />}
                </label>
                {vapiResources && vapiResources.assistants.length > 0 ? (
                  <select className="cx-select" style={{ width: "100%" }} value={form.assistant_id} onChange={(e) => update("assistant_id", e.target.value)} required>
                    <option value="">Selecionar…</option>
                    {vapiResources.assistants.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }} value={form.assistant_id}
                    onChange={(e) => update("assistant_id", e.target.value)} required />
                )}
                {form.assistant_id && (
                  <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.assistant_id}</p>
                )}
              </div>
              <div>
                <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  Número de Telefone
                  {vapiLoading && <Loader2 style={{ width: "12px", height: "12px", color: "var(--red)", animation: "cx-spin .8s linear infinite" }} />}
                </label>
                {vapiResources && vapiResources.phoneNumbers.length > 0 ? (
                  <select className="cx-select" style={{ width: "100%" }} value={form.phone_number_id} onChange={(e) => update("phone_number_id", e.target.value)} required>
                    <option value="">Selecionar…</option>
                    {vapiResources.phoneNumbers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number ? `${p.number}${p.name ? ` — ${p.name}` : ""}` : (p.name || p.id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px" }} value={form.phone_number_id}
                    onChange={(e) => update("phone_number_id", e.target.value)} required />
                )}
                {form.phone_number_id && (
                  <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.phone_number_id}</p>
                )}
              </div>
            </div>

            <AdvancedConfigFields form={form} update={update} isAdmin={isAdmin} />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid var(--glass-border)", flexShrink: 0 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {loading ? <><Loader2 style={{ width: "16px", height: "16px", animation: "cx-spin .8s linear infinite" }} /> Salvando…</> : <><Check style={{ width: "16px", height: "16px" }} /> Salvar</>}
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

  const [filters, setFilters] = useState({
    status: "", attempts: "", answered: "", scheduled: "", duration: ""
  });

  const limit = 20;

  const loadLeads = useCallback(async (p: number, q?: string) => {
    setLoading(true);
    const s = q !== undefined ? q : search;
    const qs = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (s) qs.set("search", s);
    if (filters.status) qs.set("status", filters.status);
    if (filters.attempts) qs.set("attempt_count", filters.attempts);
    if (filters.answered) qs.set("answered", filters.answered);
    if (filters.scheduled) qs.set("scheduled", filters.scheduled);
    if (filters.duration) qs.set("min_duration", filters.duration);
    
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${queue.lead_list_id}/leads?${qs}`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [tenantId, queue.lead_list_id, search, filters]);

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
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: "11px", color: "var(--text-2)" }}>
            Lista: <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{leadListName}</span> · <strong>{total}</strong> leads
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* LiquidJS vars */}
            <button onClick={() => setShowVars((v) => !v)}
              title="Variáveis LiquidJS"
              className="btn-icon"
              style={showVars ? { color: "var(--red)", background: "var(--red-lo)" } : {}}>
              <Braces style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ position: "relative" }}>
          <Search style={{ width: "14px", height: "14px", color: "var(--text-3)", position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar por telefone, nome ou campo…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="form-input"
            style={{ paddingLeft: "32px", fontSize: "13px" }}
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); handleSearchChange(""); }}
              className="btn-icon"
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", padding: "2px" }}>
              <X style={{ width: "14px", height: "14px" }} />
            </button>
          )}
        </div>
      </div>

      {/* LiquidJS variables */}
      {showVars && (
        <div style={{ padding: "12px 20px", background: "rgba(168,85,247,0.08)", borderBottom: "1px solid rgba(168,85,247,0.2)" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--purple)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Braces style={{ width: "14px", height: "14px" }} />
            Variáveis disponíveis no assistente Vapi (LiquidJS)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {liquidVars.map((v) => (
              <code key={v}
                className="mono"
                style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: "var(--glass-bg-2)", border: "1px solid rgba(168,85,247,0.25)", color: "var(--purple)", cursor: "pointer" }}
                title={`Clique para copiar: {{${v}}}`}
                onClick={() => navigator.clipboard?.writeText(`{{${v}}}`)}>
                {`{{${v}}}`}
              </code>
            ))}
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>Clique numa variável para copiar · Use no prompt do assistente Vapi</p>
        </div>
      )}

      {/* Filters bar */}
      <div style={{ padding: "12px 20px", display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: "1px solid var(--glass-border)", background: "var(--app-bg)" }}>
        <select className="cx-select" style={{ fontSize: "12px", padding: "4px 8px", height: "auto" }} value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
          <option value="">Status (Todos)</option>
          <option value="new">Novo</option>
          <option value="queued">Aguardando</option>
          <option value="calling">Em ligação</option>
          <option value="completed">Concluído</option>
          <option value="failed">Falhou</option>
        </select>
        <select className="cx-select" style={{ fontSize: "12px", padding: "4px 8px", height: "auto" }} value={filters.attempts} onChange={e => { setFilters(f => ({ ...f, attempts: e.target.value })); setPage(1); }}>
          <option value="">Nº Tentativas (Últ/Qte)</option>
          <option value="0">0 tentativa</option>
          <option value="1">1 tentativa</option>
          <option value="2">2 tentativas</option>
          <option value="3">3 tentativas</option>
          <option value="4">4 tentativas</option>
        </select>
        <select className="cx-select" style={{ fontSize: "12px", padding: "4px 8px", height: "auto" }} value={filters.answered} onChange={e => { setFilters(f => ({ ...f, answered: e.target.value })); setPage(1); }}>
          <option value="">Atendido? (Ambos)</option>
          <option value="yes">Sim</option>
          <option value="no">Não</option>
        </select>
        <select className="cx-select" style={{ fontSize: "12px", padding: "4px 8px", height: "auto" }} value={filters.scheduled} onChange={e => { setFilters(f => ({ ...f, scheduled: e.target.value })); setPage(1); }}>
          <option value="">Próx. Tentativa agendada? (Ambos)</option>
          <option value="yes">Sim</option>
          <option value="no">Não (em branco)</option>
        </select>
        <select className="cx-select" style={{ fontSize: "12px", padding: "4px 8px", height: "auto" }} value={filters.duration} onChange={e => { setFilters(f => ({ ...f, duration: e.target.value })); setPage(1); }}>
          <option value="">Duração (Qualquer)</option>
          <option value="15">&gt; 15 segs</option>
          <option value="30">&gt; 30 segs</option>
          <option value="60">&gt; 1 min</option>
          <option value="120">&gt; 2 min</option>
        </select>
        {(filters.status || filters.attempts || filters.answered || filters.scheduled || filters.duration) && (
          <button onClick={() => { setFilters({ status: "", attempts: "", answered: "", scheduled: "", duration: "" }); setPage(1); }} className="btn-icon" style={{ fontSize: "11px", padding: "2px 6px" }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="cx-loading" style={{ height: "128px" }}>
          <div className="cx-spinner" />
          Carregando leads…
        </div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: "48px 16px", fontSize: "13px" }}>
          {search ? (
            <>Nenhum lead encontrado para &ldquo;<strong>{search}</strong>&rdquo;.</>
          ) : (
            <>
              Nenhum lead nesta lista.
            </>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="cx-table">
            <thead>
              <tr>
                <th>Telefone</th>
                <th>Nome</th>
                <th>Status</th>
                <th style={{ textAlign: "center" }}>Tent.</th>
                <th style={{ textAlign: "center" }}>Atendido?</th>
                <th>Próx. tentativa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const sc   = LEAD_STATUS_CONFIG[lead.status] ?? { label: lead.status, badge: "badge-gray" };
                const dj   = lead.data_json ?? {};
                const name = dj.first_name ?? dj.nome ?? dj.name ?? dj.Name ?? dj.Nome ?? dj.full_name ?? dj.fullName ?? dj.cliente ?? dj.contact ?? "";
                return (
                  <tr key={lead.id}>
                    <td className="mono" style={{ fontSize: "12px" }}>
                      <Link href={`/app/tenants/${tenantId}/calls?phone=${encodeURIComponent(lead.phone_e164)}`} title="Ver chamadas do número" style={{ color: "var(--cyan)", textDecoration: "none" }} className="hover:underline">
                        {lead.phone_e164}
                      </Link>
                    </td>
                    <td style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                    <td>
                      <span className={sc.badge}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "center", fontSize: "12px" }}>{lead.attempt_count}</td>
                    <td style={{ textAlign: "center" }}>
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
                        if (ANSWERED.has(outcome)) {
                          const calls = lead.call_records ?? [];
                          const maxDuration = calls.length > 0 ? Math.max(...calls.map(c => c.duration_seconds)) : 0;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                              <CheckCircle2 style={{ width: "16px", height: "16px", color: "var(--green)" }} title="Atendido" />
                              {maxDuration > 0 && <span style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "2px" }}>{(maxDuration / 60 >= 1) ? Math.floor(maxDuration / 60) + 'm ' + (maxDuration % 60) + 's' : maxDuration + 's'}</span>}
                            </div>
                          );
                        }
                        if (NO_ANSWER.has(outcome) || outcome.startsWith("sip-") || outcome.startsWith("pipeline-error")) return <XCircle style={{ width: "16px", height: "16px", color: "var(--text-3)", display: "inline-block" }} title="Não atendido" />;
                        return <span style={{ color: "var(--text-3)" }}>—</span>;
                      })()}
                    </td>
                    <td style={{ fontSize: "12px" }}>
                      {lead.next_attempt_at ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock style={{ width: "12px", height: "12px", color: "var(--purple)", flexShrink: 0 }} />
                          {new Date(lead.next_attempt_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "var(--text-3)" }}>—</span>
                          {lead.status === "failed" && lead.last_outcome && (
                            <span title={`Não tentará novamente.\nÚltimo erro: ${lead.last_outcome}`} style={{ cursor: "help", display: "inline-flex", background: "var(--glass-bg-2)", padding: "2px", borderRadius: "50%" }}>
                              <AlertCircle style={{ width: "12px", height: "12px", color: "var(--red)" }} />
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right", padding: "8px" }}>
                      {lead.status !== "doNotCall" && lead.status !== "completed" && (
                        <button
                          onClick={() => removeLead(lead)}
                          disabled={removingId === lead.id}
                          title="Remover da campanha (não será mais discado)"
                          className="btn-icon"
                          style={{ width: "24px", height: "24px" }}
                        >
                          {removingId === lead.id
                            ? <Loader2 style={{ width: "14px", height: "14px", animation: "cx-spin .8s linear infinite" }} />
                            : <Ban style={{ width: "14px", height: "14px" }} />}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid var(--glass-border)", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button onClick={() => goToPage(1)} disabled={page === 1} className="btn-icon" style={{ width: "28px", height: "28px", opacity: page === 1 ? 0.3 : 1 }} title="Primeira">
              <ChevronsLeft style={{ width: "14px", height: "14px" }} />
            </button>
            <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="btn-icon" style={{ width: "28px", height: "28px", opacity: page === 1 ? 0.3 : 1 }} title="Anterior">
              <ChevronLeft style={{ width: "14px", height: "14px" }} />
            </button>
          </div>
          <div className="mono" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-2)" }}>
            <span>Página</span>
            <input type="number" min={1} max={totalPages} value={pageInput}
              onChange={(e) => setPageInput(e.target.value)} onBlur={handlePageBlur} onKeyDown={handlePageKey}
              className="form-input"
              style={{ width: "48px", textAlign: "center", padding: "4px", fontSize: "11px", fontWeight: 600 }} />
            <span>de {totalPages}</span>
            <span style={{ color: "var(--text-3)" }}>·</span>
            <span>{total} leads</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="btn-icon" style={{ width: "28px", height: "28px", opacity: page === totalPages ? 0.3 : 1 }} title="Próxima">
              <ChevronRight style={{ width: "14px", height: "14px" }} />
            </button>
            <button onClick={() => goToPage(totalPages)} disabled={page === totalPages} className="btn-icon" style={{ width: "28px", height: "28px", opacity: page === totalPages ? 0.3 : 1 }} title="Última">
              <ChevronsRight style={{ width: "14px", height: "14px" }} />
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
        <button onClick={() => setShowCreate(true)} className="cx-refresh-btn">
          <Plus style={{ width: "16px", height: "16px" }} />
          Nova Campanha
        </button>
      </div>

      {/* ── Skeleton ── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="gc" style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div className="skeleton" style={{ height: "20px", width: "192px" }} />
                <div className="skeleton" style={{ height: "20px", width: "80px", borderRadius: "999px" }} />
              </div>
              <div className="skeleton" style={{ height: "12px", width: "256px", marginBottom: "12px" }} />
              <div className="skeleton" style={{ height: "8px", width: "100%", borderRadius: "999px" }} />
            </div>
          ))}
        </div>
      ) : queues.length === 0 ? (
        <div className="gc">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" style={{ width: "100%", height: "100%" }}>
                <rect x="10" y="10" width="44" height="10" rx="3" fill="rgba(232,0,45,0.15)" />
                <rect x="10" y="26" width="44" height="10" rx="3" fill="rgba(232,0,45,0.25)" />
                <rect x="10" y="42" width="30" height="10" rx="3" fill="rgba(168,85,247,0.2)" />
                <circle cx="52" cy="47" r="10" fill="var(--red)" />
                <path d="M48.5 47l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="empty-state-title">Nenhuma campanha criada</p>
            <p className="empty-state-desc">
              Crie sua primeira campanha, vincule um assistente Vapi e importe seus leads para iniciar a discagem automática.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus style={{ width: "16px", height: "16px" }} />
              Criar Primeira Campanha
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {queues.map((q) => {
            const prog      = progress[q.id];
            const statusCfg = STATUS_CONFIG[q.status] ?? { label: q.status, badge: "badge-gray" };
            const isExpanded = expandedId === q.id;
            const tab = activeTab[q.id] ?? "overview";

            return (
              <div key={q.id} className="gc" style={{ overflow: "hidden", transition: "box-shadow .2s" }}>
                {/* ── Campaign header ── */}
                <div style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--red-lo)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Megaphone style={{ width: "20px", height: "20px", color: "var(--red)" }} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h3 style={{ fontWeight: 700, color: "var(--text-1)", fontSize: "15px" }}>{q.name}</h3>
                          <Link
                            href={`/app/tenants/${tenantId}/queues/${q.id}/kanban`}
                            title="Ver Kanban de Cadência"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "var(--cyan)",
                              background: "rgba(0,194,255,0.10)",
                              border: "1px solid rgba(0,194,255,0.25)",
                              padding: "3px 8px",
                              borderRadius: "999px",
                              textDecoration: "none",
                              transition: "background .15s",
                            }}
                          >
                            <LayoutGrid style={{ width: "11px", height: "11px" }} />
                            Kanban
                          </Link>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px", flexWrap: "wrap", fontSize: "11px", color: "var(--text-2)" }}>
                          <span>Lista: <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{leadListName(q.lead_list_id)}</span></span>
                          <span style={{ color: "var(--text-3)" }}>·</span>
                          <span>Concorrência: <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{q.concurrency}</span></span>
                          <span style={{ color: "var(--text-3)" }}>·</span>
                          <span>Tentativas: <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{q.max_attempts}</span></span>
                          <span style={{ color: "var(--text-3)" }}>·</span>
                          <span>Intervalo: <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{q.retry_delay_minutes ?? 30}min</span></span>
                          {(() => {
                            const days = Array.isArray(q.allowed_days) ? (q.allowed_days as unknown as number[]) : [];
                            const tw = q.allowed_time_window as { start?: string; end?: string } | null;
                            if (days.length > 0 && tw?.start && tw?.end) {
                              const dl = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
                              return (
                                <>
                                  <span style={{ color: "var(--text-3)" }}>·</span>
                                  <span>{days.map((d) => dl[d]).join(" ")} {tw.start}–{tw.end}</span>
                                </>
                              );
                            }
                            return null;
                          })()}
                          {q.webhook_url && (
                            <>
                              <span style={{ color: "var(--text-3)" }}>·</span>
                              <span style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: "4px" }}>
                                <Link2 style={{ width: "14px", height: "14px" }} /> Webhook ativo
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mono" style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "384px" }}>{q.assistant_id}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span className={statusCfg.badge}>{statusCfg.label}</span>

                      <button onClick={() => setEditingQueue(q)} className="btn-icon" title="Editar campanha">
                        <Pencil style={{ width: "16px", height: "16px" }} />
                      </button>
                      {(q.status === "draft" || q.status === "stopped") && (
                        <button onClick={() => deleteQueue(q)} className="btn-icon" title="Deletar campanha" style={{ color: "var(--red)" }}>
                          <Trash2 style={{ width: "16px", height: "16px" }} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Banner de last_error — circuit breaker ou erro de configuração */}
                  {q.last_error && (() => {
                    // Tenta interpretar como circuit breaker (JSON com circuit_open_until)
                    let circuitUntil: Date | null = null;
                    let minutesLeft = 0;
                    try {
                      const cb = JSON.parse(q.last_error) as { circuit_open_until?: string };
                      if (cb.circuit_open_until) {
                        circuitUntil = new Date(cb.circuit_open_until);
                        minutesLeft = Math.max(0, Math.ceil((circuitUntil.getTime() - Date.now()) / 60_000));
                      }
                    } catch { /* não é JSON — erro de configuração normal */ }

                    if (circuitUntil && minutesLeft > 0) {
                      // Circuit breaker ativo: mensagem amigável, sem expor detalhes internos
                      return (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", borderRadius: "var(--radius-sm)", background: "rgba(0,194,255,0.08)", border: "1px solid rgba(0,194,255,0.2)", padding: "10px 12px", marginBottom: "16px" }}>
                          <AlertTriangle style={{ width: "16px", height: "16px", color: "var(--cyan)", flexShrink: 0, marginTop: "2px" }} />
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-1)" }}>
                              Proteção automática ativada — retomando em {minutesLeft} min
                            </p>
                            <p style={{ fontSize: "11px", color: "var(--text-2)", marginTop: "2px" }}>
                              O sistema detectou instabilidade temporária na rede e pausou os disparos automaticamente
                              para proteger os números de telefone. A campanha retomará sozinha em aproximadamente {minutesLeft} {minutesLeft === 1 ? "minuto" : "minutos"} — nenhuma ação necessária.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    if (circuitUntil && minutesLeft === 0) {
                      // Circuit breaker expirado mas last_error ainda não foi limpo pelo worker
                      return (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", borderRadius: "var(--radius-sm)", background: "rgba(0,214,143,0.08)", border: "1px solid rgba(0,214,143,0.2)", padding: "10px 12px", marginBottom: "16px" }}>
                          <AlertTriangle style={{ width: "16px", height: "16px", color: "var(--green)", flexShrink: 0, marginTop: "2px" }} />
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-1)" }}>Proteção automática concluída — retomando disparos</p>
                            <p style={{ fontSize: "11px", color: "var(--text-2)", marginTop: "2px" }}>
                              O período de proteção encerrou. Os disparos serão retomados no próximo ciclo do sistema.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // Erro de configuração real (assistente/número deletado no Vapi, etc.)
                    return (
                      <div className="alert-warning" style={{ marginBottom: "16px" }}>
                        <AlertTriangle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: 700 }}>Campanha pausada automaticamente por erro de configuração</p>
                          <p style={{ fontSize: "11px", marginTop: "2px", opacity: 0.8 }}>{q.last_error}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Progress bar */}
                  {prog && (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-2)", marginBottom: "6px" }}>
                        <span>
                          <span style={{ fontWeight: 700, color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace" }}>{prog.done}</span>/{prog.total} concluídos
                          <span style={{ marginLeft: "4px", color: "var(--red)", fontWeight: 600 }}>({prog.progressPct}%)</span>
                        </span>
                        {prog.calling > 0 && (
                          <span style={{ color: "var(--yellow)", fontWeight: 600 }}>{prog.calling} em ligação agora</span>
                        )}
                      </div>
                      <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: "999px", width: `${prog.progressPct}%`, background: "linear-gradient(90deg, var(--red), #ff4d6d)", boxShadow: "0 0 12px var(--red-glow)", transition: "width 1s var(--ease)" }} />
                      </div>
                    </div>
                  )}

                  {/* Lista esgotada banner */}
                  {prog && prog.total > 0 && prog.pending === 0 && prog.calling === 0 && (q.status === "running" || q.status === "paused") && (
                    <div className="alert-warning" style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <AlertCircle style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "13px", fontWeight: 600 }}>Todos os leads já foram contatados</p>
                          <p style={{ fontSize: "11px", opacity: 0.8 }}>Adicione mais leads para continuar ou encerre a campanha.</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        <button
                          onClick={() => { setExpandedId(q.id); setActiveTab((p) => ({ ...p, [q.id]: "leads" })); }}
                          className="btn btn-sm btn-secondary">
                          <UserPlus style={{ width: "14px", height: "14px" }} /> Adicionar leads
                        </button>
                        <button onClick={() => queueAction(q.id, "stop")}
                          className="btn btn-sm" style={{ background: "var(--red-lo)", color: "var(--red)" }}>
                          <Square style={{ width: "14px", height: "14px" }} /> Encerrar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {q.status === "draft" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm" style={{ background: "rgba(0,214,143,0.15)", color: "var(--green)", border: "1px solid rgba(0,214,143,0.25)" }}>
                        <Play style={{ width: "14px", height: "14px" }} /> Iniciar
                      </button>
                    )}
                    {q.status === "running" && (
                      <button onClick={() => queueAction(q.id, "pause")}
                        className="btn btn-sm" style={{ background: "rgba(255,184,0,0.15)", color: "var(--yellow)", border: "1px solid rgba(255,184,0,0.25)" }}
                        title="Pausa temporariamente — os leads ficam na fila e a campanha pode ser retomada depois">
                        <Pause style={{ width: "14px", height: "14px" }} /> Pausar
                      </button>
                    )}
                    {q.status === "paused" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm" style={{ background: "rgba(0,214,143,0.15)", color: "var(--green)", border: "1px solid rgba(0,214,143,0.25)" }}>
                        <Play style={{ width: "14px", height: "14px" }} /> Retomar
                      </button>
                    )}
                    {q.status === "stopped" && (
                      <button onClick={() => queueAction(q.id, "start")}
                        className="btn btn-sm" style={{ background: "rgba(0,214,143,0.15)", color: "var(--green)", border: "1px solid rgba(0,214,143,0.25)" }}>
                        <RotateCcw style={{ width: "14px", height: "14px" }} /> Reiniciar
                      </button>
                    )}
                    {(q.status === "running" || q.status === "paused") && (
                      <button onClick={() => queueAction(q.id, "stop")}
                        className="btn btn-sm" style={{ background: "var(--red-lo)", color: "var(--red)", border: "1px solid rgba(232,0,45,0.25)" }}
                        title="Encerra a campanha definitivamente — para reiniciar será necessário criar uma nova campanha">
                        <Square style={{ width: "14px", height: "14px" }} /> Encerrar
                      </button>
                    )}
                    <button onClick={() => duplicateQueue(q)}
                      className="btn btn-sm btn-secondary">
                      <Copy style={{ width: "14px", height: "14px" }} /> Duplicar
                    </button>
                    <button onClick={() => diagnoseQueue(q.id)} disabled={diagnosing[q.id]}
                      className="btn btn-sm btn-secondary">
                      {diagnosing[q.id]
                        ? <Loader2 style={{ width: "14px", height: "14px", animation: "cx-spin .8s linear infinite" }} />
                        : <Stethoscope style={{ width: "14px", height: "14px" }} />}
                      Diagnosticar
                    </button>
                    {/* Expand/collapse */}
                    <button onClick={() => toggleExpand(q.id)}
                      className="btn btn-sm" style={{ marginLeft: "auto", background: "var(--red-lo)", color: "var(--red)", border: "1px solid rgba(232,0,45,0.25)", display: "flex", alignItems: "center", gap: "6px" }}>
                      {isExpanded ? <ChevronUp style={{ width: "14px", height: "14px" }} /> : <ChevronDown style={{ width: "14px", height: "14px" }} />}
                      {isExpanded ? "Fechar" : "Ver detalhes"}
                    </button>
                  </div>
                </div>

                {/* ── Expanded section with tabs ── */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--glass-border)" }}>
                    {/* Tab bar */}
                    <div style={{ display: "flex", borderBottom: "1px solid var(--glass-border)" }}>
                      {[
                        { key: "overview", label: "Visão Geral" },
                        { key: "leads",    label: "Leads" },
                      ].map(({ key, label }) => (
                        <button key={key}
                          onClick={() => setActiveTab((p) => ({ ...p, [q.id]: key as "overview" | "leads" }))}
                          style={{
                            padding: "12px 20px", fontSize: "13px", fontWeight: 600, transition: "all .15s",
                            borderBottom: `2px solid ${tab === key ? "var(--red)" : "transparent"}`,
                            marginBottom: "-1px",
                            color: tab === key ? "var(--red)" : "var(--text-2)",
                            background: tab === key ? "var(--red-lo)" : "transparent",
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Tab: Visão Geral */}
                    {tab === "overview" && (
                      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Summary stats */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                          <div className="gc" style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>Status</p>
                            <span className={statusCfg.badge}>{statusCfg.label}</span>
                          </div>
                          <div className="gc" style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>Ligações atendidas</p>
                            <p className="mono" style={{ fontSize: "20px", fontWeight: 800, color: "var(--green)" }}>{prog?.byStatus?.completed ?? 0}</p>
                          </div>
                          <div className="gc" style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>Não atendidas</p>
                            <p className="mono" style={{ fontSize: "20px", fontWeight: 800, color: "var(--red)" }}>{prog?.byStatus?.failed ?? 0}</p>
                          </div>
                          <div className="gc" style={{ padding: "12px 16px" }}>
                            <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>Falta ligar para</p>
                            <p className="mono" style={{ fontSize: "20px", fontWeight: 800, color: "var(--purple)" }}>{prog?.pending ?? "—"}</p>
                          </div>
                        </div>

                        {q.webhook_url && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Zap style={{ width: "14px", height: "14px", color: "var(--purple)", flexShrink: 0 }} />
                              <span className="mono" style={{ fontSize: "11px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{q.webhook_url}</span>
                              <button onClick={() => testWebhook(q.id)} disabled={webhookTesting[q.id]}
                                className="btn btn-sm btn-secondary" style={{ flexShrink: 0 }}>
                                {webhookTesting[q.id]
                                  ? <Loader2 style={{ width: "14px", height: "14px", animation: "cx-spin .8s linear infinite" }} />
                                  : <Zap style={{ width: "14px", height: "14px" }} />}
                                {webhookTesting[q.id] ? "Testando…" : "Testar"}
                              </button>
                            </div>
                            {webhookResults[q.id] && (
                              <div style={{
                                display: "flex", alignItems: "flex-start", gap: "8px", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: "11px",
                                background: webhookResults[q.id].ok ? "rgba(0,214,143,0.08)" : "var(--red-lo)",
                                border: `1px solid ${webhookResults[q.id].ok ? "rgba(0,214,143,0.2)" : "rgba(232,0,45,0.2)"}`,
                                color: webhookResults[q.id].ok ? "var(--green)" : "var(--red)",
                              }}>
                                {webhookResults[q.id].ok
                                  ? <CheckCircle2 style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "2px" }} />
                                  : <XCircle style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "2px" }} />}
                                <span>
                                  {webhookResults[q.id].message}
                                  {webhookResults[q.id].elapsed_ms > 0 && (
                                    <span style={{ opacity: 0.6, marginLeft: "4px" }}>({webhookResults[q.id].elapsed_ms}ms)</span>
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
                            <div className="gc" style={{
                              padding: "12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px",
                              borderColor: d.ok ? "rgba(0,214,143,0.25)" : "rgba(255,184,0,0.25)",
                              background: d.ok ? "rgba(0,214,143,0.06)" : "rgba(255,184,0,0.06)",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                                {d.ok
                                  ? <><CheckCircle2 style={{ width: "14px", height: "14px", color: "var(--green)" }} /><span style={{ color: "var(--green)" }}>Tudo certo — pronto para discar</span></>
                                  : <><AlertTriangle style={{ width: "14px", height: "14px", color: "var(--yellow)" }} /><span style={{ color: "var(--yellow)" }}>{d.issues.length} problema(s) detectado(s)</span></>}
                              </div>
                              {d.issues.length > 0 && (
                                <ul style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {d.issues.map((issue, i) => (
                                    <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", color: "var(--yellow)" }}>
                                      <Ban style={{ width: "12px", height: "12px", flexShrink: 0, marginTop: "2px" }} />{issue}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", paddingTop: "4px", borderTop: `1px solid ${d.ok ? "rgba(0,214,143,0.15)" : "rgba(255,184,0,0.15)"}` }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }}>
                                  <Users style={{ width: "12px", height: "12px" }} /> Prontos: <strong style={{ color: "var(--text-1)" }}>{d.leads.ready_to_call}</strong>
                                </span>
                                {Object.entries(d.leads.by_status).map(([s, c]) => (
                                  <span key={s} style={{ color: "var(--text-3)" }}>{s}: {c}</span>
                                ))}
                                {d.time_window.now_in_tz && (
                                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }}>
                                    <Clock style={{ width: "12px", height: "12px" }} />
                                    {d.time_window.now_in_tz} ({d.time_window.timezone}) — janela: {d.time_window.window_start}–{d.time_window.window_end}
                                    {d.time_window.status === "blocked_day"  && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: "4px" }}>DIA BLOQUEADO</span>}
                                    {d.time_window.status === "blocked_hour" && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: "4px" }}>FORA DO HORÁRIO</span>}
                                    {d.time_window.status === "allowed"      && <span style={{ color: "var(--green)", fontWeight: 700, marginLeft: "4px" }}>OK</span>}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Empty overview */}
                        {!q.webhook_url && !diagnoseResults[q.id] && (
                          <p style={{ fontSize: "13px", color: "var(--text-3)", textAlign: "center", padding: "16px 0" }}>
                            Use o botão <strong style={{ color: "var(--text-1)" }}>Diagnosticar</strong> para verificar o estado desta campanha.
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
      <div className="cx-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`cx-toast ${t.type === "success" ? "cx-toast-success" : "cx-toast-error"}`}>
            {t.type === "success"
              ? <Check style={{ width: "16px", height: "16px", color: "var(--green)", flexShrink: 0 }} />
              : <AlertTriangle style={{ width: "16px", height: "16px", flexShrink: 0 }} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
