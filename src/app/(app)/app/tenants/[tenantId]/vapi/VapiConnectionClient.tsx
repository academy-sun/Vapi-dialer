"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Key, Lock, Eye, EyeOff, Copy, Check, AlertTriangle, CheckCircle2,
  Loader2, Link, Info, Bot, ChevronDown, ChevronUp, Save, RotateCcw,
  Sparkles,
} from "lucide-react";

interface Connection {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
  assistant_id: string | null;
  success_field: string | null;
  success_value: string | null;
}

interface Assistant { id: string; name: string }
interface StructuredOutput { id: string; fields: string[] }

interface AssistantConfig {
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

export default function VapiConnectionClient() {
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

  // ── Section 2: Assistant Config ──
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>("");
  const [structuredOutputs, setStructuredOutputs] = useState<StructuredOutput[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [successField, setSuccessField] = useState<string>("");
  const [successValue, setSuccessValue] = useState<string>("sim");
  const [loadingStructured, setLoadingStructured] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // ── Section 3: Assistant Editor ──
  const [editorOpen, setEditorOpen] = useState(false);
  const [assistantConfig, setAssistantConfig] = useState<AssistantConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editFirstMessage, setEditFirstMessage] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [savingAssistant, setSavingAssistant] = useState(false);

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/vapi/${tenantId}`;

  // Load connection on mount
  useEffect(() => { loadConnection(); }, [tenantId]);

  async function loadConnection() {
    setFetchingConn(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`);
    const data = await res.json();
    const conn = data.connection as Connection | null;
    setConnection(conn);
    if (conn?.assistant_id) setSelectedAssistantId(conn.assistant_id);
    if (conn?.success_field) setSuccessField(conn.success_field);
    if (conn?.success_value) setSuccessValue(conn.success_value ?? "sim");
    setFetchingConn(false);

    if (conn) {
      loadAssistants();
    }
  }

  async function loadAssistants() {
    const res = await fetch(`/api/tenants/${tenantId}/vapi-resources`);
    const data = await res.json();
    setAssistants(data.assistants ?? []);
  }

  // When selectedAssistantId changes, fetch structured outputs
  useEffect(() => {
    if (!selectedAssistantId || !connection) return;
    loadStructuredOutputs(selectedAssistantId);
  }, [selectedAssistantId, connection]);

  async function loadStructuredOutputs(assistantId: string) {
    setLoadingStructured(true);
    setAllFields([]);
    setStructuredOutputs([]);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant?assistantId=${assistantId}`);
      const data = await res.json();
      setStructuredOutputs(data.structuredOutputs ?? []);
      setAllFields(data.allFields ?? []);
      // Load assistant config for editor
      if (data.assistant) {
        const a = data.assistant as AssistantConfig;
        setAssistantConfig(a);
        setEditName((a.name as string) ?? "");
        setEditFirstMessage((a.firstMessage as string) ?? "");
        setEditSystemPrompt((a.systemPrompt as string) ?? "");
      }
    } finally {
      setLoadingStructured(false);
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

  async function handleSaveConfig() {
    if (!successField) { showToast("Selecione o campo de sucesso", "error"); return; }
    setSavingConfig(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId: selectedAssistantId || null,
        successField: successField || null,
        successValue: successValue || "sim",
      }),
    });
    if (res.ok) {
      showToast("Configuracao salva!");
      loadConnection();
    } else {
      const d = await res.json();
      showToast(d.error ?? "Erro ao salvar", "error");
    }
    setSavingConfig(false);
  }

  async function handleSaveAssistant() {
    if (!selectedAssistantId) return;
    setSavingAssistant(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId: selectedAssistantId,
        name: editName,
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

  return (
    <div className="max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuracao Vapi</h1>
          <p className="page-subtitle">Gerencie sua chave de API, assistente e webhook do Vapi</p>
        </div>
      </div>

      {/* Status da conexao */}
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

      {/* Section 1: API Key */}
      <div className="card mb-5">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-500" />
            {connection ? "Atualizar" : "Adicionar"} Vapi API Key
          </h2>
        </div>
        <form onSubmit={handleSaveKey} className="card-body space-y-5">
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
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={savingKey || !apiKey.trim()} className="btn-primary">
              {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Key
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: Assistente + Campo de Sucesso (only when connected) */}
      {connection && (
        <div className="card mb-5">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Configuracao do Assistente
            </h2>
          </div>
          <div className="card-body space-y-5">
            {/* Assistant selector */}
            <div>
              <label className="form-label">Assistente principal</label>
              <select
                className="form-input"
                value={selectedAssistantId}
                onChange={(e) => setSelectedAssistantId(e.target.value)}
              >
                <option value="">Selecione um assistente...</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1.5">
                O assistente Vapi usado nas campanhas deste tenant.
              </p>
            </div>

            {/* Structured outputs field selector */}
            {selectedAssistantId && (
              <>
                {loadingStructured ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando campos do assistente...
                  </div>
                ) : allFields.length > 0 ? (
                  <>
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                      <p className="text-xs font-medium text-indigo-700 mb-1">
                        Campos disponíveis no Structured Output:
                      </p>
                      <p className="text-xs text-indigo-600 font-mono">
                        {allFields.join(", ")}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label">Campo de conversao</label>
                        <select
                          className="form-input"
                          value={successField}
                          onChange={(e) => setSuccessField(e.target.value)}
                        >
                          <option value="">Selecione o campo...</option>
                          {allFields.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                          Qual campo indica sucesso?
                        </p>
                      </div>

                      <div>
                        <label className="form-label">Valor de sucesso</label>
                        <input
                          type="text"
                          className="form-input"
                          value={successValue}
                          onChange={(e) => setSuccessValue(e.target.value)}
                          placeholder="sim, yes, true, 1..."
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Qual valor desse campo = convertido?
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400">
                    Este assistente nao tem Structured Outputs configurados.
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig || !selectedAssistantId}
                className="btn-primary"
              >
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar configuracao
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Assistant Editor (only when assistant selected and config loaded) */}
      {connection && selectedAssistantId && assistantConfig && (
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

          {editorOpen && (
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
          )}
        </div>
      )}

      {/* Webhook URL */}
      <div className="card mb-5">
        <div className="card-header flex items-center gap-2">
          <Link className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-900">URL do Webhook Vapi</h2>
        </div>
        <div className="card-body space-y-3">
          <p className="text-sm text-gray-500">
            Configure esta URL no painel do Vapi em{" "}
            <span className="font-medium text-gray-700">Settings - Webhooks</span>:
          </p>
          <div className="copy-field">
            <span className="flex-1 break-all select-all">{webhookUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
            </button>
          </div>
          <div className="alert-info text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
            <span>
              Cada tenant tem sua propria URL de webhook. Nao compartilhe entre tenants.
            </span>
          </div>
        </div>
      </div>

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
