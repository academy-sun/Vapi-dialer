"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Key, Eye, EyeOff, Shield, Clock, Webhook, RefreshCw,
  Check, Loader2, Copy, CheckCircle2, AlertTriangle, Settings2, Zap,
} from "lucide-react";

/* ── Interfaces ──────────────────────────────────────────────────── */
interface VapiConnection {
  vapiApiKey: string;
  concurrencyLimit: number;
  contractedMinutes: number | null;
  minutesUsedCache: number;
  minutesCacheMonth: string | null;
  minutesBlocked: boolean;
}

interface SuccessField {
  fieldName: string;
  isSuccess: boolean;
}

interface AssistantConfig {
  id: string;
  name: string;
  webhookUrl?: string;
  structuredOutputFields: SuccessField[];
}

/* ── Keyframes ───────────────────────────────────────────────────── */
const KEYFRAMES = `
@keyframes vapi-spin { to { transform: rotate(360deg); } }
@keyframes vapi-slide-down {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

/* ── Helper ──────────────────────────────────────────────────────── */
function fmtMonth(m: string | null): string {
  if (!m) return "—";
  const [y, mo] = m.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
}

/* ── Section wrapper ─────────────────────────────────────────────── */
function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="gc"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(18px)",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        animation: "vapi-slide-down 0.2s ease",
      }}
    >
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "16px 22px",
        borderBottom: "1px solid var(--glass-border)",
        background: "rgba(0,0,0,0.12)",
      }}>
        <span style={{ color: "var(--text-3)" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{title}</span>
      </div>
      <div style={{ padding: "22px" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Label ───────────────────────────────────────────────────────── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

/* ── Input base style ────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "var(--glass-bg-2)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-1)", fontSize: 14,
  outline: "none", fontFamily: "inherit",
  transition: "border-color 0.15s",
};

/* ── Component ───────────────────────────────────────────────────── */
export default function VapiConnectionClient({ isAdmin }: { isAdmin: boolean }) {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  /* ── State ── */
  const [connection, setConnection] = useState<VapiConnection>({
    vapiApiKey: "",
    concurrencyLimit: 5,
    contractedMinutes: null,
    minutesUsedCache: 0,
    minutesCacheMonth: null,
    minutesBlocked: false,
  });
  const [assistants, setAssistants] = useState<AssistantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showKey, setShowKey] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);

  const [savingLimits, setSavingLimits] = useState(false);
  const [savedLimits, setSavedLimits] = useState(false);
  const [draftConcurrency, setDraftConcurrency] = useState(5);
  const [draftContractedMinutes, setDraftContractedMinutes] = useState<number | null>(null);

  const [savingConsumption, setSavingConsumption] = useState(false);
  const [savedConsumption, setSavedConsumption] = useState(false);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  const [syncingWebhooks, setSyncingWebhooks] = useState(false);
  const [syncedWebhooks, setSyncedWebhooks] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);

  /* ── Inject keyframes ── */
  useEffect(() => {
    const id = "vapi-conn-kf";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id; s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  /* ── Load ── */
  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`);
      if (!res.ok) throw new Error("Falha ao carregar configurações");
      const data = await res.json();
      const conn = data.connection ?? {};
      const normalized: VapiConnection = {
        vapiApiKey:        conn.vapi_api_key         ?? conn.vapiApiKey        ?? "",
        concurrencyLimit:  conn.concurrency_limit    ?? conn.concurrencyLimit  ?? 5,
        contractedMinutes: conn.contracted_minutes   ?? conn.contractedMinutes ?? null,
        minutesUsedCache:  conn.minutes_used_cache   ?? conn.minutesUsedCache  ?? 0,
        minutesCacheMonth: conn.minutes_cache_month  ?? conn.minutesCacheMonth ?? null,
        minutesBlocked:    conn.minutes_blocked      ?? conn.minutesBlocked    ?? false,
      };
      setConnection(normalized);
      setDraftKey(normalized.vapiApiKey);
      setDraftConcurrency(normalized.concurrencyLimit);
      setDraftContractedMinutes(normalized.contractedMinutes);
      setDraftBlocked(normalized.minutesBlocked);
      if (normalized.minutesCacheMonth) setSelectedMonth(normalized.minutesCacheMonth);

      const assistantList: AssistantConfig[] = (data.assistants ?? []).map((a: {
        id: string; name: string; webhookUrl?: string; webhook_url?: string;
        structuredOutputFields?: SuccessField[]; structured_output_fields?: SuccessField[];
      }) => ({
        id: a.id,
        name: a.name,
        webhookUrl: a.webhookUrl ?? a.webhook_url ?? "",
        structuredOutputFields: a.structuredOutputFields ?? a.structured_output_fields ?? [],
      }));
      setAssistants(assistantList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  /* ── Save API Key ── */
  const saveApiKey = useCallback(async () => {
    setSavingKey(true); setConnectionOk(null);
    try {
      setTestingConnection(true);
      const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vapiApiKey: draftKey }),
      });
      setTestingConnection(false);
      if (!res.ok) throw new Error("Falha ao salvar");
      setConnection(prev => ({ ...prev, vapiApiKey: draftKey }));
      setConnectionOk(true);
      setSavedKey(true);
      setTimeout(() => setSavedKey(false), 2500);
    } catch {
      setConnectionOk(false);
    } finally {
      setSavingKey(false); setTestingConnection(false);
    }
  }, [tenantId, draftKey]);

  /* ── Save Limits ── */
  const saveLimits = useCallback(async () => {
    setSavingLimits(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrencyLimit: draftConcurrency, contractedMinutes: draftContractedMinutes }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setConnection(prev => ({ ...prev, concurrencyLimit: draftConcurrency, contractedMinutes: draftContractedMinutes }));
      setSavedLimits(true);
      setTimeout(() => setSavedLimits(false), 2500);
    } finally {
      setSavingLimits(false);
    }
  }, [tenantId, draftConcurrency, draftContractedMinutes]);

  /* ── Save Consumption settings ── */
  const saveConsumption = useCallback(async () => {
    setSavingConsumption(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesBlocked: draftBlocked }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setConnection(prev => ({ ...prev, minutesBlocked: draftBlocked }));
      setSavedConsumption(true);
      setTimeout(() => setSavedConsumption(false), 2500);
    } finally {
      setSavingConsumption(false);
    }
  }, [tenantId, draftBlocked]);

  /* ── Toggle success field ── */
  const toggleSuccessField = useCallback(async (assistantId: string, fieldName: string, current: boolean) => {
    setAssistants(prev => prev.map(a => {
      if (a.id !== assistantId) return a;
      return {
        ...a,
        structuredOutputFields: a.structuredOutputFields.map(f =>
          f.fieldName === fieldName ? { ...f, isSuccess: !current } : f
        ),
      };
    }));
    await fetch(`/api/tenants/${tenantId}/vapi-connection`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assistantSuccessField: { assistantId, fieldName, isSuccess: !current } }),
    });
  }, [tenantId]);

  /* ── Sync webhooks ── */
  const syncWebhooks = useCallback(async () => {
    setSyncingWebhooks(true); setSyncedWebhooks(false);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-connection/sync-webhooks`, { method: "POST" });
      if (!res.ok) throw new Error("Falha na sincronização");
      const data = await res.json();
      if (data.assistants) setAssistants(data.assistants);
      setSyncedWebhooks(true);
      setTimeout(() => setSyncedWebhooks(false), 3000);
    } finally {
      setSyncingWebhooks(false);
    }
  }, [tenantId]);

  /* ── Copy webhook ── */
  const copyWebhook = useCallback(async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(id);
      setTimeout(() => setCopiedWebhook(null), 2000);
    } catch { /* ignore */ }
  }, []);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 14, flexDirection: "column" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "3px solid var(--glass-border)",
          borderTopColor: "var(--red)",
          animation: "vapi-spin 0.8s linear infinite",
        }} />
        <span style={{ color: "var(--text-3)", fontSize: 13 }}>Carregando configurações…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
        <div
          className="gc"
          style={{
            background: "var(--glass-bg)", backdropFilter: "blur(18px)",
            border: "1px solid var(--glass-border)", borderRadius: "var(--radius-md)",
            padding: "32px 40px", textAlign: "center", maxWidth: 380,
          }}
        >
          <AlertTriangle size={32} style={{ color: "var(--red)", margin: "0 auto 14px" }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>Erro ao carregar</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20 }}>{loadError}</div>
          <button className="cx-refresh-btn" onClick={load} style={{ margin: "0 auto" }}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  /* ── Compute minutes stats ── */
  const usedMinutes = Math.ceil((connection.minutesUsedCache ?? 0) / 60);
  const minutesPct = connection.contractedMinutes
    ? Math.min(100, Math.round((usedMinutes / connection.contractedMinutes) * 100))
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ══ 1. API Key ═════════════════════════════════════════════ */}
      <Section title="Chave de API Vapi" icon={<Key size={16} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <FieldLabel>Chave de API</FieldLabel>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={draftKey}
                  onChange={e => setDraftKey(e.target.value)}
                  style={{
                    ...inputStyle,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    paddingRight: 42,
                  }}
                  placeholder="vapi_••••••••••••••••"
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    color: "var(--text-3)", background: "none", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center",
                  }}
                  title={showKey ? "Ocultar chave" : "Mostrar chave"}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                className="cx-refresh-btn"
                onClick={saveApiKey}
                disabled={savingKey || draftKey === connection.vapiApiKey}
                style={{ flexShrink: 0, opacity: draftKey !== connection.vapiApiKey ? 1 : 0.45 }}
              >
                {testingConnection ? (
                  <><Loader2 size={14} style={{ animation: "vapi-spin 0.8s linear infinite" }} /> Testando…</>
                ) : savedKey ? (
                  <><Check size={14} style={{ color: "var(--green)" }} /> Salvo!</>
                ) : (
                  <><Key size={14} /> Salvar</>
                )}
              </button>
            </div>
          </div>

          {/* Status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {connectionOk === true && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "5px 12px",
                background: "rgba(0,214,143,0.1)", border: "1px solid rgba(0,214,143,0.2)",
                borderRadius: 100, fontSize: 12, color: "var(--green)", fontWeight: 600,
              }}>
                <CheckCircle2 size={13} /> Conexão verificada
              </div>
            )}
            {connectionOk === false && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "5px 12px",
                background: "var(--red-lo)", border: "1px solid rgba(232,0,45,0.25)",
                borderRadius: 100, fontSize: 12, color: "var(--red)", fontWeight: 600,
              }}>
                <AlertTriangle size={13} /> Chave inválida
              </div>
            )}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "5px 12px",
              background: "rgba(0,194,255,0.08)", border: "1px solid rgba(0,194,255,0.15)",
              borderRadius: 100, fontSize: 12, color: "var(--cyan)", fontWeight: 500,
            }}>
              <Shield size={12} /> Armazenada criptografada
            </div>
          </div>
        </div>
      </Section>

      {/* ══ 2. Limites de Uso (admin only) ═════════════════════════ */}
      {isAdmin && (
        <Section title="Limites de Uso" icon={<Settings2 size={16} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Concurrency */}
              <div>
                <FieldLabel>Concorrência máxima (1–20)</FieldLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range" min={1} max={20}
                    value={draftConcurrency}
                    onChange={e => setDraftConcurrency(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--red)", cursor: "pointer" }}
                  />
                  <input
                    type="number" min={1} max={20}
                    value={draftConcurrency}
                    onChange={e => setDraftConcurrency(Math.min(20, Math.max(1, Number(e.target.value))))}
                    style={{
                      ...inputStyle,
                      width: 64, textAlign: "center",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 15, fontWeight: 700,
                    }}
                  />
                </div>
              </div>

              {/* Contracted minutes */}
              <div>
                <FieldLabel>Minutos contratados / mês</FieldLabel>
                <input
                  type="number" min={0}
                  value={draftContractedMinutes ?? ""}
                  onChange={e => setDraftContractedMinutes(e.target.value === "" ? null : Number(e.target.value))}
                  style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="Ex: 1000"
                />
              </div>
            </div>

            {/* Month display */}
            <div style={{
              padding: "10px 16px",
              background: "var(--glass-bg-2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: "var(--text-2)",
            }}>
              <Clock size={14} style={{ color: "var(--text-3)" }} />
              Mês atual: <strong style={{ color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace" }}>
                {fmtMonth(connection.minutesCacheMonth ?? new Date().toISOString().slice(0, 7))}
              </strong>
            </div>

            <button
              className="cx-refresh-btn"
              onClick={saveLimits}
              disabled={savingLimits}
              style={{ alignSelf: "flex-start" }}
            >
              {savingLimits ? (
                <><Loader2 size={14} style={{ animation: "vapi-spin 0.8s linear infinite" }} /> Salvando…</>
              ) : savedLimits ? (
                <><Check size={14} style={{ color: "var(--green)" }} /> Salvo!</>
              ) : (
                <><Settings2 size={14} /> Salvar Limites</>
              )}
            </button>
          </div>
        </Section>
      )}

      {/* ══ 3. Consumo do Mês ══════════════════════════════════════ */}
      <Section title="Consumo do Mês" icon={<Clock size={16} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Month selector */}
          <div>
            <FieldLabel>Período</FieldLabel>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ ...inputStyle, maxWidth: 200, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>

          {/* Progress */}
          {connection.contractedMinutes != null ? (
            <div>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 12, color: "var(--text-3)", marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "var(--text-1)", fontWeight: 700 }}>
                  {usedMinutes} min usados
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  de {connection.contractedMinutes} min contratados
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 8, background: "var(--glass-bg-2)",
                borderRadius: 100, overflow: "hidden",
                border: "1px solid var(--glass-border)",
              }}>
                <div
                  className="cx-min-fill"
                  style={{
                    height: "100%", borderRadius: 100,
                    width: `${minutesPct}%`,
                    background: minutesPct >= 100
                      ? "var(--red)"
                      : minutesPct >= 80
                        ? "var(--yellow)"
                        : "var(--green)",
                    transition: "width 0.4s ease",
                    boxShadow: minutesPct >= 100
                      ? "0 0 10px rgba(232,0,45,0.4)"
                      : undefined,
                  }}
                />
              </div>
              <div style={{
                marginTop: 6, fontSize: 12,
                color: minutesPct >= 100 ? "var(--red)" : minutesPct >= 80 ? "var(--yellow)" : "var(--text-3)",
                fontWeight: minutesPct >= 80 ? 600 : 400,
              }}>
                {minutesPct}% utilizado
                {minutesPct >= 100 && " — Limite atingido!"}
                {minutesPct >= 80 && minutesPct < 100 && " — Atenção: limite próximo"}
              </div>
            </div>
          ) : (
            <div style={{
              padding: "14px 18px",
              background: "var(--glass-bg-2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13, color: "var(--text-3)",
            }}>
              Nenhum limite de minutos configurado.
            </div>
          )}

          {/* Block toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px",
            background: "var(--glass-bg-2)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-sm)",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 3 }}>
                Bloquear quando atingir limite
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Campanhas são pausadas automaticamente ao atingir 100% dos minutos
              </div>
            </div>
            {/* Toggle switch */}
            <div
              onClick={() => setDraftBlocked(v => !v)}
              style={{
                width: 44, height: 24, borderRadius: 100, flexShrink: 0,
                background: draftBlocked ? "var(--red)" : "var(--glass-bg-2)",
                border: `1px solid ${draftBlocked ? "var(--red)" : "var(--glass-border)"}`,
                cursor: "pointer", position: "relative",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "#fff",
                position: "absolute", top: 2,
                left: draftBlocked ? 22 : 2,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              }} />
            </div>
          </div>

          <button
            className="cx-refresh-btn"
            onClick={saveConsumption}
            disabled={savingConsumption || draftBlocked === connection.minutesBlocked}
            style={{ alignSelf: "flex-start", opacity: draftBlocked !== connection.minutesBlocked ? 1 : 0.45 }}
          >
            {savingConsumption ? (
              <><Loader2 size={14} style={{ animation: "vapi-spin 0.8s linear infinite" }} /> Salvando…</>
            ) : savedConsumption ? (
              <><Check size={14} style={{ color: "var(--green)" }} /> Salvo!</>
            ) : (
              <><Check size={14} /> Salvar Configuração</>
            )}
          </button>
        </div>
      </Section>

      {/* ══ 4. Assistentes — Critérios de Sucesso ══════════════════ */}
      <Section title="Assistentes — Critérios de Sucesso" icon={<Zap size={16} />}>
        {assistants.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: "20px 0" }}>
            Nenhum assistente encontrado. Configure a chave de API e sincronize.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {assistants.map(assistant => (
              <div
                key={assistant.id}
                style={{
                  background: "var(--glass-bg-2)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}
              >
                {/* Assistant name */}
                <div style={{
                  padding: "12px 16px",
                  borderBottom: assistant.structuredOutputFields.length > 0
                    ? "1px solid var(--glass-border)" : "none",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <Zap size={14} style={{ color: "var(--yellow)" }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{assistant.name}</span>
                  <span style={{
                    fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    color: "var(--text-3)", marginLeft: 4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180,
                  }}>
                    {assistant.id}
                  </span>
                </div>

                {/* Fields */}
                {assistant.structuredOutputFields.length > 0 ? (
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                      Campos de saída estruturada — marque os que indicam conversão
                    </div>
                    {assistant.structuredOutputFields.map(field => (
                      <div
                        key={field.fieldName}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          cursor: "pointer", padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          background: field.isSuccess ? "rgba(0,214,143,0.07)" : "transparent",
                          border: field.isSuccess ? "1px solid rgba(0,214,143,0.18)" : "1px solid transparent",
                          transition: "background 0.15s, border-color 0.15s",
                        }}
                        onClick={() => toggleSuccessField(assistant.id, field.fieldName, field.isSuccess)}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          background: field.isSuccess ? "var(--green)" : "var(--glass-bg-2)",
                          border: `1.5px solid ${field.isSuccess ? "var(--green)" : "var(--glass-border)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "background 0.15s, border-color 0.15s",
                        }}>
                          {field.isSuccess && <Check size={11} style={{ color: "#000", strokeWidth: 3 }} />}
                        </div>
                        <span style={{
                          fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                          color: field.isSuccess ? "var(--green)" : "var(--text-2)",
                          fontWeight: field.isSuccess ? 600 : 400,
                        }}>
                          {field.fieldName}
                        </span>
                        {field.isSuccess && (
                          <span style={{
                            marginLeft: "auto", fontSize: 11, fontWeight: 600,
                            color: "var(--green)",
                          }}>
                            = Conversão
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-3)" }}>
                    Sem campos de saída estruturada configurados no Vapi.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ══ 5. Webhooks ════════════════════════════════════════════ */}
      <Section title="Webhooks" icon={<Webhook size={16} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Sync button */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="cx-refresh-btn"
              onClick={syncWebhooks}
              disabled={syncingWebhooks}
            >
              {syncingWebhooks ? (
                <><Loader2 size={14} style={{ animation: "vapi-spin 0.8s linear infinite" }} /> Sincronizando…</>
              ) : syncedWebhooks ? (
                <><CheckCircle2 size={14} style={{ color: "var(--green)" }} /> Sincronizado!</>
              ) : (
                <><RefreshCw size={14} /> Sincronizar com Vapi</>
              )}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              Atualiza URLs de webhook para todos os assistentes
            </span>
          </div>

          {/* Webhook list */}
          {assistants.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              Nenhum assistente encontrado.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {assistants.map(assistant => (
                <div
                  key={assistant.id}
                  style={{
                    background: "var(--glass-bg-2)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "var(--text-1)",
                    marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Webhook size={13} style={{ color: "var(--cyan)" }} />
                    {assistant.name}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      readOnly
                      value={assistant.webhookUrl || "—"}
                      style={{
                        ...inputStyle,
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: assistant.webhookUrl ? "var(--cyan)" : "var(--text-3)",
                        cursor: "text",
                      }}
                    />
                    {assistant.webhookUrl && (
                      <button
                        className="cx-filter-btn"
                        onClick={() => copyWebhook(assistant.webhookUrl!, assistant.id)}
                        style={{ flexShrink: 0, gap: 7, padding: "8px 14px" }}
                        title="Copiar URL"
                      >
                        {copiedWebhook === assistant.id
                          ? <><Check size={13} style={{ color: "var(--green)" }} /> Copiado</>
                          : <><Copy size={13} /> Copiar</>}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
