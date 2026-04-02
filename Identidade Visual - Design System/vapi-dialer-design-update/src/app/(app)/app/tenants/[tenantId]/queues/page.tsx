"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeWindow {
  day: string;
  startHour: string;
  endHour: string;
}

interface Queue {
  id: string;
  name: string;
  status: "running" | "paused" | "completed" | "stopped" | "idle";
  totalLeads: number;
  completedLeads: number;
  callingLeads: number;
  pendingLeads: number;
  assistantId: string;
  phoneNumberId: string;
  concurrency: number;
  retryAttempts: number;
  retryDelayMin: number;
  dailyLimit: number;
  timeWindows: TimeWindow[];
  webhookUrl?: string;
  avgDealValue?: number;
}

interface VapiAssistant {
  id: string;
  name: string;
}

interface VapiPhoneNumber {
  id: string;
  number: string;
}

interface LeadList {
  id: string;
  name: string;
  leadsCount: number;
}

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "warning";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function progressPercent(q: Queue): number {
  if (!q.totalLeads) return 0;
  return Math.round((q.completedLeads / q.totalLeads) * 100);
}

function StatusBadge({ status }: { status: Queue["status"] }) {
  const cfg: Record<Queue["status"], { label: string; color: string; pulse: boolean }> = {
    running:   { label: "Em execução", color: "var(--green)",  pulse: true  },
    paused:    { label: "Pausada",     color: "var(--yellow)", pulse: false },
    completed: { label: "Concluída",   color: "var(--text-3)", pulse: false },
    stopped:   { label: "Parada",      color: "var(--red)",    pulse: false },
    idle:      { label: "Aguardando",  color: "var(--cyan)",   pulse: false },
  };
  const { label, color, pulse } = cfg[status] ?? cfg.idle;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: "var(--radius-sm)",
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          animation: pulse ? "cx-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      {label}
    </span>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={80} height={80} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--red)" />
          <stop offset="100%" stopColor="#ff6b6b" />
        </linearGradient>
      </defs>
      {/* Track */}
      <circle
        cx={40} cy={40} r={r}
        fill="none"
        stroke="var(--glass-border)"
        strokeWidth={7}
      />
      {/* Progress arc */}
      <circle
        cx={40} cy={40} r={r}
        fill="none"
        stroke="url(#ring-grad)"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 40 40)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={40} y={44}
        textAnchor="middle"
        fill="var(--text-1)"
        fontSize={14}
        fontWeight={700}
        fontFamily="'JetBrains Mono', monospace"
      >
        {pct}%
      </text>
    </svg>
  );
}

function Spinner() {
  return <span className="cx-spinner" />;
}

function Toast({ toast }: { toast: ToastItem }) {
  const colorMap: Record<ToastItem["type"], string> = {
    success: "var(--green)",
    error:   "var(--red)",
    warning: "var(--yellow)",
  };
  return (
    <div
      className="cx-toast"
      style={{ borderLeft: `3px solid ${colorMap[toast.type]}` }}
    >
      <span style={{ color: colorMap[toast.type], fontSize: 13 }}>
        {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "⚠"}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-1)" }}>{toast.message}</span>
    </div>
  );
}

// ─── Diagnostic helper ────────────────────────────────────────────────────────

function hasMisconfig(q: Queue): string | null {
  if (!q.assistantId) return "Assistente não configurado";
  if (!q.phoneNumberId) return "Número de telefone não configurado";
  if (!q.timeWindows || q.timeWindows.length === 0) return "Janela de horário não definida";
  return null;
}

// ─── Wizard Modal ─────────────────────────────────────────────────────────────

