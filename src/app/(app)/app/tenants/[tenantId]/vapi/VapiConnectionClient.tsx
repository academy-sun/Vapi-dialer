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
      showToast("Minutos contratados salvos!");
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
    <div className="max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações Vapi</h1>
          <p className="page-subtitle">Gerencie sua chave de API, assistente e webhook do Vapi</p>
        </div>
      </div>

      {/* Status da conexao — full width */}
      {fetchingConn ? (
        <div className="card p-5 mb-5">
          <div className="flex items-center gap-3">
            <div className="skeleton w-5 h-5 rounded-full" />
            <div className="skeleton h-4 w-48" />
          </div>
        </div>
      ) : connection ? (
        <div className="alert-success mb-6">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
          <div>
            <p className="font-semibold text-sm">Vapi conectada com sucesso!</p>
            <p className="text-sm mt-0.5 text-emerald-700">
              Label: <span className="font-medium">{connection.label}</span> · Configurada em{" "}
              {new Date(connection.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
      ) : (
        <div className="alert-warning mb-6">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold text-sm">Nenhuma Vapi key configurada</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Adicione sua API Key do Vapi abaixo para ativar chamadas neste tenant.
            </p>
          </div>
        </div>
      )}

      {/* Linha 1: 2-column grid — API Key | Limite de chamadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Section 1: API Key */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-500" />
              Vapi API Key
            </h2>
            {connection && !expandKeyForm && (
              <button
                onClick={() => setExpandKeyForm(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
              >
                Atualizar key
              </button>
            )}
          </div>

          {/* Compact state — key already configured */}
          {connection && !expandKeyForm ? (
            <div className="card-body">
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">API Key configurada</p>
                  <p className="text-xs text-gray-400 font-mono">
                    sk_live_••••••••  ·  Label: <span className="font-medium text-gray-600">{connection.label}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { handleSaveKey(e); setExpandKeyForm(false); }} className="card-body space-y-5">
              {keyError && (
                <div className="alert-error">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{keyError}</span>
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
                <label className="form-label flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-gray-500" />
                  Vapi API Key (privada)
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    className="form-input pr-10 font-mono"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk_live_"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Criptografada com <span className="font-medium">AES-256-GCM</span> antes de ser armazenada.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                {connection && (
                  <button type="button" onClick={() => setExpandKeyForm(false)} className="btn-ghost text-sm">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={savingKey || !apiKey.trim()} className="btn-primary ml-auto">
                  {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar Key
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Section 1.5: Limite de Concorrência da Org Vapi */}
        {connection && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                Limite de chamadas simultâneas (org Vapi)
              </h2>
            </div>
            <div className="card-body space-y-4">
              <div className="alert-info text-sm">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  Cada conta Vapi tem um número máximo de chamadas simultâneas (slots de concorrência da org).
                  O worker distribui esses slots proporcionalmente entre todas as campanhas ativas deste tenant.
                  Verifique seu limite em: <span className="font-medium">Vapi Dashboard → Billing / Plan</span>.
                </span>
              </div>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="form-label">Slots simultâneos da org Vapi</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={100}
                    value={concurrencyLimit}
                    onChange={(e) => setConcurrencyLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    Dividido igualmente entre campanhas ativas. Ex: 10 slots ÷ 3 campanhas = 3 + 3 + 4.
                  </p>
                </div>
                <button
                  onClick={handleSaveConcurrency}
                  disabled={savingConcurrency}
                  className="btn-primary shrink-0"
                >
                  {savingConcurrency ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>{/* end grid linha 1 */}

      {/* Section 1.8: Minutos Contratados — visível apenas para admins */}
      {isAdmin && connection && (
        <div className="card mb-5" style={{ borderLeft: "3px solid #FF1A1A" }}>
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-500" />
              Minutos contratados por mês
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-red-100 text-red-700">Admin</span>
            </h2>
            {minutesBlocked && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                Conta bloqueada
              </span>
            )}
          </div>
          <div className="card-body space-y-4">
            {minutesBlocked && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800">Conta bloqueada por consumo de minutos</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Todas as campanhas foram pausadas automaticamente. Aumente os minutos contratados e clique em desbloquear.
                  </p>
                </div>
                <button
                  onClick={handleUnblockAccount}
                  disabled={savingUnblock}
                  className="btn-primary shrink-0 text-xs"
                  style={{ background: "#dc2626" }}
                >
                  {savingUnblock ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Desbloquear
                </button>
              </div>
            )}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="form-label">Minutos contratados por mês</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  value={contractedMinutesInput}
                  onChange={(e) => setContractedMinutesInput(e.target.value)}
                  placeholder="Ex: 500 (deixe vazio para desativar o controle)"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Quando o cliente atingir 100%, as campanhas são pausadas automaticamente.
                  {contractedMinutes != null && connection.minutes_used_cache != null && (
                    <> Uso atual: <span className="font-medium text-gray-600">{Math.ceil(connection.minutes_used_cache / 60)} min</span> de <span className="font-medium text-gray-600">{contractedMinutes} min</span> ({connection.minutes_cache_month ?? "—"}).</>
                  )}
                </p>
              </div>
              <button
                onClick={handleSaveContracted}
                disabled={savingContracted}
                className="btn-primary shrink-0"
              >
                {savingContracted ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chave Pública Vapi (para Testar Assistente) */}
      {connection && (
        <div className="card mb-5">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-500" />
              Chave Pública Vapi
            </h2>
            {connection.has_public_key && !expandPublicKeyForm && (
              <button
                onClick={() => setExpandPublicKeyForm(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
              >
                Atualizar
              </button>
            )}
          </div>

          {connection.has_public_key && !expandPublicKeyForm ? (
            <div className="card-body">
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Chave Pública configurada</p>
                  <p className="text-xs text-gray-400 font-mono">pk_live_••••••••  ·  Botão &quot;Testar Assistente&quot; disponível</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-body space-y-4">
              {!connection.has_public_key && (
                <div className="alert-warning text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    Sem chave pública configurada — o botão <strong>&quot;Testar Assistente&quot;</strong> ficará indisponível.
                    Encontre sua chave pública em{" "}
                    <span className="font-medium">Vapi Dashboard → Account → API Keys → Public Key</span>.
                  </span>
                </div>
              )}
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-gray-500" />
                  Vapi Public Key
                </label>
                <input
                  type="password"
                  className="form-input font-mono"
                  value={publicKeyInput}
                  onChange={(e) => setPublicKeyInput(e.target.value)}
                  placeholder="pk_live_..."
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Chave pública para iniciar chamadas WebRTC diretamente do navegador.
                  Diferente da chave privada — é segura para uso no frontend.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                {connection.has_public_key && (
                  <button type="button" onClick={() => setExpandPublicKeyForm(false)} className="btn-ghost text-sm">
                    Cancelar
                  </button>
                )}
                <button
                  onClick={handleSavePublicKey}
                  disabled={savingPublicKey || !publicKeyInput.trim()}
                  className="btn-primary ml-auto"
                >
                  {savingPublicKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar Chave Pública
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linha 2: Webhook do Assistente — full width */}
      {connection && (
        <div className="card mb-5">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-500" />
              Webhook do Assistente
            </h2>
          </div>
          <div className="card-body space-y-4">
            <p className="text-xs text-gray-500">
              Sincroniza o assistente Vapi para receber eventos de fim de chamada em tempo real.
              Cole a URL abaixo manualmente em <span className="font-medium text-gray-700">Vapi Dashboard → Assistants → Server URL</span>,
              ou use o botão para enviar automaticamente via API.
            </p>

            {/* URL — full width */}
            <div>
              <label className="form-label">URL do Webhook</label>
              <div className="copy-field text-xs font-mono text-gray-600">
                <span className="flex-1 break-all select-all">{webhookUrl}</span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 transition-colors ml-1"
                  title="Copiar URL"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
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
                <p className="text-[11px] text-gray-400 mt-1 font-mono">ID: {webhookAssistantId}</p>
              )}
            </div>

            {/* Feedback */}
            {webhookStatus && (
              <div className={webhookStatus.ok ? "alert-success" : "alert-error"}>
                {webhookStatus.ok
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span className="text-sm">{webhookStatus.msg}</span>
              </div>
            )}

            {/* Button — right-aligned */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleUpdateWebhook}
                disabled={updatingWebhook || !webhookAssistantId}
                className="btn-primary shrink-0 ml-4"
              >
                {updatingWebhook
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Atualizando…</>
                  : <><Webhook className="w-4 h-4" />Atualizar no Assistente</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linha 3: Assistentes configurados — full width */}
      {connection && (
        <div className="card mb-5" id="assistentes">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Assistentes configurados
            </h2>
            {loadingAssistants && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <div className="card-body space-y-4">
            <p className="text-xs text-gray-500">
              Configure o critério de sucesso para cada assistente da conta Vapi.
              O sistema usa esse critério para calcular a taxa de conversão nos relatórios.
            </p>

            {/* Lista de assistentes da conta Vapi */}
            {assistants.length === 0 && !loadingAssistants ? (
              <p className="text-sm text-gray-400">Nenhum assistente encontrado na conta Vapi.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {assistants.map((assistant) => {
                  const cfg = assistantConfigs.find((c) => c.assistant_id === assistant.id);
                  const isEditing = editingAssistantId === assistant.id;

                  return (
                    <div key={assistant.id} className="py-3">
                      {/* Row header */}
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {cfg?.name ?? assistant.name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{assistant.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {cfg?.success_field ? (
                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-medium">
                              {cfg.success_field} = {cfg.success_value}
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              Sem critério configurado
                            </span>
                          )}
                          <button
                            onClick={() => isEditing ? setEditingAssistantId(null) : startEditAssistant(assistant.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Editar configuração"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {cfg && (
                            <button
                              onClick={() => handleDeleteAssistantConfig(assistant.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remover configuração"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
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
                            <p className="text-xs text-gray-400 mt-1">Ex: "Agente Imobiliária", "Agente Cobrança"</p>
                          </div>

                          {/* Structured output fields */}
                          {loadingFields ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Carregando campos do assistente...
                            </div>
                          ) : editForm.fields.length > 0 ? (
                            <>
                              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                                <p className="text-xs font-medium text-indigo-700 mb-1">
                                  Campos disponíveis no Structured Output:
                                </p>
                                <p className="text-xs text-indigo-600 font-mono">
                                  {editForm.fields.join(", ")}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
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
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="form-label">Campo de conversão</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={editForm.successField}
                                  onChange={(e) => setEditForm((p) => ({ ...p, successField: e.target.value }))}
                                  placeholder="ex: QuerReuniao"
                                />
                                <p className="text-xs text-gray-400 mt-1">Assistente sem Structured Outputs — digite manualmente</p>
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

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingAssistantId(null)}
                              className="btn-ghost text-sm"
                            >
                              Cancelar
                            </button>
                            <div className="flex gap-2">
                              {/* Botão para abrir editor de prompt */}
                              <button
                                type="button"
                                onClick={() => { setEditorAssistantId(assistant.id); setEditorOpen(true); }}
                                className="btn-secondary text-sm flex items-center gap-1.5"
                              >
                                <Bot className="w-3.5 h-3.5" />
                                Editar prompt
                              </button>
                              <button
                                onClick={handleSaveAssistantConfig}
                                disabled={savingAssistantConfig}
                                className="btn-primary"
                              >
                                {savingAssistantConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
        <div className="card mb-5">
          <button
            className="card-header w-full flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setEditorOpen(!editorOpen)}
          >
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-500" />
              Editor do Assistente
            </h2>
            {editorOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          <div className="card-body space-y-5">
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
                className="form-input min-h-[80px] resize-y"
                value={editFirstMessage}
                onChange={(e) => setEditFirstMessage(e.target.value)}
                placeholder="Ola! Sou a IA da empresa X..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Primeira coisa que o assistente diz quando a chamada e atendida.
              </p>
            </div>

            <div>
              <label className="form-label">Prompt do sistema</label>
              <textarea
                className="form-input min-h-[200px] resize-y font-mono text-sm"
                value={editSystemPrompt}
                onChange={(e) => setEditSystemPrompt(e.target.value)}
                placeholder="Voce e um assistente de vendas..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Instrucoes completas de comportamento do assistente.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                Snapshot automatico antes de salvar
              </p>
              <button
                onClick={handleSaveAssistant}
                disabled={savingAssistant}
                className="btn-primary"
              >
                {savingAssistant ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Salvando no Vapi...</>
                ) : (
                  <><Save className="w-4 h-4" />Salvar no Vapi</>
                )}
              </button>
            </div>
          </div>
        </div>
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
