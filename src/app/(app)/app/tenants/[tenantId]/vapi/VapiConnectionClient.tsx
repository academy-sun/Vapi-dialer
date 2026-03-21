"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Key,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Link,
  Info,
} from "lucide-react";

interface Connection {
  id: string;
  label: string;
  is_active: boolean;
  created_at: string;
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
  const [connection, setConnection] = useState<Connection | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("default");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingConn, setFetchingConn] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { toasts, show: showToast } = useToast();

  useEffect(() => { loadConnection(); }, [tenantId]);

  async function loadConnection() {
    setFetchingConn(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`);
    const data = await res.json();
    setConnection(data.connection);
    setFetchingConn(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, label }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      showToast(data.error ?? "Erro ao salvar", "error");
    } else {
      showToast("API Key salva com sucesso!");
      setApiKey("");
      loadConnection();
    }
    setLoading(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    showToast("URL copiada para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  }

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/vapi/${tenantId}`;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuração Vapi</h1>
          <p className="page-subtitle">Gerencie sua chave de API e webhook do Vapi</p>
        </div>
      </div>

      {/* Status da conexão */}
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

      {/* Formulário */}
      <div className="card mb-5">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-500" />
            {connection ? "Atualizar" : "Adicionar"} Vapi API Key
          </h2>
        </div>
        <form onSubmit={handleSave} className="card-body space-y-5">
          {error && (
            <div className="alert-error">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Label */}
          <div>
            <label className="form-label flex items-center gap-1.5">
              Label
              <span
                title="Um nome para identificar esta key (ex: produção, staging)"
                className="cursor-help"
              >
                <Info className="w-3.5 h-3.5 text-gray-400" />
              </span>
            </label>
            <input
              type="text"
              className="form-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: produção, staging, default"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Nome para identificar esta key. Útil quando há múltiplas configurações.
            </p>
          </div>

          {/* API Key */}
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
                placeholder="sk_live_••••••••••••••••••••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Sua key é criptografada com <span className="font-medium">AES-256-GCM</span> antes de ser armazenada.
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Salvar Key
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Webhook URL */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <Link className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-900">URL do Webhook Vapi</h2>
        </div>
        <div className="card-body space-y-3">
          <p className="text-sm text-gray-500">
            Configure esta URL no painel do Vapi em{" "}
            <span className="font-medium text-gray-700">Settings → Webhooks</span> para este tenant:
          </p>
          <div className="copy-field">
            <span className="flex-1 break-all select-all">{webhookUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 transition-colors"
              title="Copiar URL"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
          <div className="alert-info text-sm">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
            <span>
              Cada tenant tem sua própria URL de webhook com ID único. Não compartilhe esta URL entre tenants.
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