interface WizardProps {
  tenantId: string;
  assistants: VapiAssistant[];
  phoneNumbers: VapiPhoneNumber[];
  leadLists: LeadList[];
  onClose: () => void;
  onCreated: () => void;
  showToast: (msg: string, type?: ToastItem["type"]) => void;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function WizardModal({ tenantId, assistants, phoneNumbers, leadLists, onClose, onCreated, showToast }: WizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [name, setName] = useState("");
  const [assistantId, setAssistantId] = useState(assistants[0]?.id ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(phoneNumbers[0]?.id ?? "");
  const [concurrency, setConcurrency] = useState(2);
  const [retryAttempts, setRetryAttempts] = useState(2);
  const [retryDelayMin, setRetryDelayMin] = useState(30);
  const [dailyLimit, setDailyLimit] = useState(200);
  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([
    { day: "Seg", startHour: "08:00", endHour: "18:00" },
    { day: "Ter", startHour: "08:00", endHour: "18:00" },
    { day: "Qua", startHour: "08:00", endHour: "18:00" },
    { day: "Qui", startHour: "08:00", endHour: "18:00" },
    { day: "Sex", startHour: "08:00", endHour: "18:00" },
  ]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [avgDealValue, setAvgDealValue] = useState("");

  // Step 2
  const [leadListId, setLeadListId] = useState(leadLists[0]?.id ?? "");

  // Step 3
  const [startNow, setStartNow] = useState(false);

  function toggleDay(day: string) {
    setTimeWindows(prev => {
      const exists = prev.find(w => w.day === day);
      if (exists) return prev.filter(w => w.day !== day);
      return [...prev, { day, startHour: "08:00", endHour: "18:00" }];
    });
  }

  function updateWindow(day: string, field: "startHour" | "endHour", value: string) {
    setTimeWindows(prev => prev.map(w => w.day === day ? { ...w, [field]: value } : w));
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name, assistantId, phoneNumberId, concurrency,
        retryAttempts, retryDelayMin, dailyLimit, timeWindows, leadListId,
        startNow,
      };
      if (webhookUrl) body.webhookUrl = webhookUrl;
      if (avgDealValue) body.avgDealValue = parseFloat(avgDealValue);

      const res = await fetch(`/api/tenants/${tenantId}/queues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Campanha criada com sucesso!", "success");
      onCreated();
      onClose();
    } catch (e) {
      showToast((e as Error).message || "Erro ao criar campanha", "error");
    } finally {
      setSaving(false);
    }
  }

  const selectedList = leadLists.find(l => l.id === leadListId);
  const selectedAssistant = assistants.find(a => a.id === assistantId);
  const selectedPhone = phoneNumbers.find(p => p.id === phoneNumberId);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="gc"
        style={{
          width: "100%", maxWidth: 540, maxHeight: "90vh",
          overflow: "auto", padding: 0,
          borderRadius: "var(--radius-md)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--glass-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Nova Campanha</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Passo {step} de 3</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)", padding: "4px 8px",
              color: "var(--text-2)", cursor: "pointer", fontSize: 16,
            }}
          >✕</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", padding: "12px 24px", gap: 8 }}>
          {[1, 2, 3].map(s => (
            <div
              key={s}
              style={{
                flex: 1, height: 3, borderRadius: 2,
                background: s <= step ? "var(--red)" : "var(--glass-border)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "8px 24px 24px" }}>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Nome da Campanha *</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Black Friday — Leads Quentes"
                  style={{
                    background: "var(--glass-bg-2)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "9px 12px",
                    color: "var(--text-1)",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Assistente Vapi *</span>
                <select
                  className="cx-select"
                  value={assistantId}
                  onChange={e => setAssistantId(e.target.value)}
                >
                  {assistants.length === 0 && <option value="">Nenhum assistente disponível</option>}
                  {assistants.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Número de Telefone *</span>
                <select
                  className="cx-select"
                  value={phoneNumberId}
                  onChange={e => setPhoneNumberId(e.target.value)}
                >
                  {phoneNumbers.length === 0 && <option value="">Nenhum número disponível</option>}
                  {phoneNumbers.map(p => <option key={p.id} value={p.id}>{p.number}</option>)}
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Concorrência</span>
                  <select className="cx-select" value={concurrency} onChange={e => setConcurrency(+e.target.value)}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} linha{n > 1 ? "s" : ""}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Tentativas</span>
                  <select className="cx-select" value={retryAttempts} onChange={e => setRetryAttempts(+e.target.value)}>
                    {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Intervalo retry (min)</span>
                  <input
                    type="number" min={5} max={1440}
                    value={retryDelayMin}
                    onChange={e => setRetryDelayMin(+e.target.value)}
                    style={{
                      background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                      borderRadius: "var(--radius-sm)", padding: "9px 12px",
                      color: "var(--text-1)", fontSize: 14, outline: "none",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Limite diário</span>
                  <input
                    type="number" min={1} max={9999}
                    value={dailyLimit}
                    onChange={e => setDailyLimit(+e.target.value)}
                    style={{
                      background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                      borderRadius: "var(--radius-sm)", padding: "9px 12px",
                      color: "var(--text-1)", fontSize: 14, outline: "none",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                </label>
              </div>

              {/* Time windows */}
              <div>
                <div style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600, marginBottom: 8 }}>Janelas de horário</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {DAYS.map(day => {
                    const active = timeWindows.some(w => w.day === day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "var(--radius-sm)",
                          background: active ? "var(--red)" : "var(--glass-bg-2)",
                          border: `1px solid ${active ? "var(--red)" : "var(--glass-border)"}`,
                          color: active ? "#fff" : "var(--text-2)",
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {timeWindows.map(w => (
                  <div key={w.day} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-2)", width: 32 }}>{w.day}</span>
                    <input
                      type="time" value={w.startHour}
                      onChange={e => updateWindow(w.day, "startHour", e.target.value)}
                      style={{
                        background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-sm)", padding: "5px 8px",
                        color: "var(--text-1)", fontSize: 12, outline: "none",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    />
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>até</span>
                    <input
                      type="time" value={w.endHour}
                      onChange={e => updateWindow(w.day, "endHour", e.target.value)}
                      style={{
                        background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-sm)", padding: "5px 8px",
                        color: "var(--text-1)", fontSize: 12, outline: "none",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Optional fields */}
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Webhook URL (opcional)</span>
                <input
                  type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                    borderRadius: "var(--radius-sm)", padding: "9px 12px",
                    color: "var(--text-1)", fontSize: 14, outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Ticket médio R$ (opcional)</span>
                <input
                  type="number" min={0} value={avgDealValue} onChange={e => setAvgDealValue(e.target.value)}
                  placeholder="Ex: 1500"
                  style={{
                    background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
                    borderRadius: "var(--radius-sm)", padding: "9px 12px",
                    color: "var(--text-1)", fontSize: 14, outline: "none",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              </label>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>
                Selecione a lista de leads que será usada nesta campanha.
              </div>
              {leadLists.length === 0 ? (
                <div
                  className="gc"
                  style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}
                >
                  Nenhuma lista disponível. Importe leads primeiro.
                </div>
              ) : (
                leadLists.map(list => (
                  <div
                    key={list.id}
                    onClick={() => setLeadListId(list.id)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-sm)",
                      background: leadListId === list.id ? "rgba(255,21,55,0.12)" : "var(--glass-bg-2)",
                      border: `1px solid ${leadListId === list.id ? "var(--red)" : "var(--glass-border)"}`,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{list.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                        {list.leadsCount.toLocaleString("pt-BR")} leads
                      </div>
                    </div>
                    {leadListId === list.id && (
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: "var(--red)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "#fff", flexShrink: 0,
                      }}>✓</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>Revise os detalhes antes de criar a campanha.</div>

              {/* Review grid */}
              {[
                { label: "Nome",        value: name || "—" },
                { label: "Assistente",  value: selectedAssistant?.name || "—" },
                { label: "Telefone",    value: selectedPhone?.number || "—" },
                { label: "Lista",       value: selectedList ? `${selectedList.name} (${selectedList.leadsCount.toLocaleString("pt-BR")} leads)` : "—" },
                { label: "Concorrência", value: `${concurrency} linha${concurrency > 1 ? "s" : ""}` },
                { label: "Tentativas",  value: String(retryAttempts) },
                { label: "Intervalo",   value: `${retryDelayMin} min` },
                { label: "Limite/dia",  value: String(dailyLimit) },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600, textAlign: "right", fontFamily: /^\d/.test(r.value) ? "'JetBrains Mono', monospace" : "inherit" }}>
                    {r.value}
                  </span>
                </div>
              ))}

              {/* Janelas */}
              <div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>Janelas de horário</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {timeWindows.map(w => (
                    <span key={w.day} style={{
                      padding: "3px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--glass-bg-2)",
                      border: "1px solid var(--glass-border)",
                      fontSize: 11,
                      color: "var(--text-2)",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {w.day} {w.startHour}–{w.endHour}
                    </span>
                  ))}
                </div>
              </div>

              {/* Start now toggle */}
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: startNow ? "rgba(0,200,110,0.10)" : "var(--glass-bg-2)",
                  border: `1px solid ${startNow ? "var(--green)" : "var(--glass-border)"}`,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onClick={() => setStartNow(v => !v)}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Iniciar agora?</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                    A campanha começará a discar imediatamente após a criação.
                  </div>
                </div>
                <div
                  style={{
                    width: 38, height: 22, borderRadius: 11, flexShrink: 0,
                    background: startNow ? "var(--green)" : "var(--glass-border)",
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2,
                    left: startNow ? 18 : 2,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                  }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{
          padding: "14px 24px",
          borderTop: "1px solid var(--glass-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button
            className="cx-filter-btn"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
          >
            {step === 1 ? "Cancelar" : "← Voltar"}
          </button>

          {step < 3 ? (
            <button
              className="cx-refresh-btn"
              disabled={
                (step === 1 && (!name.trim() || !assistantId || !phoneNumberId)) ||
                (step === 2 && !leadListId)
              }
              onClick={() => setStep(s => s + 1)}
            >
              Próximo →
            </button>
          ) : (
            <button
              className="cx-refresh-btn"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? <><Spinner /> Criando...</> : "Criar Campanha"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Card ─────────────────────────────────────────────────────────────

interface CardProps {
  queue: Queue;
  tenantId: string;
  onAction: () => void;
  showToast: (msg: string, type?: ToastItem["type"]) => void;
}

function CampaignCard({ queue, tenantId, onAction, showToast }: CardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const pct = progressPercent(queue);
  const misconfig = hasMisconfig(queue);

  async function action(act: "start" | "pause" | "stop" | "duplicate") {
    setLoading(act);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues?queueId=${queue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      if (!res.ok) throw new Error(await res.text());
      const labels: Record<string, string> = {
        start: "Campanha iniciada!",
        pause: "Campanha pausada.",
        stop:  "Campanha parada.",
        duplicate: "Campanha duplicada!",
      };
      showToast(labels[act], "success");
      onAction();
    } catch (e) {
      showToast((e as Error).message || "Erro ao executar ação", "error");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir a campanha "${queue.name}"? Esta ação não pode ser desfeita.`)) return;
    setLoading("delete");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues?queueId=${queue.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      showToast("Campanha excluída.", "success");
      onAction();
    } catch (e) {
      showToast((e as Error).message || "Erro ao excluir", "error");
    } finally {
      setLoading(null);
    }
  }

  async function handleWebhookTest() {
    if (!queue.webhookUrl) return showToast("Nenhum webhook configurado.", "warning");
    setWebhookTesting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues/webhook-test?queueId=${queue.id}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      showToast("Webhook testado com sucesso!", "success");
    } catch (e) {
      showToast((e as Error).message || "Erro ao testar webhook", "error");
    } finally {
      setWebhookTesting(false);
    }
  }

