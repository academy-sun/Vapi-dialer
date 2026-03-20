"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import {
  Plus,
  Upload,
  Users,
  Phone,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  X,
  Check,
  Download,
  UserPlus,
  Loader2,
  Pencil,
  Trash2,
  Link2,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowRight,
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
  last_outcome: string | null;
  next_attempt_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  new:               { label: "Novo",       badge: "badge-gray"   },
  queued:            { label: "Na fila",    badge: "badge-blue"   },
  calling:           { label: "Em ligação", badge: "badge-yellow" },
  completed:         { label: "Concluído",  badge: "badge-green"  },
  failed:            { label: "Falhou",     badge: "badge-red"    },
  doNotCall:         { label: "Não ligar",  badge: "badge-gray"   },
  callbackScheduled: { label: "Callback",   badge: "badge-purple" },
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

/* ── Modal: Criar lista ── */
function CreateListModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
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
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn-primary">
              {loading ? "Criando..." : "Criar Lista"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal: Adicionar lead manualmente ── */
function AddLeadModal({ onClose, onAdd, listName }: {
  onClose: () => void;
  onAdd: (fields: Record<string, string>) => Promise<void>;
  listName: string;
}) {
  const [phone,   setPhone]   = useState("");
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  // Campos extras dinâmicos: lista de { key, value }
  const [extras,  setExtras]  = useState<{ id: number; key: string; value: string }[]>([]);
  const nextId = useRef(0);

  function addExtra() {
    setExtras((p) => [...p, { id: nextId.current++, key: "", value: "" }]);
  }

  function removeExtra(id: number) {
    setExtras((p) => p.filter((e) => e.id !== id));
  }

  function updateExtra(id: number, field: "key" | "value", val: string) {
    setExtras((p) => p.map((e) => e.id === id ? { ...e, [field]: val } : e));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validar chaves duplicadas ou vazias nos extras
    const keys = extras.map((e) => e.key.trim()).filter(Boolean);
    const dupKey = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dupKey) { setError(`Campo duplicado: "${dupKey}"`); return; }

    const fields: Record<string, string> = { phone };
    if (name.trim())    fields.first_name = name.trim();
    for (const ex of extras) {
      const k = ex.key.trim();
      const v = ex.value.trim();
      if (k) fields[k] = v;
    }

    setLoading(true);
    try {
      await onAdd(fields);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar lead");
    }
    setLoading(false);
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adicionar Lead</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Lista: <span className="font-medium text-gray-600">{listName}</span>
            </p>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card-body space-y-4">
          {error && (
            <div className="alert-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Telefone */}
          <div>
            <label className="form-label flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-500" />
              Telefone <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="tel"
              className="form-input"
              placeholder="+55 (11) 99999-9999  ou  11999990001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Aceita com ou sem <code className="bg-gray-100 px-1 rounded font-mono">+55</code>, com ou sem máscara.
            </p>
          </div>

          {/* Primeiro nome */}
          <div>
            <label className="form-label flex items-center gap-1.5">
              Primeiro nome
              <code className="text-xs font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{"{{first_name}}"}</code>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: João"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Campos extras dinâmicos */}
          {extras.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-1">
                <span className="text-xs font-medium text-gray-500 px-1">Nome do campo</span>
                <span className="text-xs font-medium text-gray-500 px-1">Valor</span>
                <span />
              </div>
              {extras.map((ex) => (
                <div key={ex.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    className="form-input text-sm font-mono"
                    placeholder="ex: empresa"
                    value={ex.key}
                    onChange={(e) => updateExtra(ex.id, "key", e.target.value)}
                  />
                  <input
                    className="form-input text-sm"
                    placeholder="valor"
                    value={ex.value}
                    onChange={(e) => updateExtra(ex.id, "value", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeExtra(ex.id)}
                    className="btn-icon text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botão adicionar campo */}
          <button
            type="button"
            onClick={addExtra}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar campo extra
          </button>

          {extras.length > 0 && (
            <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
              Campos extras ficam disponíveis no assistente Vapi como{" "}
              {extras.filter((e) => e.key.trim()).slice(0, 2).map((e) => (
                <code key={e.id} className="font-mono bg-white px-1 rounded mx-0.5">{`{{${e.key.trim()}}}`}</code>
              ))}
              {extras.filter((e) => e.key.trim()).length > 2 && "…"}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !phone.trim()} className="btn-primary">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
              ) : (
                <><UserPlus className="w-4 h-4" />Adicionar Lead</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function downloadTemplate() {
  const csv = [
    "phone,name,company",
    "+5511999990001,João Silva,Empresa A",
    "+5511999990002,Maria Santos,Empresa B",
    "11988880003,Carlos Lima,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "template_leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Painel de Webhook de entrada ── */
function InboundWebhookPanel({
  tenantId,
  listId,
  listName,
  onToast,
}: {
  tenantId: string;
  listId: string;
  listName: string;
  onToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [secret, setSecret]           = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [copied, setCopied]           = useState<"url" | "secret" | null>(null);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/leads/${tenantId}/${listId}`
    : `/api/webhooks/leads/${tenantId}/${listId}`;

  useEffect(() => {
    setSecret(null);
    setShowSecret(false);
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/lead-lists/${listId}/webhook`)
      .then((r) => r.json())
      .then((d) => { setSecret(d.webhook_secret ?? null); })
      .finally(() => setLoading(false));
  }, [tenantId, listId]);

  async function generateSecret() {
    setGenerating(true);
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${listId}/webhook`, { method: "POST" });
    const data = await res.json();
    if (data.webhook_secret) {
      setSecret(data.webhook_secret);
      setShowSecret(true);
      onToast("Webhook secret gerado!");
    } else {
      onToast(data.error ?? "Erro ao gerar secret", "error");
    }
    setGenerating(false);
  }

  async function copyToClipboard(text: string, field: "url" | "secret") {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return <div className="skeleton h-32 rounded-xl" />;
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-indigo-500" />
              Webhook de Entrada
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Receba leads automaticamente de CRMs, n8n, formulários, etc.
            </p>
          </div>
          {secret && (
            <button
              onClick={generateSecret}
              disabled={generating}
              className="btn-secondary text-xs gap-1.5"
              title="Regenerar secret"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerar
            </button>
          )}
        </div>
      </div>
      <div className="card-body space-y-3">
        {/* URL */}
        <div>
          <label className="form-label text-xs">URL do Webhook (POST)</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={webhookUrl}
              className="form-input font-mono text-xs bg-gray-50 flex-1"
            />
            <button
              onClick={() => copyToClipboard(webhookUrl, "url")}
              className={`btn-secondary px-3 shrink-0 ${copied === "url" ? "text-emerald-600" : ""}`}
              title="Copiar URL"
            >
              {copied === "url" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Secret */}
        {secret ? (
          <div>
            <label className="form-label text-xs">Secret (Authorization: Bearer)</label>
            <div className="flex gap-2">
              <input
                readOnly
                type={showSecret ? "text" : "password"}
                value={secret}
                className="form-input font-mono text-xs bg-gray-50 flex-1"
              />
              <button
                onClick={() => setShowSecret((p) => !p)}
                className="btn-secondary px-3 shrink-0"
                title={showSecret ? "Ocultar" : "Mostrar"}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => copyToClipboard(secret, "secret")}
                className={`btn-secondary px-3 shrink-0 ${copied === "secret" ? "text-emerald-600" : ""}`}
                title="Copiar secret"
              >
                {copied === "secret" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">Sem secret configurado</p>
              <p className="mt-0.5 text-amber-700">
                Sem secret, qualquer requisição é aceita (útil para testes). Gere um secret para proteger o endpoint em produção.
              </p>
            </div>
          </div>
        )}

        {/* Body de exemplo */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Exemplo de body JSON:</p>
          <pre className="text-xs font-mono text-gray-700 leading-relaxed whitespace-pre-wrap">
{`{
  "phone": "+5511999990001",
  "name": "João Silva",
  "company": "Empresa A"
}`}
          </pre>
        </div>

        {!secret && (
          <button
            onClick={generateSecret}
            disabled={generating}
            className="btn-primary w-full justify-center"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
            ) : (
              <><Link2 className="w-4 h-4" /> Gerar Webhook Secret</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CSV Import Wizard
══════════════════════════════════════════════════════════════ */

const FIELD_OPTIONS = [
  { value: "phone",      label: "phone (obrigatório)", required: true },
  { value: "name",       label: "name" },
  { value: "last_name",  label: "last_name" },
  { value: "company",    label: "company" },
  { value: "email",      label: "email" },
  { value: "__custom__", label: "manter nome original" },
  { value: "__ignore__", label: "ignorar coluna" },
];

function autoSuggest(colName: string): string {
  const n = colName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (["phone","telefone","fone","celular","tel","mobile"].some((k) => n.includes(k))) return "phone";
  if (["nome","name","firstname","primeiro"].some((k) => n.includes(k))) return "name";
  if (["sobrenome","lastname","ultimo"].some((k) => n.includes(k))) return "last_name";
  if (["empresa","company","companhia"].some((k) => n.includes(k))) return "company";
  if (["email","mail","correo"].some((k) => n.includes(k))) return "email";
  return "__custom__";
}

interface CsvImportWizardProps {
  tenantId: string;
  listId: string;
  listName: string;
  onImportComplete: (imported: number, skipped: number) => void;
}

function CsvImportWizard({ tenantId, listId, listName, onImportComplete }: CsvImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const wizardFileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(1);
    setSelectedFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setMappings({});
    setImportError("");
    if (wizardFileRef.current) wizardFileRef.current.value = "";
  }

  async function processFile(file: File) {
    setSelectedFile(file);
    const text = await file.text();
    // Papa.parse com string é síncrono e retorna ParseResult
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = Papa.parse(text, { header: true, preview: 4, skipEmptyLines: true }) as any;
    const headers: string[] = result.meta?.fields ?? [];
    const rows: Record<string, string>[] = (result.data ?? []).slice(0, 3);
    setCsvHeaders(headers);
    setPreviewRows(rows);
    const initial: Record<string, string> = {};
    headers.forEach((h) => { initial[h] = autoSuggest(h); });
    setMappings(initial);
    setStep(2);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function setMapping(col: string, value: string) {
    setMappings((prev) => ({ ...prev, [col]: value }));
  }

  const phoneCount = Object.values(mappings).filter((v) => v === "phone").length;
  const canImport = phoneCount === 1;

  async function handleImport() {
    if (!selectedFile || !listId || !canImport) return;
    setStep(3);
    setImporting(true);
    setImportError("");
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("mappings", JSON.stringify(mappings));
    try {
      const res = await fetch(`/api/tenants/${tenantId}/lead-lists/${listId}/import`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        onImportComplete(data.imported ?? 0, data.skipped ?? 0);
        reset();
      } else {
        setImportError(data.error ?? "Erro ao importar");
      }
    } catch {
      setImportError("Erro de conexão ao importar CSV");
    }
    setImporting(false);
  }

  /* ── Barra de progresso ── */
  const stepLabels = ["Upload", "Mapear colunas", "Importando"];

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Importar Leads via CSV</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Para: <span className="font-medium text-gray-600">{listName}</span>
          </p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary text-xs gap-1.5" title="Baixar modelo CSV">
          <Download className="w-3.5 h-3.5" />
          Template CSV
        </button>
      </div>

      {/* Barra de steps */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-1">
          {stepLabels.map((label, i) => {
            const idx = i + 1;
            const isActive = step === idx;
            const isDone = step > idx;
            return (
              <div key={idx} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${
                  isDone ? "text-emerald-600" : isActive ? "text-indigo-600" : "text-gray-400"
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    isDone ? "bg-emerald-100 text-emerald-600" :
                    isActive ? "bg-indigo-100 text-indigo-600" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    {isDone ? <Check className="w-3 h-3" /> : idx}
                  </span>
                  <span className="truncate">{label}</span>
                </div>
                {i < stepLabels.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0 ml-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-body space-y-4">
        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div
            className={`upload-area ${dragOver ? "dragover" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => wizardFileRef.current?.click()}
          >
            <input
              ref={wizardFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
            <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700">
              Arraste um arquivo CSV ou clique para selecionar
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Somente arquivos <code className="bg-gray-100 px-1 rounded font-mono">.csv</code>
            </p>
          </div>
        )}

        {/* ── STEP 2: Mapear colunas ── */}
        {step === 2 && (
          <div className="space-y-4">
            {selectedFile && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-sm text-indigo-700 truncate">{selectedFile.name}</span>
                <span className="text-xs text-indigo-400 ml-auto shrink-0">{(selectedFile.size / 1024).toFixed(1)} KB</span>
              </div>
            )}

            {phoneCount === 0 && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">Mapeie exatamente uma coluna para <strong>phone</strong> antes de importar.</span>
              </div>
            )}
            {phoneCount > 1 && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">Apenas <strong>uma</strong> coluna pode ser mapeada para phone.</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 px-1 mb-1">
                <span className="text-xs font-medium text-gray-500">Coluna no CSV</span>
                <span />
                <span className="text-xs font-medium text-gray-500">Destino</span>
                <span className="text-xs font-medium text-gray-500">Status</span>
              </div>
              {csvHeaders.map((col) => {
                const dest = mappings[col] ?? "__custom__";
                const isPhone = dest === "phone";
                const isIgnore = dest === "__ignore__";
                return (
                  <div key={col} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-gray-100 text-xs font-mono text-gray-700 truncate">
                      {col}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <select
                      className="form-input text-sm py-1.5"
                      value={dest}
                      onChange={(e) => setMapping(col, e.target.value)}
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className={`text-xs font-medium shrink-0 ${
                      isPhone ? "text-emerald-600" :
                      isIgnore ? "text-gray-400" :
                      "text-indigo-600"
                    }`}>
                      {isPhone ? "●  phone" : isIgnore ? "✕  ignorar" : "○  mapeado"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Preview das 3 primeiras linhas */}
            {previewRows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Preview (primeiras {previewRows.length} linhas):</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        {csvHeaders.map((h) => (
                          <th key={h} className="whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {csvHeaders.map((h) => (
                            <td key={h} className="font-mono text-gray-600 whitespace-nowrap">{row[h] ?? "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={reset} className="btn-secondary">
                <X className="w-4 h-4" />
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!canImport}
                className="btn-primary"
              >
                <Upload className="w-4 h-4" />
                Importar
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Importando ── */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            {importing ? (
              <>
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-sm font-semibold text-gray-700">Importando leads...</p>
                <p className="text-xs text-gray-400">Por favor aguarde</p>
              </>
            ) : importError ? (
              <>
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm font-semibold text-red-700">Erro na importação</p>
                <p className="text-xs text-red-500">{importError}</p>
                <button onClick={reset} className="btn-secondary">
                  <RotateCcw className="w-4 h-4" />
                  Tentar novamente
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Página principal
══════════════════════════════════════════════════════════════ */
export default function LeadsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [lists, setLists]                   = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [leads, setLeads]                   = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads]     = useState(false);
  const [showCreate, setShowCreate]         = useState(false);
  const [showAddLead, setShowAddLead]       = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);
  const [searchLead, setSearchLead]         = useState("");
  const [pageError, setPageError]           = useState<string | null>(null);
  // Edição inline de nome da lista
  const [editingListId, setEditingListId]   = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState("");
  const { toasts, show: showToast } = useToast();

  useEffect(() => { loadLists(); }, [tenantId]);
  useEffect(() => { if (selectedListId) loadLeads(); }, [selectedListId]);

  async function loadLists() {
    setPageError(null);
    try {
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists`);
    if (!res.ok) { setPageError("Falha ao carregar listas de leads."); return; }
    const data = await res.json();
    setLists(data.leadLists ?? []);
    // BUG FIX: só auto-seleciona o primeiro item se NADA estiver selecionado
    // Evita resetar a seleção quando loadLists é chamado após criar/renomear lista
    setSelectedListId((prev) => prev || data.leadLists?.[0]?.id || "");
    } catch { setPageError("Erro de conexão ao carregar listas."); }
  }

  async function loadLeads() {
    setLoadingLeads(true);
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoadingLeads(false);
  }

  async function createList(name: string) {
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists`, {
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

  async function renameList(listId: string, newName: string) {
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${listId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error ?? "Erro ao renomear", "error"); return; }
    setLists((prev) => prev.map((l) => l.id === listId ? { ...l, name: newName } : l));
    setEditingListId(null);
    showToast("Lista renomeada!");
  }

  async function deleteList(listId: string, listName: string) {
    if (!confirm(`Apagar a lista "${listName}"? Todos os leads serão removidos.`)) return;
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists/${listId}`, { method: "DELETE" });
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (selectedListId === listId) {
        const remaining = lists.filter((l) => l.id !== listId);
        setSelectedListId(remaining[0]?.id ?? "");
        setLeads([]);
      }
      showToast("Lista removida.");
    }
  }

  async function resetStuckLeads() {
    if (!selectedListId) return;
    setResettingStuck(true);
    const res  = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${selectedListId}/reset-stuck`,
      { method: "POST" }
    );
    const data = await res.json();
    if (res.ok) {
      showToast(
        data.reset > 0
          ? `${data.reset} lead${data.reset > 1 ? "s" : ""} resetado${data.reset > 1 ? "s" : ""} para a fila`
          : "Nenhum lead travado encontrado",
        data.reset > 0 ? "success" : "success"
      );
      loadLeads();
    } else {
      showToast(data.error ?? "Erro ao resetar leads", "error");
    }
    setResettingStuck(false);
  }

  async function addLeadManual(fields: Record<string, string>) {
    const res  = await fetch(
      `/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar lead");
    showToast(`Lead ${fields.phone} adicionado com sucesso!`);
    loadLeads();
  }

  function handleImportComplete(imported: number, skipped: number) {
    showToast(
      `✓ ${imported} leads importados${skipped > 0 ? `, ${skipped} ignorados` : ""}`,
      "success"
    );
    loadLeads();
  }

  const activeList  = lists.find((l) => l.id === selectedListId);
  const stuckCount  = leads.filter((l) => l.status === "calling").length;

  const filteredLeads = searchLead.trim()
    ? leads.filter((lead) => {
        const q = searchLead.trim().toLowerCase().replace(/\D/g, "") || searchLead.trim().toLowerCase();
        const phoneMatch = lead.phone_e164.replace(/\D/g, "").includes(q);
        const nameMatch  = Object.values(lead.data_json ?? {}).some((v) =>
          String(v).toLowerCase().includes(searchLead.trim().toLowerCase())
        );
        return phoneMatch || nameMatch;
      })
    : leads;

  return (
    <div>
      {/* Error banner */}
      {pageError && (
        <div className="alert-error flex items-center gap-3 mb-4 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{pageError}</span>
          <button onClick={() => setPageError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Empty state */}
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

          {/* Coluna esquerda: seleção de lista */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Suas Listas</h2>
            {lists.map((list) => (
              <div
                key={list.id}
                className={`card transition-all ${
                  list.id === selectedListId
                    ? "ring-2 ring-indigo-500 bg-indigo-50/50"
                    : "hover:shadow-md hover:border-gray-200"
                }`}
              >
                {editingListId === list.id ? (
                  /* ── Modo edição inline ── */
                  <div className="px-4 py-3 flex items-center gap-2">
                    <input
                      type="text"
                      className="form-input flex-1 text-sm py-1.5"
                      value={editingListName}
                      onChange={(e) => setEditingListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameList(list.id, editingListName);
                        if (e.key === "Escape") setEditingListId(null);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => renameList(list.id, editingListName)}
                      disabled={!editingListName.trim()}
                      className="btn-primary btn-sm px-2 py-1"
                      title="Salvar"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingListId(null)}
                      className="btn-secondary btn-sm px-2 py-1"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  /* ── Modo normal ── */
                  <div
                    className="px-4 py-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setSelectedListId(list.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        list.id === selectedListId ? "bg-indigo-100" : "bg-gray-100"
                      }`}>
                        <Users className={`w-4 h-4 ${list.id === selectedListId ? "text-indigo-600" : "text-gray-500"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{list.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(list.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingListId(list.id);
                          setEditingListName(list.name);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Renomear lista"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteList(list.id, list.name);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                        title="Apagar lista"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className={`w-4 h-4 ${
                        list.id === selectedListId ? "text-indigo-500" : "text-gray-300"
                      }`} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Coluna direita: importar CSV + tabela */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── CSV Import Wizard ── */}
            {selectedListId && (
              <CsvImportWizard
                tenantId={tenantId}
                listId={selectedListId}
                listName={activeList?.name ?? ""}
                onImportComplete={handleImportComplete}
              />
            )}

            {/* ── Webhook de Entrada ── */}
            {selectedListId && (
              <InboundWebhookPanel
                tenantId={tenantId}
                listId={selectedListId}
                listName={activeList?.name ?? ""}
                onToast={showToast}
              />
            )}

            {/* ── Tabela de leads ── */}
            <div>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide shrink-0">
                  Leads da Lista{" "}
                  {leads.length > 0 && (
                    <span className="text-gray-400 font-normal normal-case">
                      ({filteredLeads.length}{filteredLeads.length !== leads.length ? ` de ${leads.length}` : ""})
                    </span>
                  )}
                </h3>
                {leads.length > 0 && (
                  <div className="relative flex-1 max-w-xs">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      className="form-input pl-9 py-1.5 text-sm w-full"
                      placeholder="Buscar por telefone ou nome..."
                      value={searchLead}
                      onChange={(e) => setSearchLead(e.target.value)}
                    />
                    {searchLead && (
                      <button onClick={() => setSearchLead("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {/* Botão de reset aparece só se há leads travados em 'calling' */}
                  {stuckCount > 0 && (
                    <button
                      onClick={resetStuckLeads}
                      disabled={resettingStuck}
                      className="btn-secondary text-xs gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                      title={`${stuckCount} lead${stuckCount > 1 ? "s" : ""} preso${stuckCount > 1 ? "s" : ""} em "Em ligação" — clique para resetar para a fila`}
                    >
                      {resettingStuck
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5" />
                      }
                      Resetar travados ({stuckCount})
                    </button>
                  )}
                  {selectedListId && (
                    <button
                      onClick={() => setShowAddLead(true)}
                      className="btn-secondary text-xs gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Adicionar Lead
                    </button>
                  )}
                </div>
              </div>

              {loadingLeads ? (
                <div className="card">
                  <div className="divide-y divide-gray-50">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="px-5 py-4 flex gap-4">
                        <div className="skeleton h-4 w-32" />
                        <div className="skeleton h-4 w-28" />
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
                        <th>Nome / Empresa</th>
                        <th>Campos extras</th>
                        <th>Atendido?</th>
                        <th>Status</th>
                        <th>Tent.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                            Nenhum lead encontrado para "{searchLead}"
                          </td>
                        </tr>
                      ) : filteredLeads.map((lead) => {
                        const statusCfg = STATUS_CONFIG[lead.status] ?? { label: lead.status, badge: "badge-gray" };
                        const { name, company, nome, empresa, ...rest } = lead.data_json ?? {};
                        const displayName = name ?? nome;
                        const displayCompany = company ?? empresa;
                        const extras = Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(" · ");

                        // Atendido: baseado em last_outcome
                        const ANSWERED = new Set(["customer-ended-call", "assistant-ended-call"]);
                        const NO_ANSWER = new Set(["no-answer", "busy", "voicemail", "machine_end_silence", "machine_end_other"]);
                        const answered =
                          lead.last_outcome == null ? null
                          : ANSWERED.has(lead.last_outcome) ? true
                          : NO_ANSWER.has(lead.last_outcome) ? false
                          : null;

                        // Próxima tentativa
                        const nextAt = lead.next_attempt_at ? new Date(lead.next_attempt_at) : null;
                        const nextAtLabel = nextAt
                          ? nextAt < new Date()
                            ? "Imediato"
                            : nextAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : null;

                        return (
                          <tr key={lead.id}>
                            <td className="font-mono font-medium text-gray-900 text-xs">{lead.phone_e164}</td>
                            <td>
                              {displayName ? (
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{displayName}</p>
                                  {displayCompany && <p className="text-xs text-gray-400">{displayCompany}</p>}
                                </div>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="text-gray-400 text-xs max-w-[180px] truncate" title={extras}>{extras || "—"}</td>
                            <td>
                              {answered === true && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Sim
                                </span>
                              )}
                              {answered === false && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                                  <XCircle className="w-3.5 h-3.5" /> Não
                                </span>
                              )}
                              {answered === null && <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td>
                              <div className="space-y-0.5">
                                <span className={statusCfg.badge}>{statusCfg.label}</span>
                                {nextAtLabel && lead.status === "queued" && (
                                  <p className="text-xs text-indigo-500 mt-0.5">
                                    Retry: {nextAtLabel}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="text-gray-500 text-center">{lead.attempt_count}</td>
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
                      Importe um CSV ou adicione leads manualmente para começar.
                    </p>
                    <button onClick={() => setShowAddLead(true)} className="btn-secondary">
                      <UserPlus className="w-4 h-4" />
                      Adicionar primeiro lead
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar lista */}
      {showCreate && (
        <CreateListModal onClose={() => setShowCreate(false)} onCreate={createList} />
      )}

      {/* Modal: Adicionar lead manualmente */}
      {showAddLead && activeList && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onAdd={addLeadManual}
          listName={activeList.name}
        />
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success"
              ? <Check className="w-4 h-4 text-emerald-400" />
              : <AlertCircle className="w-4 h-4" />
            }
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
