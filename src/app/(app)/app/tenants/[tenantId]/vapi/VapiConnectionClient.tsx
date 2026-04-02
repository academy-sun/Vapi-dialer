"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Key, Lock, Eye, EyeOff, Copy, Check, AlertTriangle, CheckCircle2,
  Loader2, Link, Info, Bot, ChevronDown, ChevronUp, Save, RotateCcw,
  Sparkles, Zap, Trash2, Plus, Pencil, Webhook, Globe,
} from "lucide-react";

interface Connection {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
  concurrency_limit: number | null;
  has_public_key?: boolean;
  contracted_minutes: number | null;
  minutes_used_cache: number;
  minutes_cache_month: string | null;
  minutes_blocked: boolean;
}

interface Assistant { id: string; name: string }
interface StructuredOutput { id: string; fields: string[] }

// Config por assistente (nova tabela assistant_configs)
interface AssistantConfig {
  assistant_id:  string;
  name:          string | null;
  success_field: string | null;
  success_value: string | null;
}

// Config do assistente para edição no Vapi
interface AssistantEditorConfig {
  id: string;
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voice: Record<string, unknown>;
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

export default function VapiConnectionClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toasts, show: showToast } = useToast();

  // ── Section 1: API Key ──
  const [connection, setConnection] = useState<Connection | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("default");
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [fetchingConn, setFetchingConn] = useState(true);
  const [keyError, setKeyError] = useState("");
  const [copied, setCopied] = useState(false);
  const [expandKeyForm, setExpandKeyForm] = useState(false);

  // ── Section 1.5: Concurrency limit ──
  const [concurrencyLimit, setConcurrencyLimit] = useState<number>(10);
  const [savingConcurrency, setSavingConcurrency] = useState(false);

  // ── Section 1.8: Minutos contratados (admin only) ──
  const [contractedMinutes, setContractedMinutes] = useState<number | null>(null);
  const [contractedMinutesInput, setContractedMinutesInput] = useState<string>("");
  const [minutesBlocked, setMinutesBlocked] = useState(false);
  const [savingContracted, setSavingContracted] = useState(false);
  const [savingUnblock, setSavingUnblock] = useState(false);

  // ── Section 1.6: Chave Pública Vapi ──
  const [publicKeyInput, setPublicKeyInput] = useState("");
  const [savingPublicKey, setSavingPublicKey] = useState(false);
  const [expandPublicKeyForm, setExpandPublicKeyForm] = useState(false);

  // ── Section 2: Assistentes configurados (assistant_configs) ──
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assistantConfigs, setAssistantConfigs] = useState<AssistantConfig[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);

  // Edição de um assistente (inline form)
  const [editingAssistantId, setEditingAssistantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; successField: string; successValue: string; fields: string[] }>({
    name: "", successField: "", successValue: "sim", fields: [],
  });
  const [loadingFields, setLoadingFields] = useState(false);
  const [savingAssistantConfig, setSavingAssistantConfig] = useState(false);

  // ── Section 1.7: Webhook do Assistente ──
  const [webhookAssistantId, setWebhookAssistantId] = useState("");
  const [updatingWebhook, setUpdatingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Section 3: Assistant Editor (prompt/voice no Vapi) ──
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAssistantId, setEditorAssistantId] = useState<string>("");
  const [assistantEditorConfig, setAssistantEditorConfig] = useState<AssistantEditorConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editFirstMessage, setEditFirstMessage] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [savingAssistant, setSavingAssistant] = useState(false);

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/vapi/${tenantId}`;

  // Load connection on mount
  useEffect(() => { loadConnection(); }, [tenantId]);

  async function loadConnection() {
    // Limpa estado do tenant anterior antes de carregar o novo
    setConnection(null);
    setAssistants([]);
    setAssistantConfigs([]);
    setWebhookStatus(null);
    setExpandKeyForm(false);
    setFetchingConn(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`);
    const data = await res.json();
    const conn = data.connection as Connection | null;
    setConnection(conn);
    if (conn?.concurrency_limit != null) setConcurrencyLimit(conn.concurrency_limit);
    if (conn != null) {
      setContractedMinutes(conn.contracted_minutes);
      setContractedMinutesInput(conn.contracted_minutes != null ? String(conn.contracted_minutes) : "");
      setMinutesBlocked(conn.minutes_blocked ?? false);
    }
    setFetchingConn(false);

    if (conn) {
      loadAssistants();
      loadAssistantConfigs();
    }
  }

  async function loadAssistants() {
    setLoadingAssistants(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-resources`);
    const data = await res.json();
    setAssistants(data.assistants ?? []);
    setLoadingAssistants(false);
  }

  async function loadAssistantConfigs() {
    const res = await fetch(`/api/tenants/${tenantId}/assistant-configs`);
    const data = await res.json();
    setAssistantConfigs(data.configs ?? []);
  }

  async function startEditAssistant(assistantId: string) {
    const existing = assistantConfigs.find((c) => c.assistant_id === assistantId);
    setEditForm({
      name:         existing?.name ?? (assistants.find((a) => a.id === assistantId)?.name ?? ""),
      successField: existing?.success_field ?? "",
      successValue: existing?.success_value ?? "sim",
      fields:       [],
    });
    setEditingAssistantId(assistantId);
    // Buscar structured output fields desse assistente
    setLoadingFields(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant?assistantId=${assistantId}`);
      const d = await res.json();
      setEditForm((prev) => ({ ...prev, fields: d.allFields ?? [] }));
      // Se é o primeiro load do editor de prompt, pré-carrega também
      if (d.assistant) {
        const a = d.assistant as AssistantEditorConfig;
        setAssistantEditorConfig(a);
        setEditorAssistantId(assistantId);
        setEditName(a.name ?? "");
        setEditFirstMessage(a.firstMessage ?? "");
        setEditSystemPrompt(a.systemPrompt ?? "");
      }
    } finally {
      setLoadingFields(false);
    }
  }

  async function handleSaveAssistantConfig() {
    if (!editingAssistantId) return;
    setSavingAssistantConfig(true);
    const res = await fetch(`/api/tenants/${tenantId}/assistant-configs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId:  editingAssistantId,
        name:         editForm.name || null,
        successField: editForm.successField || null,
        successValue: editForm.successValue || null,
      }),
    });
    if (res.ok) {
      showToast("Configuração do assistente salva!");
      setEditingAssistantId(null);
      loadAssistantConfigs();
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar", "error");
    }
    setSavingAssistantConfig(false);
  }

  async function handleDeleteAssistantConfig(assistantId: string) {
    const res = await fetch(`/api/tenants/${tenantId}/assistant-configs?assistantId=${assistantId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      showToast("Configuração removida");
      loadAssistantConfigs();
    } else {
      showToast("Erro ao remover", "error");
    }
  }

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    setKeyError("");
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setKeyError(data.error ?? "Erro ao salvar");
      showToast(data.error ?? "Erro ao salvar", "error");
    } else {
      showToast("API Key salva com sucesso!");
      setApiKey("");
      loadConnection();
    }
    setSavingKey(false);
  }

  async function handleSaveConcurrency() {
    setSavingConcurrency(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concurrencyLimit }),
    });
    if (res.ok) {
      showToast("Limite de concorrência salvo!");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar", "error");
    }
    setSavingConcurrency(false);
  }

  async function handleSaveContracted() {
    setSavingContracted(true);
    const parsed = contractedMinutesInput.trim() === "" ? null : Math.max(1, parseInt(contractedMinutesInput) || 1);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractedMinutes: parsed }),
    });
    if (res.ok) {
      setContractedMinutes(parsed);
      // Verifica se o novo limite desbloqueou a conta
      const currentUsedMin = connection ? Math.ceil(connection.minutes_used_cache / 60) : 0;
      if (parsed !== null && minutesBlocked && currentUsedMin < parsed) {
        setMinutesBlocked(false);
        showToast("Minutos contratados salvos — conta desbloqueada!");
      } else {
        showToast("Minutos contratados salvos!");
      }
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar", "error");
    }
    setSavingContracted(false);
  }

  async function handleUnblockAccount() {
    setSavingUnblock(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutesBlocked: false }),
    });
    if (res.ok) {
      setMinutesBlocked(false);
      showToast("Conta desbloqueada com sucesso!");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao desbloquear", "error");
    }
    setSavingUnblock(false);
  }

  async function handleSavePublicKey() {
    setSavingPublicKey(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: publicKeyInput }),
    });
    if (res.ok) {
      showToast("Chave Pública salva!");
      setPublicKeyInput("");
      setExpandPublicKeyForm(false);
      loadConnection();
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar", "error");
    }
    setSavingPublicKey(false);
  }

  async function handleSaveAssistant() {
    if (!editorAssistantId) return;
    setSavingAssistant(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId:  editorAssistantId,
        name:         editName,
        firstMessage: editFirstMessage,
        systemPrompt: editSystemPrompt,
      }),
    });
    if (res.ok) {
      showToast("Assistente atualizado com sucesso!");
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar assistente", "error");
    }
    setSavingAssistant(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    showToast("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleUpdateWebhook() {
    if (!webhookAssistantId) return;
    setUpdatingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-webhook",
          assistantId: webhookAssistantId,
          serverUrl: webhookUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const confirmedId = data.assistantId ?? webhookAssistantId;
        const aName = assistants.find((a) => a.id === confirmedId)?.name ?? confirmedId.slice(0, 8);
        setWebhookStatus({ ok: true, msg: `✓ Webhook atualizado em "${aName}" com sucesso!` });
      } else {
        setWebhookStatus({ ok: false, msg: data.error ?? "Erro ao atualizar webhook" });
      }
    } catch {
      setWebhookStatus({ ok: false, msg: "Erro de conexão. Tente novamente." });
    } finally {
      setUpdatingWebhook(false);
    }
  }

  return (
    <div className="cx-vapi-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações Vapi</h1>
          <p className="page-subtitle">Gerencie sua chave de API, assistente e webhook do Vapi</p>
        </div>
      </div>

      {/* Status da conexao — full width */}
      {fetchingConn ? (
        <div className="gc" style={{ padding: '20px', marginBottom: '18px' }}>
          <div className="cx-loading">
            <div className="cx-spinner" />
            <span>Carregando conexão...</span>
          </div>
        </div>
      ) : connection ? (
        <div className="alert-success" style={{ marginBottom: '22px' }}>
          <CheckCircle2 style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--green)' }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)' }}>Vapi conectada com sucesso!</p>
            <p style={{ fontSize: '12px', marginTop: '2px', color: 'var(--text-2)' }}>
              Label: <span style={{ fontWeight: 600 }}>{connection.label}</span> · Configurada em{" "}
              {new Date(connection.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
      ) : (
        <div className="alert-warning" style={{ marginBottom: '22px' }}>
          <AlertTriangle style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--yellow)' }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)' }}>Nenhuma Vapi key configurada</p>
            <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
              Adicione sua API Key do Vapi abaixo para ativar chamadas neste tenant.
            </p>
          </div>
        </div>
      )}

      {/* Linha 1: 2-column grid — API Key | Limite de chamadas */}
      <div className="cx-vapi-grid">

        {/* Section 1: API Key */}
        <div className="gc">
          <div className="cx-vapi-card-header">
            <h2 className="cx-vapi-card-title">
              <Key />
              Vapi API Key
            </h2>
            {connection && !expandKeyForm && (
              <button
                onClick={() => setExpandKeyForm(true)}
                className="cx-vapi-update-link"
              >
                Atualizar key
              </button>
            )}
          </div>

          {/* Compact state — key already configured */}
          {connection && !expandKeyForm ? (
            <div className="cx-vapi-card-body">
              <div className="cx-vapi-compact-row">
                <div className="cx-vapi-compact-icon">
                  <CheckCircle2 />
                </div>
                <div>
                  <p className="cx-vapi-compact-label">API Key configurada</p>
                  <p className="cx-vapi-compact-sub">
                    sk_live_••••••••  ·  Label: <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{connection.label}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { handleSaveKey(e); setExpandKeyForm(false); }} className="cx-vapi-card-body">
              {keyError && (
                <div className="alert-error">
                  <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px' }}>{keyError}</span>
                </div>
              )}
              <div>
                <label className="form-label">Label</label>
                <input
                  type="text"
                  className="form-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: producao, staging, default"
                />
              </div>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock style={{ width: 14, height: 14, color: 'var(--text-3)' }} />
                  Vapi API Key (privada)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    className="form-input"
                    style={{ paddingRight: '40px', fontFamily: "'JetBrains Mono', monospace" }}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk_live_"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="cx-vapi-eye-btn"
                  >
                    {showKey ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                <p className="cx-vapi-hint">
                  Criptografada com <strong>AES-256-GCM</strong> antes de ser armazenada.
                </p>
              </div>
              <div className="cx-vapi-actions">
                {connection && (
                  <button type="button" onClick={() => setExpandKeyForm(false)} className="btn-ghost">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={savingKey || !apiKey.trim()} className="btn btn-primary" style={{ marginLeft: 'auto' }}>
                  {savingKey ? <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} /> : <Check style={{ width: 16, height: 16 }} />}
                  Salvar Key
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Section 1.5: Limite de Concorrência da Org Vapi */}
        {connection && (
          <div className="gc">
            <div className="cx-vapi-card-header">
              <h2 className="cx-vapi-card-title">
                <Zap />
                Limite de chamadas simultâneas (org Vapi)
              </h2>
            </div>
            <div className="cx-vapi-card-body">
              <div className="alert-info">
                <Info style={{ width: 16, height: 16, flexShrink: 0, marginTop: '2px', color: 'var(--cyan)' }} />
                <span style={{ fontSize: '13px' }}>
                  Cada conta Vapi tem um número máximo de chamadas simultâneas (slots de concorrência da org).
                  O worker distribui esses slots proporcionalmente entre todas as campanhas ativas deste tenant.
                  Verifique seu limite em: <span style={{ fontWeight: 600 }}>Vapi Dashboard → Billing / Plan</span>.
                </span>
              </div>
              <div className="cx-vapi-row-end">
                <div className="cx-vapi-flex1">
                  <label className="form-label">Slots simultâneos da org Vapi</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={100}
                    value={concurrencyLimit}
                    onChange={(e) => setConcurrencyLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  />
                  <p className="cx-vapi-hint">
                    Dividido igualmente entre campanhas ativas. Ex: 10 slots ÷ 3 campanhas = 3 + 3 + 4.
                  </p>
                </div>
                <button
                  onClick={handleSaveConcurrency}
                  disabled={savingConcurrency}
                  className="btn btn-primary"
                  style={{ flexShrink: 0 }}
                >
                  {savingConcurrency ? <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} /> : <Save style={{ width: 16, height: 16 }} />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end grid linha 1 */}

      {/* Section 1.8: Minutos Contratados — visível apenas para admins */}
      {isAdmin && connection && (
        <div className="gc cx-vapi-admin-border" style={{ marginBottom: '18px' }}>
          <div className="cx-vapi-card-header">
            <h2 className="cx-vapi-card-title">
              <Zap style={{ color: 'var(--red)' }} />
              Minutos contratados por mês
              <span className="cx-vapi-admin-badge">Admin</span>
            </h2>
            {minutesBlocked && (
              <span className="cx-vapi-blocked-badge">
                <span className="cx-vapi-blocked-dot" />
                Conta bloqueada
              </span>
            )}
          </div>
          <div className="cx-vapi-card-body">
            {minutesBlocked && (
              <div className="cx-vapi-blocked-box">
                <AlertTriangle />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="cx-vapi-blocked-title">Conta bloqueada por consumo de minutos</p>
                  <p className="cx-vapi-blocked-desc">
                    Todas as campanhas foram pausadas. Para desbloquear, defina um limite acima de{" "}
                    <strong>{connection ? Math.ceil(connection.minutes_used_cache / 60) : "—"} min</strong> (uso atual) e clique em Salvar.
                  </p>
                </div>
              </div>
            )}
            <div className="cx-vapi-row-end">
              <div className="cx-vapi-flex1">
                <label className="form-label">Minutos contratados por mês</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  value={contractedMinutesInput}
                  onChange={(e) => setContractedMinutesInput(e.target.value)}
                  placeholder="Ex: 500 (deixe vazio para desativar o controle)"
                />
                <p className="cx-vapi-hint">
                  Quando o cliente atingir 100%, as campanhas são pausadas automaticamente.
                </p>
                {(() => {
                  const typed = parseInt(contractedMinutesInput);
                  const usedMin = connection ? Math.ceil(connection.minutes_used_cache / 60) : 0;
                  if (contractedMinutesInput.trim() !== "" && !isNaN(typed) && usedMin > 0 && typed <= usedMin) {
                    return (
                      <p style={{ fontSize: '12px', color: 'var(--yellow)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle style={{ width: 12, height: 12, flexShrink: 0 }} />
                        Uso atual ({usedMin} min) já supera este limite — a conta será bloqueada imediatamente.
                      </p>
                    );
                  }
                  return null;
                })()}
                {contractedMinutes != null && connection.minutes_used_cache != null && (() => {
                  const usedMin = Math.ceil(connection.minutes_used_cache / 60);
                  const pct = Math.min(100, Math.round((usedMin / contractedMinutes) * 100));
                  const barColor = pct >= 100 ? "var(--red)" : pct >= 90 ? "#f97316" : pct >= 80 ? "var(--yellow)" : "var(--green)";
                  return (
                    <div className="cx-vapi-progress">
                      <div className="cx-vapi-progress-meta">
                        <span><strong>{usedMin} min usados</strong></span>
                        <span>{contractedMinutes} min contratados · {connection.minutes_cache_month ?? "—"} · <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span></span>
                      </div>
                      <div className="cx-min-track" style={{ height: '7px' }}>
                        <div
                          className="cx-min-fill"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              <button
                onClick={handleSaveContracted}
                disabled={savingContracted}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                {savingContracted ? <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} /> : <Save style={{ width: 16, height: 16 }} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chave Pública Vapi (para Testar Assistente) */}
      {connection && (
        <div className="gc" style={{ marginBottom: '18px' }}>
          <div className="cx-vapi-card-header">
            <h2 className="cx-vapi-card-title">
              <Globe />
              Chave Pública Vapi
            </h2>
            {connection.has_public_key && !expandPublicKeyForm && (
              <button
                onClick={() => setExpandPublicKeyForm(true)}
                className="cx-vapi-update-link"
              >
                Atualizar
              </button>
            )}
          </div>

          {connection.has_public_key && !expandPublicKeyForm ? (
            <div className="cx-vapi-card-body">
              <div className="cx-vapi-compact-row">
                <div className="cx-vapi-compact-icon">
                  <CheckCircle2 />
                </div>
                <div>
                  <p className="cx-vapi-compact-label">Chave Pública configurada</p>
                  <p className="cx-vapi-compact-sub">pk_live_••••••••  ·  Botão &quot;Testar Assistente&quot; disponível</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="cx-vapi-card-body">
              {!connection.has_public_key && (
                <div className="alert-warning">
                  <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--yellow)' }} />
                  <span style={{ fontSize: '13px' }}>
                    Sem chave pública configurada — o botão <strong>&quot;Testar Assistente&quot;</strong> ficará indisponível.
                    Encontre sua chave pública em{" "}
                    <span style={{ fontWeight: 600 }}>Vapi Dashboard → Account → API Keys → Public Key</span>.
                  </span>
                </div>
              )}
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe style={{ width: 14, height: 14, color: 'var(--text-3)' }} />
                  Vapi Public Key
                </label>
                <input
                  type="password"
                  className="form-input"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  value={publicKeyInput}
                  onChange={(e) => setPublicKeyInput(e.target.value)}
                  placeholder="pk_live_..."
                />
                <p className="cx-vapi-hint">
                  Chave pública para iniciar chamadas WebRTC diretamente do navegador.
                  Diferente da chave privada — é segura para uso no frontend.
                </p>
              </div>
              <div className="cx-vapi-actions">
                {connection.has_public_key && (
                  <button type="button" onClick={() => setExpandPublicKeyForm(false)} className="btn-ghost">
                    Cancelar
                  </button>
                )}
                <button
                  onClick={handleSavePublicKey}
                  disabled={savingPublicKey || !publicKeyInput.trim()}
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto' }}
                >
                  {savingPublicKey ? <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} /> : <Check style={{ width: 16, height: 16 }} />}
                  Salvar Chave Pública
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linha 2: Webhook do Assistente — full width */}
      {connection && (
        <div className="gc" style={{ marginBottom: '18px' }}>
          <div className="cx-vapi-card-header">
            <h2 className="cx-vapi-card-title">
              <Webhook />
              Webhook do Assistente
            </h2>
          </div>
          <div className="cx-vapi-card-body">
            <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
              Sincroniza o assistente Vapi para receber eventos de fim de chamada em tempo real.
              Cole a URL abaixo manualmente em <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Vapi Dashboard → Assistants → Server URL</span>,
              ou use o botão para enviar automaticamente via API.
            </p>

            {/* URL — full width */}
            <div>
              <label className="form-label">URL do Webhook</label>
              <div className="cx-copy-field">
                <span>{webhookUrl}</span>
                <button
                  onClick={handleCopy}
                  className="cx-copy-btn"
                  title="Copiar URL"
                >
                  {copied ? <Check style={{ color: 'var(--green)' }} /> : <Copy />}
                </button>
              </div>
            </div>

            {/* Dropdown — full width */}
            <div>
              <label className="form-label">Selecionar assistente</label>
              <select
                className="form-input"
                value={webhookAssistantId}
                onChange={(e) => { setWebhookAssistantId(e.target.value); setWebhookStatus(null); }}
              >
                <option value="">Selecione um assistente…</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id.slice(0, 8)}…)</option>
                ))}
              </select>
              {webhookAssistantId && (
                <p className="cx-vapi-webhook-id">ID: {webhookAssistantId}</p>
              )}
            </div>

            {/* Feedback */}
            {webhookStatus && (
              <div className={webhookStatus.ok ? "alert-success" : "alert-error"}>
                {webhookStatus.ok
                  ? <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--green)' }} />
                  : <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />}
                <span style={{ fontSize: '13px' }}>{webhookStatus.msg}</span>
              </div>
            )}

            {/* Button — right-aligned */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button
                onClick={handleUpdateWebhook}
                disabled={updatingWebhook || !webhookAssistantId}
                className="btn btn-primary"
                style={{ flexShrink: 0 }}
              >
                {updatingWebhook
                  ? <><Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} />Atualizando…</>
                  : <><Webhook style={{ width: 16, height: 16 }} />Atualizar no Assistente</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linha 3: Assistentes configurados — full width */}
      {connection && (
        <div className="gc" style={{ marginBottom: '18px' }} id="assistentes">
          <div className="cx-vapi-card-header">
            <h2 className="cx-vapi-card-title">
              <Sparkles />
              Assistentes configurados
            </h2>
            {loadingAssistants && <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite', color: 'var(--text-3)' }} />}
          </div>
          <div className="cx-vapi-card-body">
            <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
              Configure o critério de sucesso para cada assistente da conta Vapi.
              O sistema usa esse critério para calcular a taxa de conversão nos relatórios.
            </p>

            {/* Lista de assistentes da conta Vapi */}
            {assistants.length === 0 && !loadingAssistants ? (
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>Nenhum assistente encontrado na conta Vapi.</p>
            ) : (
              <div>
                {assistants.map((assistant) => {
                  const cfg = assistantConfigs.find((c) => c.assistant_id === assistant.id);
                  const isEditing = editingAssistantId === assistant.id;

                  return (
                    <div key={assistant.id} className="cx-vapi-assistant-row">
                      {/* Row header */}
                      <div className="cx-vapi-assistant-header">
                        <div>
                          <p className="cx-vapi-assistant-name">
                            {cfg?.name ?? assistant.name}
                          </p>
                          <p className="cx-vapi-assistant-id">{assistant.id}</p>
                        </div>
                        <div className="cx-vapi-assistant-actions">
                          {cfg?.success_field ? (
                            <span className="cx-vapi-success-tag configured">
                              {cfg.success_field} = {cfg.success_value}
                            </span>
                          ) : (
                            <span className="cx-vapi-success-tag empty">
                              Sem critério configurado
                            </span>
                          )}
                          <button
                            onClick={() => isEditing ? setEditingAssistantId(null) : startEditAssistant(assistant.id)}
                            className="cx-vapi-edit-btn"
                            title="Editar configuração"
                          >
                            <Pencil />
                          </button>
                          {cfg && (
                            <button
                              onClick={() => handleDeleteAssistantConfig(assistant.id)}
                              className="cx-vapi-delete-btn"
                              title="Remover configuração"
                            >
                              <Trash2 />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="cx-vapi-edit-form">
                          {/* Nome legível */}
                          <div>
                            <label className="form-label">Nome legível (opcional)</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editForm.name}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder={assistant.name}
                            />
                            <p className="cx-vapi-hint">Ex: &quot;Agente Imobiliária&quot;, &quot;Agente Cobrança&quot;</p>
                          </div>

                          {/* Structured output fields */}
                          {loadingFields ? (
                            <div className="cx-loading">
                              <div className="cx-spinner" />
                              <span>Carregando campos do assistente...</span>
                            </div>
                          ) : editForm.fields.length > 0 ? (
                            <>
                              <div className="cx-vapi-fields-box">
                                <p className="cx-vapi-fields-title">
                                  Campos disponíveis no Structured Output:
                                </p>
                                <p className="cx-vapi-fields-mono">
                                  {editForm.fields.join(", ")}
                                </p>
                              </div>
                              <div className="cx-vapi-2col">
                                <div>
                                  <label className="form-label">Campo de conversão</label>
                                  <select
                                    className="form-input"
                                    value={editForm.successField}
                                    onChange={(e) => setEditForm((p) => ({ ...p, successField: e.target.value }))}
                                  >
                                    <option value="">Selecione o campo...</option>
                                    {editForm.fields.map((f) => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="form-label">Valor de sucesso</label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={editForm.successValue}
                                    onChange={(e) => setEditForm((p) => ({ ...p, successValue: e.target.value }))}
                                    placeholder="sim, yes, true..."
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="cx-vapi-2col">
                              <div>
                                <label className="form-label">Campo de conversão</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={editForm.successField}
                                  onChange={(e) => setEditForm((p) => ({ ...p, successField: e.target.value }))}
                                  placeholder="ex: QuerReuniao"
                                />
                                <p className="cx-vapi-hint">Assistente sem Structured Outputs — digite manualmente</p>
                              </div>
                              <div>
                                <label className="form-label">Valor de sucesso</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={editForm.successValue}
                                  onChange={(e) => setEditForm((p) => ({ ...p, successValue: e.target.value }))}
                                  placeholder="sim"
                                />
                              </div>
                            </div>
                          )}

                          <div className="cx-vapi-actions">
                            <button
                              type="button"
                              onClick={() => setEditingAssistantId(null)}
                              className="btn-ghost"
                            >
                              Cancelar
                            </button>
                            <div className="cx-vapi-actions-right">
                              {/* Botão para abrir editor de prompt */}
                              <button
                                type="button"
                                onClick={() => { setEditorAssistantId(assistant.id); setEditorOpen(true); }}
                                className="btn btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                              >
                                <Bot style={{ width: 14, height: 14 }} />
                                Editar prompt
                              </button>
                              <button
                                onClick={handleSaveAssistantConfig}
                                disabled={savingAssistantConfig}
                                className="btn btn-primary"
                              >
                                {savingAssistantConfig ? <Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} /> : <Save style={{ width: 16, height: 16 }} />}
                                Salvar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 3: Assistant Editor (prompt/voice no Vapi) */}
      {connection && editorAssistantId && assistantEditorConfig && editorOpen && (
        <div className="gc" style={{ marginBottom: '18px' }}>
          <button
            className="cx-vapi-editor-toggle"
            onClick={() => setEditorOpen(!editorOpen)}
          >
            <h2 className="cx-vapi-card-title">
              <Bot />
              Editor do Assistente
            </h2>
            {editorOpen ? <ChevronUp /> : <ChevronDown />}
          </button>

          <div className="cx-vapi-card-body">
            <div>
              <label className="form-label">Nome do assistente</label>
              <input
                type="text"
                className="form-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do assistente"
              />
            </div>

            <div>
              <label className="form-label">Primeira mensagem</label>
              <textarea
                className="form-input"
                style={{ minHeight: '80px', resize: 'vertical' }}
                value={editFirstMessage}
                onChange={(e) => setEditFirstMessage(e.target.value)}
                placeholder="Ola! Sou a IA da empresa X..."
              />
              <p className="cx-vapi-hint">
                Primeira coisa que o assistente diz quando a chamada e atendida.
              </p>
            </div>

            <div>
              <label className="form-label">Prompt do sistema</label>
              <textarea
                className="form-input"
                style={{ minHeight: '200px', resize: 'vertical', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}
                value={editSystemPrompt}
                onChange={(e) => setEditSystemPrompt(e.target.value)}
                placeholder="Voce e um assistente de vendas..."
              />
              <p className="cx-vapi-hint">
                Instrucoes completas de comportamento do assistente.
              </p>
            </div>

            <div className="cx-vapi-actions">
              <p className="cx-vapi-snapshot-hint">
                <RotateCcw />
                Snapshot automatico antes de salvar
              </p>
              <button
                onClick={handleSaveAssistant}
                disabled={savingAssistant}
                className="btn btn-primary"
              >
                {savingAssistant ? (
                  <><Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} />Salvando no Vapi...</>
                ) : (
                  <><Save style={{ width: 16, height: 16 }} />Salvar no Vapi</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="cx-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "cx-toast cx-toast-success" : "cx-toast cx-toast-error"}>
            {t.type === "success" ? <Check style={{ width: 16, height: 16, color: 'var(--green)' }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