  return (
    <div
      className="gc"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle top gradient accent */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: queue.status === "running"
          ? "linear-gradient(90deg, var(--green), transparent)"
          : queue.status === "paused"
          ? "linear-gradient(90deg, var(--yellow), transparent)"
          : queue.status === "completed"
          ? "linear-gradient(90deg, var(--text-3), transparent)"
          : "linear-gradient(90deg, var(--red), transparent)",
        borderRadius: "var(--radius-md) var(--radius-md) 0 0",
      }} />

      {/* Top: name + badges */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: "var(--text-1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {queue.name}
          </div>
          <div style={{ marginTop: 5, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5 }}>
            <StatusBadge status={queue.status} />
            {misconfig && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: "var(--radius-sm)",
                background: "rgba(255,150,0,0.15)", border: "1px solid rgba(255,150,0,0.4)",
                color: "#ffa500", fontSize: 11, fontWeight: 600,
              }}>
                ⚠ {misconfig}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Middle: ring + stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ProgressRing pct={pct} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", flex: 1 }}>
          {[
            { label: "Total",    value: queue.totalLeads,     color: "var(--text-2)" },
            { label: "Concluídos", value: queue.completedLeads, color: "var(--green)"  },
            { label: "Chamando", value: queue.callingLeads,   color: "var(--cyan)"   },
            { label: "Pendentes", value: queue.pendingLeads,  color: "var(--yellow)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color,
                lineHeight: 1.2,
              }}>
                {value.toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{
          height: 4, borderRadius: 2, background: "var(--glass-border)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--red), #ff6b6b)",
            borderRadius: 2,
            transition: "width 0.6s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace" }}>
            {queue.completedLeads.toLocaleString("pt-BR")} / {queue.totalLeads.toLocaleString("pt-BR")}
          </span>
          {queue.avgDealValue && (
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace" }}>
              ~R$ {(queue.avgDealValue * queue.completedLeads).toLocaleString("pt-BR", { minimumFractionDigits: 0 })} est.
            </span>
          )}
        </div>
      </div>

      {/* Bottom: action buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {queue.status !== "running" && queue.status !== "completed" && (
          <button
            className="cx-refresh-btn"
            disabled={!!loading || !!misconfig}
            onClick={() => action("start")}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {loading === "start" ? <Spinner /> : "▶ Iniciar"}
          </button>
        )}

        {queue.status === "running" && (
          <button
            className="cx-filter-btn"
            disabled={!!loading}
            onClick={() => action("pause")}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {loading === "pause" ? <Spinner /> : "⏸ Pausar"}
          </button>
        )}

        {(queue.status === "running" || queue.status === "paused") && (
          <button
            className="cx-filter-btn"
            disabled={!!loading}
            onClick={() => action("stop")}
            style={{
              padding: "6px 12px", fontSize: 12,
              borderColor: "rgba(255,21,55,0.4)", color: "var(--red)",
            }}
          >
            {loading === "stop" ? <Spinner /> : "⏹ Parar"}
          </button>
        )}

        <button
          className="cx-filter-btn"
          disabled={!!loading}
          onClick={() => action("duplicate")}
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          {loading === "duplicate" ? <Spinner /> : "⧉ Duplicar"}
        </button>

        {queue.webhookUrl && (
          <button
            className="cx-filter-btn"
            disabled={webhookTesting}
            onClick={handleWebhookTest}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {webhookTesting ? <Spinner /> : "⚡ Webhook"}
          </button>
        )}

        <button
          className="cx-filter-btn"
          disabled={!!loading}
          onClick={handleDelete}
          style={{
            padding: "6px 12px", fontSize: 12, marginLeft: "auto",
            borderColor: "rgba(255,21,55,0.3)", color: "rgba(255,21,55,0.7)",
          }}
        >
          {loading === "delete" ? <Spinner /> : "🗑"}
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16,
      minHeight: 320,
      textAlign: "center",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "var(--radius-md)",
        background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28,
      }}>
        📋
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>
          Nenhuma campanha ainda
        </div>
        <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 300 }}>
          Crie sua primeira campanha de discagem automática para começar a converter leads.
        </div>
      </div>
      <button className="cx-refresh-btn" onClick={onNew}>
        + Nova Campanha
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QueuesPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [assistants, setAssistants] = useState<VapiAssistant[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<VapiPhoneNumber[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [filter, setFilter] = useState<"all" | "running" | "paused" | "completed" | "stopped">("all");
  const [refreshing, setRefreshing] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function showToast(message: string, type: ToastItem["type"] = "success") {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  const loadQueues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues`);
      const data = await res.json();
      setQueues(data.queues ?? []);
    } catch {
      if (!silent) showToast("Erro ao carregar campanhas", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantId]);

  const loadResources = useCallback(async () => {
    try {
      const [vapiRes, listsRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/vapi-resources`),
        fetch(`/api/tenants/${tenantId}/lead-lists`),
      ]);
      const vapiData = await vapiRes.json();
      const listsData = await listsRes.json();
      setAssistants(vapiData.assistants ?? []);
      setPhoneNumbers(vapiData.phoneNumbers ?? []);
      setLeadLists(listsData.lists ?? []);
    } catch {
      // non-critical
    }
  }, [tenantId]);

  // Initial load
  useEffect(() => {
    if (!tenantId) return;
    loadQueues();
    loadResources();
  }, [tenantId, loadQueues, loadResources]);

  // Polling: every 3s when there are running campaigns
  useEffect(() => {
    const hasRunning = queues.some(q => q.status === "running");
    if (hasRunning) {
      pollRef.current = setInterval(() => loadQueues(true), 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [queues, loadQueues]);

  async function handleManualRefresh() {
    setRefreshing(true);
    await loadQueues(true);
    setRefreshing(false);
  }

  const filtered = filter === "all" ? queues : queues.filter(q => q.status === filter);

  const statusCounts = queues.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1;
    return acc;
  }, {});

  const filterOptions: { value: typeof filter; label: string; count?: number }[] = [
    { value: "all",       label: "Todas",       count: queues.length },
    { value: "running",   label: "Em execução", count: statusCounts.running   },
    { value: "paused",    label: "Pausadas",    count: statusCounts.paused    },
    { value: "completed", label: "Concluídas",  count: statusCounts.completed },
    { value: "stopped",   label: "Paradas",     count: statusCounts.stopped   },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Campanhas</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "4px 0 0" }}>
            {queues.length} campanha{queues.length !== 1 ? "s" : ""} configurada{queues.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="cx-filter-btn"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Atualizar"
            style={{ padding: "8px 10px" }}
          >
            {refreshing ? <Spinner /> : (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            )}
          </button>
          <button
            className="cx-refresh-btn"
            onClick={() => { setShowWizard(true); loadResources(); }}
          >
            + Nova Campanha
          </button>
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {filterOptions.map(opt => (
          (opt.count === undefined || opt.count > 0 || opt.value === "all") && (
            <button
              key={opt.value}
              className={`cx-filter-btn${filter === opt.value ? " active" : ""}`}
              onClick={() => setFilter(opt.value)}
              style={{
                padding: "5px 12px", fontSize: 12,
                ...(filter === opt.value ? {
                  background: "rgba(255,21,55,0.15)",
                  borderColor: "var(--red)",
                  color: "var(--red)",
                } : {}),
              }}
            >
              {opt.label}
              {opt.count !== undefined && opt.count > 0 && (
                <span style={{
                  marginLeft: 5, padding: "1px 5px",
                  borderRadius: 9, fontSize: 10,
                  background: filter === opt.value ? "var(--red)" : "var(--glass-bg-2)",
                  color: filter === opt.value ? "#fff" : "var(--text-3)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {opt.count}
                </span>
              )}
            </button>
          )
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 10 }}>
          <Spinner />
          <span style={{ color: "var(--text-3)", fontSize: 14 }}>Carregando campanhas...</span>
        </div>
      ) : filtered.length === 0 && queues.length === 0 ? (
        <EmptyState onNew={() => { setShowWizard(true); loadResources(); }} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: 14 }}>
          Nenhuma campanha com o filtro selecionado.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
        }}>
          {filtered.map(queue => (
            <CampaignCard
              key={queue.id}
              queue={queue}
              tenantId={tenantId}
              onAction={() => loadQueues(true)}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* ── Wizard Modal ── */}
      {showWizard && (
        <WizardModal
          tenantId={tenantId}
          assistants={assistants}
          phoneNumbers={phoneNumbers}
          leadLists={leadLists}
          onClose={() => setShowWizard(false)}
          onCreated={() => loadQueues()}
          showToast={showToast}
        />
      )}

      {/* ── Toasts ── */}
      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {toasts.map(t => <Toast key={t.id} toast={t} />)}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes cx-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
