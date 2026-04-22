"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import CallDetailDrawer from "@/components/CallDetailDrawer";
import { type CallDetail } from "@/lib/calls-shared";
import {
  Plus,
  Upload,
  Users,
  Phone,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
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
  Filter,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";

interface LeadList {
  id: string;
  name: string;
  created_at: string;
}

interface Queue {
  id: string;
  name: string;
  lead_list_id: string;
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
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>Nova Lista de Leads</h2>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "8px" }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary">
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
      <div className="modal" style={{ maxWidth: "32rem" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>Adicionar Lead</h2>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
              Lista: <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{listName}</span>
            </p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && (
            <div className="alert-error">
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: "13px" }}>{error}</span>
            </div>
          )}

          {/* Telefone */}
          <div>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Phone style={{ width: 14, height: 14, color: "var(--text-3)" }} />
              Telefone <span style={{ color: "var(--red)", marginLeft: "2px" }}>*</span>
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
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>
              Aceita com ou sem <code className="mono" style={{ background: "var(--glass-bg-2)", padding: "1px 5px", borderRadius: "4px", fontSize: "11px" }}>+55</code>, com ou sem máscara.
            </p>
          </div>

          {/* Primeiro nome */}
          <div>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              Primeiro nome
              <code className="mono" style={{ fontSize: "11px", background: "var(--glass-bg-2)", color: "var(--purple)", padding: "2px 6px", borderRadius: "4px" }}>{"{{first_name}}"}</code>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", padding: "0 4px" }}>Nome do campo</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", padding: "0 4px" }}>Valor</span>
                <span />
              </div>
              {extras.map((ex) => (
                <div key={ex.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "8px", alignItems: "center" }}>
                  <input
                    className="form-input mono"
                    style={{ fontSize: "13px" }}
                    placeholder="ex: empresa"
                    value={ex.key}
                    onChange={(e) => updateExtra(ex.id, "key", e.target.value)}
                  />
                  <input
                    className="form-input"
                    style={{ fontSize: "13px" }}
                    placeholder="valor"
                    value={ex.value}
                    onChange={(e) => updateExtra(ex.id, "value", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeExtra(ex.id)}
                    className="btn-icon"
                    style={{ color: "var(--text-3)" }}
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botão adicionar campo */}
          <button
            type="button"
            onClick={addExtra}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "8px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--glass-border)",
              fontSize: "13px", color: "var(--text-3)", background: "none", cursor: "pointer",
              transition: "all .15s",
            }}
          >
            <Plus style={{ width: 16, height: 16 }} />
            Adicionar campo extra
          </button>

          {extras.length > 0 && (
            <p style={{ fontSize: "11px", color: "var(--purple)", background: "rgba(168,85,247,0.08)", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
              Campos extras ficam disponíveis no assistente Vapi como{" "}
              {extras.filter((e) => e.key.trim()).slice(0, 2).map((e) => (
                <code key={e.id} className="mono" style={{ background: "var(--glass-bg-2)", padding: "1px 5px", borderRadius: "4px", margin: "0 2px", fontSize: "11px" }}>{`{{${e.key.trim()}}}`}</code>
              ))}
              {extras.filter((e) => e.key.trim()).length > 2 && "…"}
            </p>
          )}

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "8px", borderTop: "1px solid var(--glass-border)" }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || !phone.trim()} className="btn btn-primary">
              {loading ? (
                <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />Salvando...</>
              ) : (
                <><UserPlus style={{ width: 16, height: 16 }} />Adicionar Lead</>
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
    return <div className="skeleton" style={{ height: "128px", borderRadius: "var(--radius)" }} />;
  }

  return (
    <div className="gc">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Link2 style={{ width: 16, height: 16, color: "var(--purple)" }} />
              Webhook de Entrada
            </h3>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
              Receba leads automaticamente de CRMs, n8n, formulários, etc.
            </p>
          </div>
          {secret && (
            <button
              onClick={generateSecret}
              disabled={generating}
              className="btn btn-secondary btn-sm"
              style={{ gap: "6px" }}
              title="Regenerar secret"
            >
              {generating ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
              Regenerar
            </button>
          )}
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* URL */}
        <div>
          <label className="form-label" style={{ fontSize: "11px" }}>URL do Webhook (POST)</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              readOnly
              value={webhookUrl}
              className="form-input mono"
              style={{ fontSize: "11px", flex: 1 }}
            />
            <button
              onClick={() => copyToClipboard(webhookUrl, "url")}
              className={`btn btn-secondary`}
              style={{ padding: "8px 12px", flexShrink: 0, color: copied === "url" ? "var(--green)" : undefined }}
              title="Copiar URL"
            >
              {copied === "url" ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>

        {/* Secret */}
        {secret ? (
          <div>
            <label className="form-label" style={{ fontSize: "11px" }}>Secret (Authorization: Bearer)</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                readOnly
                type={showSecret ? "text" : "password"}
                value={secret}
                className="form-input mono"
                style={{ fontSize: "11px", flex: 1 }}
              />
              <button
                onClick={() => setShowSecret((p) => !p)}
                className="btn btn-secondary"
                style={{ padding: "8px 12px", flexShrink: 0 }}
                title={showSecret ? "Ocultar" : "Mostrar"}
              >
                {showSecret ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
              </button>
              <button
                onClick={() => copyToClipboard(secret, "secret")}
                className={`btn btn-secondary`}
                style={{ padding: "8px 12px", flexShrink: 0, color: copied === "secret" ? "var(--green)" : undefined }}
                title="Copiar secret"
              >
                {copied === "secret" ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="alert-warning" style={{ gap: "8px" }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: "2px" }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: "12px" }}>Sem secret configurado</p>
              <p style={{ marginTop: "2px", fontSize: "12px", opacity: 0.8 }}>
                Sem secret, qualquer requisição é aceita (útil para testes). Gere um secret para proteger o endpoint em produção.
              </p>
            </div>
          </div>
        )}

        {/* Body de exemplo */}
        <div style={{ borderRadius: "var(--radius-sm)", background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)", padding: "10px 12px" }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)", marginBottom: "6px" }}>Exemplo de body JSON:</p>
          <pre className="mono" style={{ fontSize: "11px", color: "var(--text-2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
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
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
          >
            {generating ? (
              <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Gerando...</>
            ) : (
              <><Link2 style={{ width: 16, height: 16 }} /> Gerar Webhook Secret</>
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

// ── Constantes de mapeamento ──────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: "phone",      label: "phone (obrigatório)" },
  { value: "name",       label: "name" },
  { value: "last_name",  label: "last_name" },
  { value: "company",    label: "company" },
  { value: "email",      label: "email" },
  { value: "__custom__", label: "manter nome original" },
  { value: "__ignore__", label: "ignorar coluna" },
];

function autoSuggest(colName: string): string {
  const n = colName.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (["phone","telefone","fone","celular","tel","mobile"].some(k => n.includes(k))) return "phone";
  if (["nome","name","firstname","primeiro"].some(k => n.includes(k))) return "name";
  if (["sobrenome","lastname","ultimo"].some(k => n.includes(k))) return "last_name";
  if (["empresa","company","companhia"].some(k => n.includes(k))) return "company";
  if (["email","mail","correo"].some(k => n.includes(k))) return "email";
  return "__custom__";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CsvImportWizardProps {
  tenantId: string;
  listId: string;
  listName: string;
  onImportComplete: (imported: number, skipped: number) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

function CsvImportWizard({ tenantId, listId, listName, onImportComplete }: CsvImportWizardProps) {
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [dragOver, setDragOver]       = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders]   = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings]       = useState<Record<string, string>>({});
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError]             = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Validação: exatamente 1 coluna mapeada para "phone"
  const phoneMappedCount = Object.values(mappings).filter(v => v === "phone").length;
  const canImport = phoneMappedCount === 1;

  function applyParsedData(headers: string[], rows: Record<string, string>[]) {
    setCsvHeaders(headers);
    setPreviewRows(rows);
    const initial: Record<string, string> = {};
    headers.forEach(h => { initial[h] = autoSuggest(h); });
    setMappings(initial);
    setStep(2);
  }

  function parseFile(file: File) {
    setSelectedFile(file);
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx") {
      // ── XLSX: ler como ArrayBuffer e converter com a lib xlsx ──
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(buffer);
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) { setError("Planilha XLSX vazia"); return; }
          // header:1 → retorna arrays de valores, primeira linha = cabeçalho
          const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
          if (raw.length < 2) { setError("Planilha XLSX sem dados"); return; }
          const headers = (raw[0] as string[]).map(String).filter(Boolean);
          const rows = raw.slice(1, 4).map((row) => {
            const r: Record<string, string> = {};
            headers.forEach((h, i) => { r[h] = String((row as string[])[i] ?? ""); });
            return r;
          });
          applyParsedData(headers, rows);
        } catch {
          setError("Erro ao ler o arquivo XLSX. Verifique se o arquivo não está corrompido.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // ── CSV: ler como texto com PapaParse ──
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) ?? "";
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          preview: 4,
          skipEmptyLines: true,
          delimiter: "",  // auto-detect: suporta CSV com , ou ;
        });
        const headers = result.meta.fields ?? [];
        const rows = result.data.slice(0, 3) as Record<string, string>[];
        applyParsedData(headers, rows);
      };
      reader.readAsText(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    const ext = file?.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "xlsx") parseFile(file);
    else setError("Apenas arquivos .csv ou .xlsx são aceitos");
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  async function handleImport() {
    if (!selectedFile || !canImport) return;
    setImporting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("mappings", JSON.stringify(mappings));
      const res = await fetch(
        `/api/tenants/${tenantId}/lead-lists/${listId}/import`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao importar");
        setImporting(false);
        return;
      }
      setResult({ imported: data.imported, skipped: data.skipped, errors: data.errors ?? [] });
      onImportComplete(data.imported, data.skipped);
      setStep(3); // Mostra o resultado do sucesso só após as funções terminarem antes de dar loading false
    } catch {
      setError("Erro de conexão ao importar");
    }
    setImporting(false);
  }

  function reset() {
    setStep(1);
    setSelectedFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setMappings({});
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="gc">
      {/* Header com barra de steps */}
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>Importar Leads via CSV</h3>
          <p style={{ fontSize: "11px", color: "var(--text-3)" }}>Lista: <span style={{ fontWeight: 600, color: "var(--text-2)" }}>{listName}</span></p>
        </div>
        {/* Barra de progresso dos steps */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
          {[
            { n: 1, label: "Upload" },
            { n: 2, label: "Mapear colunas" },
            { n: 3, label: "Importar" },
          ].map(({ n, label }, i) => (
            <React.Fragment key={n}>
              {i > 0 && (
                <div style={{ flex: 1, height: "2px", background: step > i ? "var(--red)" : "var(--glass-border)" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                <div style={{
                  width: "24px", height: "24px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700,
                  background: step > n ? "var(--green)" : step === n ? "var(--red)" : "var(--glass-bg-2)",
                  color: step >= n ? "#fff" : "var(--text-3)",
                }}>
                  {step > n ? "✓" : n}
                </div>
                <span style={{ fontSize: "11px", fontWeight: step === n ? 700 : 400, color: step === n ? "var(--text-1)" : "var(--text-3)" }}>
                  {label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="card-body">
        {/* Erro global */}
        {error && (
          <div className="alert-error" style={{ marginBottom: "16px" }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: "13px" }}>{error}</span>
          </div>
        )}

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div
            className={`upload-area ${dragOver ? "dragover" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={handleFileInput} />
            <Upload style={{ width: 32, height: 32, color: "var(--red)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-1)" }}>Arraste um arquivo CSV ou XLSX, ou clique para selecionar</p>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>
              Aceita <strong style={{ color: "var(--text-2)" }}>CSV</strong> e <strong style={{ color: "var(--text-2)" }}>XLSX</strong> · Mapeie as colunas no próximo passo · Duplicatas ignoradas automaticamente
            </p>
          </div>
        )}

        {/* ── STEP 2: Mapeamento de colunas ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Alertas de validação */}
            {phoneMappedCount === 0 && (
              <div className="alert-warning">
                <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: "13px" }}>Mapeie exatamente uma coluna para <strong>phone</strong> antes de importar.</span>
              </div>
            )}
            {phoneMappedCount > 1 && (
              <div className="alert-error">
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: "13px" }}>Você mapeou {phoneMappedCount} colunas para phone. Escolha apenas uma.</span>
              </div>
            )}

            {/* Label contador */}
            <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              {csvHeaders.length} colunas detectadas — defina o destino de cada uma
            </p>

            {/* Linhas de mapeamento — UMA POR LINHA, empilhadas verticalmente */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {csvHeaders.map((col) => (
                <div key={col} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* Coluna original — largura fixa */}
                  <div style={{ flex: "0 0 180px" }}>
                    <span className="mono" style={{
                      display: "block",
                      padding: "8px 12px",
                      background: "var(--glass-bg-2)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "12px",
                      color: "var(--text-1)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {col}
                    </span>
                  </div>

                  {/* Seta */}
                  <span style={{ color: "var(--text-3)", fontSize: "16px", flexShrink: 0 }}>→</span>

                  {/* Select de destino — ocupa o espaço restante */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      className="cx-select"
                      style={{ width: "100%" }}
                      value={mappings[col] ?? "__custom__"}
                      onChange={(e) => setMappings(prev => ({ ...prev, [col]: e.target.value }))}
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Badge de status — largura fixa */}
                  <div style={{ flex: "0 0 100px", textAlign: "right" }}>
                    {mappings[col] === "phone" && (
                      <span className="badge badge-green">obrigatório ✓</span>
                    )}
                    {mappings[col] === "__ignore__" && (
                      <span className="badge badge-gray">ignorar</span>
                    )}
                    {mappings[col] !== "phone" && mappings[col] !== "__ignore__" && (
                      <span className="badge badge-blue">mapeado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview das primeiras 3 linhas */}
            {previewRows.length > 0 && (
              <div>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  Preview — primeiras {previewRows.length} linhas
                </p>
                <div style={{ overflowX: "auto", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)" }}>
                  <table className="cx-table">
                    <thead>
                      <tr>
                        {csvHeaders.map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {csvHeaders.map(h => (
                            <td key={h} className="mono" style={{ whiteSpace: "nowrap" }}>{row[h] ?? "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Botões de navegação */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid var(--glass-border)" }}>
              <button onClick={reset} className="btn btn-secondary">
                <X style={{ width: 16, height: 16 }} /> Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!canImport || importing}
                className="btn btn-primary"
              >
                {importing ? (
                  <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Importando...</>
                ) : (
                  <><Upload style={{ width: 16, height: 16 }} /> Importar ({Object.values(mappings).filter(v => v !== "__ignore__").length} colunas)</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Resultado ── */}
        {step === 3 && result && (
          <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto",
                background: result.imported > 0 ? "rgba(0,214,143,0.12)" : "rgba(255,184,0,0.12)",
              }}>
                {result.imported > 0
                  ? <CheckCircle2 style={{ width: 28, height: 28, color: "var(--green)" }} />
                  : <AlertTriangle style={{ width: 28, height: 28, color: "var(--yellow)" }} />
                }
              </div>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>
                {result.imported > 0
                  ? `${result.imported} leads importados com sucesso`
                  : "Nenhum lead importado"}
              </p>
              {result.skipped > 0 && (
                <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  {result.skipped} linha{result.skipped !== 1 ? "s" : ""} ignorada{result.skipped !== 1 ? "s" : ""} (telefone inválido ou duplicado)
                </p>
              )}
            </div>

            {/* Detalhes dos erros */}
            {result.errors.length > 0 && (
              <div style={{ background: "rgba(232,0,45,0.08)", border: "1px solid rgba(232,0,45,0.15)", borderRadius: "var(--radius-sm)", padding: "16px", textAlign: "left", display: "flex", flexDirection: "column", gap: "6px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#ff4d6d", display: "flex", alignItems: "center", gap: "6px" }}>
                  <XCircle style={{ width: 14, height: 14 }} /> {result.errors.length} erro{result.errors.length !== 1 ? "s" : ""} de validação
                </p>
                <ul style={{ fontSize: "11px", color: "#ff4d6d", display: "flex", flexDirection: "column", gap: "2px", maxHeight: "128px", overflowY: "auto", listStyle: "none", padding: 0, margin: 0 }}>
                  {result.errors.map((e, i) => (
                    <li key={i} className="mono">{e}</li>
                  ))}
                </ul>
                {result.errors.length === 20 && (
                  <p style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic" }}>Mostrando primeiros 20 erros.</p>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button onClick={reset} className="btn btn-secondary">
                <Upload style={{ width: 16, height: 16 }} /> Importar outro arquivo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Modal: Vincular lista a campanha ── */
function LinkToCampaignModal({
  list,
  queues,
  tenantId,
  onClose,
  onSuccess,
}: {
  list: LeadList;
  queues: Queue[];
  tenantId: string;
  onClose: () => void;
  onSuccess: (added: number, skipped: number, campaignName: string) => void;
}) {
  const [selectedQueueId, setSelectedQueueId] = useState(queues[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filtrar campanhas que ainda não usam esta lista
  const eligible = queues.filter((q) => q.lead_list_id !== list.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQueueId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/tenants/${tenantId}/queues/${selectedQueueId}/add-leads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceListId: list.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao vincular"); return; }
      const campaignName = queues.find((q) => q.id === selectedQueueId)?.name ?? selectedQueueId;
      onSuccess(data.added, data.skipped, campaignName);
      onClose();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay animate-fadeIn" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)" }}>Incluir em campanha</h2>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
            Copiar leads de <strong style={{ color: "var(--text-1)" }}>{list.name}</strong> para a lista de uma campanha existente.
            Duplicatas são ignoradas automaticamente.
          </p>

          {eligible.length === 0 ? (
            <div className="alert-error">
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: "13px" }}>Nenhuma campanha disponível (todas já usam esta lista).</span>
            </div>
          ) : (
            <div>
              <label className="form-label">Campanha de destino</label>
              <select
                className="cx-select"
                style={{ width: "100%" }}
                value={selectedQueueId}
                onChange={(e) => setSelectedQueueId(e.target.value)}
                required
              >
                {eligible.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="alert-error">
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: "13px" }}>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", paddingTop: "8px" }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading || eligible.length === 0} className="btn btn-primary">
              {loading
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> Incluindo...</>
                : <><ArrowRight style={{ width: 16, height: 16 }} /> Incluir leads</>
              }
            </button>
          </div>
        </form>
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
  const [queues, setQueues]                 = useState<Queue[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [listConfirmed, setListConfirmed]   = useState(false);
  const [leads, setLeads]                   = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads]     = useState(false);
  const [showCreate, setShowCreate]         = useState(false);
  const [showAddLead, setShowAddLead]       = useState(false);
  const [resettingStuck, setResettingStuck] = useState(false);
  const [searchLead, setSearchLead]         = useState("");
  const [leadsTotal, setLeadsTotal]         = useState<number | null>(null);
  const [pageError, setPageError]           = useState<string | null>(null);
  // Filtros avançados
  const [filterStatus, setFilterStatus]     = useState<string[]>([]);
  const [filterMinAttempts, setFilterMinAttempts] = useState("");
  const [filterMaxAttempts, setFilterMaxAttempts] = useState("");
  const [showFilters, setShowFilters]       = useState(false);
  // Drawer de chamada
  const [drawerCall, setDrawerCall]         = useState<CallDetail | null>(null);
  const [drawerLoading, setDrawerLoading]   = useState(false);
  // Edição inline de nome da lista
  const [editingListId, setEditingListId]   = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState("");
  // Modal "Incluir em campanha"
  const [linkingList, setLinkingList]       = useState<LeadList | null>(null);
  const { toasts, show: showToast } = useToast();

  function handleSelectList(id: string) {
    setSelectedListId(id);
    setListConfirmed(false);
  }

  function handleConfirmList(id: string) {
    setSelectedListId(id);
    setListConfirmed(true);
  }

  useEffect(() => { loadLists(); loadQueues(); }, [tenantId]);
  useEffect(() => { if (selectedListId) loadLeads(searchLead); }, [selectedListId]);

  // Debounce: busca server-side 400ms após parar de digitar
  useEffect(() => {
    if (!selectedListId) return;
    const timer = setTimeout(() => loadLeads(searchLead), 400);
    return () => clearTimeout(timer);
  }, [searchLead]);

  // Recarregar quando filtros mudam
  useEffect(() => {
    if (selectedListId) loadLeads(searchLead);
  }, [filterStatus.join(","), filterMinAttempts, filterMaxAttempts]);

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

  async function loadQueues() {
    try {
      const res = await fetch(`/api/tenants/${tenantId}/queues`);
      if (!res.ok) return;
      const data = await res.json();
      setQueues(data.queues ?? []);
    } catch { /* silencioso — funcionalidade opcional */ }
  }

  async function loadLeads(search = "") {
    setLoadingLeads(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search.trim()) params.set("search", search.trim());
    if (filterStatus.length > 0) params.set("status", filterStatus.join(","));
    if (filterMinAttempts) params.set("min_attempts", filterMinAttempts);
    if (filterMaxAttempts) params.set("max_attempts", filterMaxAttempts);
    const res  = await fetch(`/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    // Manter o total sem busca — só atualiza quando não há search ativo
    if (!search.trim() && filterStatus.length === 0 && !filterMinAttempts && !filterMaxAttempts) {
      setLeadsTotal(data.total ?? null);
    }
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
      loadLeads(searchLead);
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
    loadLeads(searchLead);
  }

  async function openLeadCall(leadId: string) {
    setDrawerLoading(true);
    try {
      // Buscar chamadas do lead (a mais recente primeiro)
      const res = await fetch(`/api/tenants/${tenantId}/calls?leadId=${leadId}&page_size=1`);
      if (!res.ok) return;
      const data = await res.json();
      const calls = data.calls ?? [];
      if (calls.length === 0) {
        showToast("Nenhuma chamada registrada para este lead", "error");
        return;
      }
      // Buscar detalhe completo
      const detailRes = await fetch(`/api/tenants/${tenantId}/calls/${calls[0].id}`);
      const detailData = await detailRes.json();
      setDrawerCall(detailData.call ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function deleteLead(leadId: string, phone: string) {
    if (!confirm(`Tem certeza que deseja apagar o lead ${phone}?`)) return;
    const res = await fetch(`/api/tenants/${tenantId}/lead-lists/${selectedListId}/leads/${leadId}`, { method: "DELETE" });
    if (res.ok) {
      showToast(`Lead ${phone} removido.`);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } else {
      const data = await res.json();
      showToast(data.error || "Erro ao deletar lead", "error");
    }
  }

  function handleImportComplete(imported: number, skipped: number) {
    showToast(
      `✓ ${imported} leads importados${skipped > 0 ? `, ${skipped} ignorados` : ""}`,
      "success"
    );
    loadLeads(searchLead);
  }

  const activeList  = lists.find((l) => l.id === selectedListId);
  const stuckCount  = leads.filter((l) => l.status === "calling").length;

  // Busca é server-side — leads já vêm filtrados da API
  const filteredLeads = leads;

  return (
    <div>
      {/* Error banner */}
      {pageError && (
        <div className="alert-error" style={{ marginBottom: "16px", borderRadius: "var(--radius-sm)" }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ fontSize: "13px", flex: 1 }}>{pageError}</span>
          <button onClick={() => setPageError(null)} className="btn-icon" style={{ marginLeft: "auto" }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Lead Lists</h1>
          <p className="page-subtitle">Gerencie suas listas de contatos para discagem</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus style={{ width: 16, height: 16 }} />
          Nova Lista
        </button>
      </div>

      {/* Empty state */}
      {lists.length === 0 ? (
        <div className="gc">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 64 64" fill="none" style={{ width: "100%", height: "100%" }}>
                <rect x="8" y="12" width="48" height="40" rx="4" fill="rgba(232,0,45,0.15)" />
                <rect x="16" y="22" width="24" height="3" rx="1.5" fill="rgba(232,0,45,0.35)" />
                <rect x="16" y="30" width="32" height="3" rx="1.5" fill="rgba(232,0,45,0.25)" />
                <rect x="16" y="38" width="20" height="3" rx="1.5" fill="rgba(232,0,45,0.18)" />
                <circle cx="50" cy="50" r="10" fill="var(--red)" />
                <path d="M46 50h8M50 46v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="empty-state-title">Nenhuma lista de leads ainda</p>
            <p className="empty-state-desc">
              Crie sua primeira lista para começar a importar contatos e disparar campanhas de discagem.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              Criar Primeira Lista
            </button>
          </div>
        </div>
      ) : (
        <div className="gc leads-layout">

          {/* Coluna esquerda: seleção de lista */}
          <div className="leads-listpanel">
            <div className="leads-listpanel-header">
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".8px", color: "var(--text-3)", textTransform: "uppercase", marginBottom: "10px" }}>Suas Listas</div>
              <button onClick={() => setShowCreate(true)} className="cx-refresh-btn" style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: "11px" }}>
                <Plus style={{ width: 12, height: 12 }} /> Nova Lista
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {lists.map((list) => (
                <div key={list.id}>
                  {editingListId === list.id ? (
                    /* ── Modo edição inline ── */
                    <div style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1, fontSize: "12px", padding: "6px 8px" }}
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
                        className="leads-action-btn active"
                        title="Salvar"
                      >
                        <Check style={{ width: 14, height: 14 }} />
                      </button>
                      <button
                        onClick={() => setEditingListId(null)}
                        className="leads-action-btn"
                        title="Cancelar"
                      >
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ) : (
                    /* ── Modo normal ── */
                    <div
                      className={`leads-list-item${list.id === selectedListId && listConfirmed ? " active" : ""}`}
                      onClick={() => handleSelectList(list.id)}
                      onDoubleClick={() => handleConfirmList(list.id)}
                      style={{ position: "relative" }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {list.name}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkingList(list);
                          }}
                          className="leads-action-btn"
                          title="Incluir em campanha existente"
                        >
                          <Link2 style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingListId(list.id);
                            setEditingListName(list.name);
                          }}
                          className="leads-action-btn"
                          title="Renomear lista"
                        >
                          <Pencil style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteList(list.id, list.name);
                          }}
                          className="leads-action-btn danger"
                          title="Apagar lista"
                        >
                          <Trash2 style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmList(list.id);
                          }}
                          className={`leads-action-btn${list.id === selectedListId && listConfirmed ? " active" : ""}`}
                          title="Abrir lista de leads"
                        >
                          <ChevronRight style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {selectedListId && !listConfirmed && (
              <div style={{ padding: "10px 14px", borderTop: "1px solid var(--glass-border)" }}>
                <button
                  onClick={() => setListConfirmed(true)}
                  className="cx-refresh-btn"
                  style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: "11px" }}
                >
                  <Check style={{ width: 12, height: 12 }} />
                  Trabalhar com &quot;{activeList?.name}&quot;
                </button>
              </div>
            )}
          </div>

          {/* Coluna direita: importar CSV + tabela */}
          {listConfirmed ? (
          <div className="leads-main" style={{ overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "18px" }}>

            {/* ── CSV Import Wizard ── */}
            {selectedListId && (
              <CsvImportWizard
                key={selectedListId}
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
              <div className="leads-toolbar" style={{ padding: "0 0 12px", border: "none" }}>
                <h3 style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--text-3)", flexShrink: 0 }}>
                  Leads da Lista{" "}
                  {leadsTotal !== null && leadsTotal > 0 && (
                    <span style={{ fontWeight: 400, textTransform: "none" }}>
                      {searchLead.trim()
                        ? `(${leads.length} resultado${leads.length !== 1 ? "s" : ""} de ${leadsTotal.toLocaleString("pt-BR")})`
                        : `(${leadsTotal.toLocaleString("pt-BR")})`}
                    </span>
                  )}
                </h3>
                {selectedListId && (
                  <div className="leads-search-wrap" style={{ maxWidth: "280px" }}>
                    <Phone className="leads-search-icon" style={{ width: 13, height: 13 }} />
                    <input
                      type="text"
                      className="leads-search-input"
                      placeholder="Buscar por telefone ou nome..."
                      value={searchLead}
                      onChange={(e) => setSearchLead(e.target.value)}
                    />
                    {searchLead && (
                      <button onClick={() => setSearchLead("")} className="leads-search-clear">
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
                  {/* Botão de reset aparece só se há leads travados em 'calling' */}
                  {stuckCount > 0 && (
                    <button
                      onClick={resetStuckLeads}
                      disabled={resettingStuck}
                      className="cx-filter-btn"
                      style={{ fontSize: "11px", gap: "6px", color: "var(--yellow)", borderColor: "rgba(255,184,0,0.25)" }}
                      title={`${stuckCount} lead${stuckCount > 1 ? "s" : ""} preso${stuckCount > 1 ? "s" : ""} em "Em ligação" — clique para resetar para a fila`}
                    >
                      {resettingStuck
                        ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                        : <RotateCcw style={{ width: 14, height: 14 }} />
                      }
                      Resetar travados ({stuckCount})
                    </button>
                  )}
                  {selectedListId && (
                    <button
                      onClick={() => setShowAddLead(true)}
                      className="cx-refresh-btn"
                      style={{ fontSize: "11px", padding: "6px 12px" }}
                    >
                      <UserPlus style={{ width: 13, height: 13 }} />
                      Adicionar Lead
                    </button>
                  )}
                </div>
              </div>

              {/* Filtros avançados */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: showFilters ? 12 : 0 }}>
                <button
                  onClick={() => setShowFilters((p) => !p)}
                  className="cx-filter-btn"
                  style={{
                    fontSize: 11,
                    gap: 4,
                    color: (filterStatus.length > 0 || filterMinAttempts || filterMaxAttempts)
                      ? "var(--cyan)" : "var(--text-3)",
                  }}
                >
                  <Filter style={{ width: 13, height: 13 }} />
                  Filtros
                  {(filterStatus.length > 0 || filterMinAttempts || filterMaxAttempts) && (
                    <span className="badge badge-blue" style={{ fontSize: 9, padding: "1px 5px", marginLeft: 2 }}>
                      {filterStatus.length + (filterMinAttempts ? 1 : 0) + (filterMaxAttempts ? 1 : 0)}
                    </span>
                  )}
                </button>
                {(filterStatus.length > 0 || filterMinAttempts || filterMaxAttempts) && (
                  <button
                    onClick={() => { setFilterStatus([]); setFilterMinAttempts(""); setFilterMaxAttempts(""); }}
                    style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 3 }}
                  >
                    <X style={{ width: 12, height: 12 }} /> Limpar
                  </button>
                )}
              </div>
              {showFilters && (
                <div className="gc" style={{ padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                    {/* Status */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 4 }}>Status</label>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                          <button
                            key={key}
                            onClick={() => setFilterStatus((prev) =>
                              prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
                            )}
                            className={`badge ${filterStatus.includes(key) ? cfg.badge : "badge-gray"}`}
                            style={{
                              cursor: "pointer",
                              fontSize: 10,
                              opacity: filterStatus.length === 0 || filterStatus.includes(key) ? 1 : 0.5,
                              transition: "opacity .15s",
                            }}
                          >
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Tentativas */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 4 }}>Tentativas</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number" min="0" placeholder="min"
                          className="form-input" style={{ width: 60, fontSize: 11, padding: "4px 8px" }}
                          value={filterMinAttempts}
                          onChange={(e) => setFilterMinAttempts(e.target.value)}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>—</span>
                        <input
                          type="number" min="0" placeholder="max"
                          className="form-input" style={{ width: 60, fontSize: 11, padding: "4px 8px" }}
                          value={filterMaxAttempts}
                          onChange={(e) => setFilterMaxAttempts(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {loadingLeads ? (
                <div className="gc" style={{ padding: "0" }}>
                  <div>
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={{ padding: "16px 20px", display: "flex", gap: "16px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <div className="skeleton" style={{ height: "16px", width: "128px" }} />
                        <div className="skeleton" style={{ height: "16px", width: "112px" }} />
                        <div className="skeleton" style={{ height: "16px", width: "80px" }} />
                        <div className="skeleton" style={{ height: "16px", width: "48px" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : leads.length > 0 || searchLead.trim() ? (
                <div className="gc" style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table className="cx-table">
                      <thead>
                        <tr>
                          <th>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <Phone style={{ width: 13, height: 13 }} />
                              Telefone
                            </span>
                          </th>
                          <th>Nome / Empresa</th>
                          <th>Campos extras</th>
                          <th>Atendido?</th>
                          <th>Status</th>
                          <th>Tent.</th>
                          <th style={{ width: "40px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--text-3)", fontSize: "13px" }}>
                              {loadingLeads
                                ? "Buscando..."
                                : `Nenhum lead encontrado para "${searchLead}"`}
                            </td>
                          </tr>
                        ) : filteredLeads.map((lead) => {
                          const statusCfg = STATUS_CONFIG[lead.status] ?? { label: lead.status, badge: "badge-gray" };
                          const { name, company, nome, empresa, ...rest } = lead.data_json ?? {};
                          const displayName = name ?? nome;
                          const displayCompany = company ?? empresa;
                          const extras = Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(" · ");

                          // Atendido: baseado em last_outcome
                          // Fonte canônica — idêntica à usada no menu Campanhas (queues/page.tsx)
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
                            // Erros técnicos (provider fault) — não foi atendido
                            "pipeline-error", "transport-error",
                          ]);
                          const answered =
                            lead.last_outcome == null ? null
                            : ANSWERED.has(lead.last_outcome) ? true
                            : NO_ANSWER.has(lead.last_outcome) ||
                              lead.last_outcome.startsWith("sip-") ||
                              lead.last_outcome.startsWith("pipeline-error") ? false
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
                              <td className="mono" style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "12px" }}>{lead.phone_e164}</td>
                              <td>
                                {displayName ? (
                                  <div>
                                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{displayName}</p>
                                    {displayCompany && <p style={{ fontSize: "11px", color: "var(--text-3)" }}>{displayCompany}</p>}
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--text-3)", fontSize: "12px" }}>—</span>
                                )}
                              </td>
                              <td style={{ fontSize: "12px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={extras}>{extras || "—"}</td>
                              <td>
                                {answered === true && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "var(--green)" }}>
                                    <CheckCircle2 style={{ width: 14, height: 14 }} /> Sim
                                  </span>
                                )}
                                {answered === false && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "var(--text-3)" }}>
                                    <XCircle style={{ width: 14, height: 14 }} /> Não
                                  </span>
                                )}
                                {answered === null && <span style={{ color: "var(--text-3)", fontSize: "12px" }}>—</span>}
                              </td>
                              <td>
                                <div>
                                  <span className={statusCfg.badge}>{statusCfg.label}</span>
                                  {nextAtLabel && lead.status === "queued" && (
                                    <p style={{ fontSize: "11px", color: "var(--purple)", marginTop: "2px" }}>
                                      Retry: {nextAtLabel}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: "center" }}>{lead.attempt_count}</td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  {lead.attempt_count > 0 && (
                                    <button
                                      onClick={() => openLeadCall(lead.id)}
                                      className="leads-action-btn"
                                      title="Ver ultima chamada"
                                      disabled={drawerLoading}
                                    >
                                      <Eye style={{ width: 14, height: 14 }} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteLead(lead.id, lead.phone_e164)}
                                    className="leads-action-btn danger"
                                    title="Apagar lead"
                                  >
                                    <Trash2 style={{ width: 14, height: 14 }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="gc">
                  <div className="empty-state" style={{ padding: "48px 24px" }}>
                    <div style={{ width: "48px", height: "48px", margin: "0 auto 16px", borderRadius: "50%", background: "var(--glass-bg-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Users style={{ width: 20, height: 20, color: "var(--text-3)" }} />
                    </div>
                    <p className="empty-state-title">Nenhum lead nesta lista</p>
                    <p className="empty-state-desc">
                      Importe um CSV ou adicione leads manualmente para começar.
                    </p>
                    <button onClick={() => setShowAddLead(true)} className="btn btn-secondary">
                      <UserPlus style={{ width: 16, height: 16 }} />
                      Adicionar primeiro lead
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          ) : (
          <div className="leads-main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ width: "64px", height: "64px", margin: "0 auto 16px", borderRadius: "50%", background: "var(--glass-bg-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users style={{ width: 28, height: 28, color: "var(--text-3)" }} />
              </div>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", marginBottom: "8px" }}>
                Selecione uma lista para continuar
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                Escolha uma lista existente à esquerda ou crie uma nova lista.
              </p>
            </div>
          </div>
          )}
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

      {/* Modal: Incluir lista em campanha */}
      {linkingList && (
        <LinkToCampaignModal
          list={linkingList}
          queues={queues}
          tenantId={tenantId}
          onClose={() => setLinkingList(null)}
          onSuccess={(added, skipped, campaignName) => {
            showToast(`${added} lead(s) incluído(s) em "${campaignName}"${skipped > 0 ? ` · ${skipped} duplicata(s) ignorada(s)` : ""}`);
          }}
        />
      )}

      {/* Drawer de chamada */}
      <CallDetailDrawer
        call={drawerCall}
        onClose={() => setDrawerCall(null)}
        isAdminOrOwner={false}
      />

      {drawerLoading && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 60, background: "var(--glass-bg-2)", padding: "10px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--glass-border)" }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12 }}>Carregando chamada...</span>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success"
              ? <Check style={{ width: 16, height: 16 }} />
              : <AlertCircle style={{ width: 16, height: 16 }} />
            }
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
