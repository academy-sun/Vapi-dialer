"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FlaskConical, ChevronLeft, Phone, Loader2, CheckCircle2,
  XCircle, Play, Eye, Building2, ListOrdered, Zap, AlertTriangle,
  RefreshCw, Plus, X, Braces,
} from "lucide-react";

interface Tenant    { id: string; name: string; stats: { vapi_configured: boolean } }
interface Queue     { id: string; name: string; status: string; assistant_id: string; phone_number_id: string }
interface LeadList  { id: string; name: string }

interface CallResult {
  ok: boolean;
  dry_run: boolean;
  message?: string;
  error?: string;
  vapi_call_id?: string;
  vapi_status?: string;
  summary: {
    tenant_id: string;
    queue: string;
    assistant_id: string;
    phone_number_id: string;
    target_phone: string;
    dry_run: boolean;
  };
}

function SandboxContent() {
  const searchParams = useSearchParams();
  const preselectedTenantId = searchParams.get("tenantId") ?? "";

  const [tenants,      setTenants]      = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState(preselectedTenantId);
  const [queues,       setQueues]       = useState<Queue[]>([]);
  const [lists,        setLists]        = useState<LeadList[]>([]);
  const [selectedQueue,  setSelectedQueue]  = useState("");
  const [phone,        setPhone]        = useState("");
  const [dryRun,       setDryRun]       = useState(true);
  const [loading,      setLoading]      = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [result,       setResult]       = useState<CallResult | null>(null);
  const [logs,         setLogs]         = useState<string[]>([]);
  const [variables,    setVariables]    = useState<{ id: number; key: string; value: string }[]>([]);
  const varNextId = useRef(0);

  function addVar() {
    setVariables((p) => [...p, { id: varNextId.current++, key: "", value: "" }]);
  }
  function removeVar(id: number) {
    setVariables((p) => p.filter((v) => v.id !== id));
  }
  function updateVar(id: number, field: "key" | "value", val: string) {
    setVariables((p) => p.map((v) => v.id === id ? { ...v, [field]: val } : v));
  }

  function addLog(msg: string) {
    setLogs((p) => [`[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`, ...p].slice(0, 50));
  }

  // Load all tenants
  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants ?? []);
        if (preselectedTenantId && !selectedTenant) setSelectedTenant(preselectedTenantId);
        addLog("Tenants carregados.");
      });
  }, []);

  // Load queues + lists when tenant changes
  const loadResources = useCallback(async (tenantId: string) => {
    if (!tenantId) { setQueues([]); setLists([]); return; }
    setLoadingResources(true);
    setSelectedQueue("");
    setResult(null);
    const res = await fetch(`/api/admin/sandbox/queues?tenantId=${tenantId}`);
    const data = await res.json();
    setQueues(data.queues ?? []);
    setLists(data.lists ?? []);
    addLog(`Recursos carregados para tenant ${tenantId.slice(0, 8)}… (${data.queues?.length ?? 0} filas, ${data.lists?.length ?? 0} listas)`);
    setLoadingResources(false);
  }, []);

  useEffect(() => { if (selectedTenant) loadResources(selectedTenant); }, [selectedTenant, loadResources]);

  async function fireCall() {
    if (!selectedTenant || !selectedQueue || !phone.trim()) return;
    setLoading(true);
    setResult(null);
    addLog(`${dryRun ? "Simulando" : "Disparando"} chamada para ${phone.trim()}…`);

    // Montar variableValues a partir dos campos preenchidos
    const varsPayload: Record<string, string> = {};
    for (const v of variables) {
      const k = v.key.trim();
      const val = v.value.trim();
      if (k) varsPayload[k] = val;
    }

    const res  = await fetch("/api/admin/sandbox/call", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId:  selectedTenant,
        queueId:   selectedQueue,
        phone:     phone.trim(),
        dryRun,
        variables: varsPayload,
      }),
    });
    const data: CallResult = await res.json();
    setResult(data);
    if (data.ok) {
      addLog(dryRun ? `Simulação OK — nenhuma chamada feita.` : `Chamada iniciada! ID: ${data.vapi_call_id}`);
    } else {
      addLog(`Erro: ${data.error}`);
    }
    setLoading(false);
  }

  const activeTenant  = tenants.find((t) => t.id === selectedTenant);
  const activeQueue   = queues.find((q) => q.id === selectedQueue);
  const canFire       = !!selectedTenant && !!selectedQueue && !!phone.trim() && !loading;

  const queueStatusColor: Record<string, string> = {
    running: "badge-green",
    paused:  "badge-yellow",
    stopped: "badge-red",
    draft:   "badge-gray",
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <Link
            href="/app/admin"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", marginBottom: 8, transition: "color .15s", textDecoration: "none" }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} /> Visão Geral
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FlaskConical style={{ width: 16, height: 16, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red)" }}>Painel Admin</span>
          </div>
          <h1 className="page-title">Sandbox de Testes</h1>
          <p className="page-subtitle">Simule chamadas, listas e webhooks sem afetar dados de produção</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
        {/* -- Left: Controls -- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Step 1: Tenant */}
          <div className="gc" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</div>
              <h3 className="cx-card-title">Selecionar conta</h3>
            </div>
            <select
              className="cx-select"
              style={{ width: "100%" }}
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
            >
              <option value="">— Escolher conta —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {!t.stats.vapi_configured ? "(sem Vapi)" : ""}
                </option>
              ))}
            </select>

            {activeTenant && (
              <div
                className={activeTenant.stats.vapi_configured ? "alert-success" : "alert-warning"}
                style={{ marginTop: 12, fontSize: 12, padding: "8px 12px" }}
              >
                {activeTenant.stats.vapi_configured
                  ? <><CheckCircle2 style={{ width: 14, height: 14 }} /> Vapi configurado — pronto para chamadas reais</>
                  : <><AlertTriangle style={{ width: 14, height: 14 }} /> Sem chave Vapi — apenas simulações disponíveis</>
                }
              </div>
            )}
          </div>

          {/* Step 2: Queue */}
          <div className="gc" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</div>
                <h3 className="cx-card-title">Selecionar fila</h3>
              </div>
              {loadingResources && (
                <div className="cx-loading">
                  <div className="cx-spinner" />
                </div>
              )}
            </div>

            {!selectedTenant ? (
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>Selecione uma conta primeiro.</p>
            ) : queues.length === 0 && !loadingResources ? (
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>Nenhuma fila cadastrada nesta conta.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {queues.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQueue(q.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: selectedQueue === q.id ? "1px solid var(--red)" : "1px solid var(--glass-border)",
                      background: selectedQueue === q.id ? "var(--red-lo)" : "var(--glass-bg)",
                      fontSize: 13,
                      textAlign: "left",
                      transition: "all .15s",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ListOrdered style={{ width: 16, height: 16, color: "var(--text-3)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{q.name}</span>
                    </span>
                    <span className={`badge ${queueStatusColor[q.status] ?? "badge-gray"}`}>{q.status}</span>
                  </button>
                ))}
              </div>
            )}

            {lists.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--glass-border)" }}>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>Listas disponíveis nesta conta</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {lists.map((l) => (
                    <span key={l.id} className="badge badge-gray" style={{ gap: 4 }}>
                      <Building2 style={{ width: 10, height: 10 }} /> {l.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Call */}
          <div className="gc" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</div>
              <h3 className="cx-card-title">Disparar chamada</h3>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="form-label">Número de telefone de teste</label>
                <div style={{ position: "relative" }}>
                  <Phone style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--text-3)" }} />
                  <input
                    type="tel"
                    className="form-input"
                    style={{ paddingLeft: 36 }}
                    placeholder="+5511999990001 ou 11999990001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Use seu próprio número para não afetar leads reais</p>
              </div>

              {/* Variables (LiquidJS) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 0 }}>
                    <Braces style={{ width: 14, height: 14, color: "var(--red)" }} />
                    Variáveis LiquidJS
                    <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-3)", marginLeft: 4 }}>(opcional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={addVar}
                    className="cx-filter-btn"
                    style={{ padding: "4px 10px", fontSize: 12, gap: 4 }}
                  >
                    <Plus style={{ width: 14, height: 14 }} /> Adicionar
                  </button>
                </div>

                {variables.length === 0 ? (
                  <button
                    type="button"
                    onClick={addVar}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 0",
                      borderRadius: "var(--radius-sm)",
                      border: "2px dashed var(--glass-border)",
                      background: "none",
                      fontSize: 12,
                      color: "var(--text-3)",
                      cursor: "pointer",
                      transition: "all .15s",
                    }}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Ex: first_name = João, empresa = Acme…
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: "var(--text-3)", paddingLeft: 4 }}>Chave</span>
                      <span style={{ fontSize: 12, color: "var(--text-3)", paddingLeft: 4 }}>Valor</span>
                      <span />
                    </div>
                    {variables.map((v) => (
                      <div key={v.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "center" }}>
                        <input
                          className="form-input mono"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          placeholder="first_name"
                          value={v.key}
                          onChange={(e) => updateVar(v.id, "key", e.target.value)}
                        />
                        <input
                          className="form-input"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          placeholder="João"
                          value={v.value}
                          onChange={(e) => updateVar(v.id, "value", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeVar(v.id)}
                          className="btn-icon"
                          style={{ width: 24, height: 24 }}
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    ))}
                    <p className="alert-info" style={{ fontSize: 12, padding: "6px 10px", marginTop: 4 }}>
                      {variables.filter((v) => v.key.trim()).map((v) => (
                        <code key={v.id} className="mono" style={{ marginRight: 6, background: "var(--glass-bg-2)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{`{{${v.key.trim()}}}`}</code>
                      ))}
                      {variables.filter((v) => v.key.trim()).length === 0 && "Preencha as chaves para ver as variáveis"}
                    </p>
                  </div>
                )}
              </div>

              {/* Dry run toggle */}
              <label style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                padding: 12,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--glass-border)",
                background: "var(--glass-bg)",
                transition: "background .15s",
              }}>
                <div
                  onClick={() => setDryRun((v) => !v)}
                  style={{
                    position: "relative",
                    width: 40,
                    height: 20,
                    borderRadius: 999,
                    background: dryRun ? "var(--yellow)" : "var(--red)",
                    transition: "background .2s",
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute",
                    top: 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    transition: "left .2s",
                    left: dryRun ? 2 : 20,
                  }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                    {dryRun ? "Modo simulação (Dry Run)" : "Chamada real"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {dryRun
                      ? "Valida os dados mas não liga — seguro para testes"
                      : "Vai fazer a ligação de verdade via Vapi"}
                  </p>
                </div>
              </label>

              {/* Summary */}
              {activeQueue && selectedTenant && (
                <div style={{
                  background: "var(--glass-bg)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  fontSize: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  color: "var(--text-2)",
                }}>
                  <p><span style={{ fontWeight: 600, color: "var(--text-1)" }}>Conta:</span> {activeTenant?.name}</p>
                  <p><span style={{ fontWeight: 600, color: "var(--text-1)" }}>Fila:</span> {activeQueue.name}</p>
                  <p><span style={{ fontWeight: 600, color: "var(--text-1)" }}>Assistente:</span> <span className="mono">{activeQueue.assistant_id}</span></p>
                  <p><span style={{ fontWeight: 600, color: "var(--text-1)" }}>Número Vapi:</span> <span className="mono">{activeQueue.phone_number_id}</span></p>
                </div>
              )}

              <button
                onClick={fireCall}
                disabled={!canFire}
                className={dryRun ? "btn btn-secondary" : "btn btn-primary"}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  fontSize: 13,
                  ...(dryRun ? { background: "var(--yellow)", color: "#000", border: "none", boxShadow: "0 4px 18px rgba(255,184,0,0.25)" } : {}),
                }}
              >
                {loading
                  ? <><div className="cx-spinner" style={{ width: 16, height: 16 }} /> Processando…</>
                  : dryRun
                    ? <><Eye style={{ width: 16, height: 16 }} /> Simular (Dry Run)</>
                    : <><Play style={{ width: 16, height: 16 }} /> Disparar chamada real</>
                }
              </button>
            </div>
          </div>
        </div>

        {/* -- Right: Results + Logs -- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Result */}
          {result && (
            <div
              className="gc"
              style={{
                padding: 20,
                borderLeft: result.ok ? "4px solid var(--green)" : "4px solid var(--red)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {result.ok
                  ? <CheckCircle2 style={{ width: 20, height: 20, color: "var(--green)" }} />
                  : <XCircle style={{ width: 20, height: 20, color: "var(--red)" }} />
                }
                <h3 className="cx-card-title">
                  {result.ok ? (result.dry_run ? "Simulação OK" : "Chamada iniciada!") : "Erro"}
                </h3>
              </div>

              {result.ok && result.dry_run && (
                <div className="alert-success" style={{ fontSize: 13 }}>
                  {result.message}
                </div>
              )}

              {result.ok && !result.dry_run && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <p style={{ color: "var(--text-2)" }}>Vapi Call ID:</p>
                  <p className="mono" style={{ fontSize: 12, background: "var(--glass-bg-2)", padding: "8px 12px", borderRadius: "var(--radius-sm)", wordBreak: "break-all", color: "var(--cyan)" }}>
                    {result.vapi_call_id}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>Status: {result.vapi_status}</p>
                </div>
              )}

              {!result.ok && (
                <div className="alert-error" style={{ fontSize: 13 }}>
                  <span style={{ wordBreak: "break-all" }}>{result.error}</span>
                </div>
              )}

              {result.summary && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--glass-border)", fontSize: 12, color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <p>Fila: <span style={{ color: "var(--text-2)" }}>{result.summary.queue}</span></p>
                  <p>Telefone: <span className="mono" style={{ color: "var(--text-2)" }}>{result.summary.target_phone}</span></p>
                </div>
              )}
            </div>
          )}

          {/* Activity log */}
          <div className="gc" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Zap style={{ width: 16, height: 16, color: "var(--red)" }} />
                <h3 className="cx-card-title" style={{ fontSize: 13 }}>Log de atividade</h3>
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="btn-icon">
                  <RefreshCw style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
            {logs.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "24px 0" }}>Nenhuma atividade ainda.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 256, overflowY: "auto" }}>
                {logs.map((log, i) => (
                  <p key={i} className="mono" style={{ fontSize: 12, color: "var(--text-2)", padding: "4px 0", borderBottom: "1px solid var(--glass-border)" }}>
                    {log}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="gc" style={{ padding: 20, background: "var(--red-lo)", borderColor: "rgba(232,0,45,0.20)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>Como usar o Sandbox</h3>
            <ul style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6, listStyle: "none" }}>
              <li>&#8226; <strong>Dry Run:</strong> valida tudo sem ligar</li>
              <li>&#8226; <strong>Chamada real:</strong> liga de verdade via Vapi</li>
              <li>&#8226; Use seu número pessoal como alvo</li>
              <li>&#8226; Nenhum lead do banco é criado ou alterado</li>
              <li>&#8226; O call_record NÃO é salvo no sandbox</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SandboxPage() {
  return (
    <Suspense fallback={
      <div className="cx-loading" style={{ height: 256 }}>
        <div className="cx-spinner" style={{ width: 32, height: 32 }} />
      </div>
    }>
      <SandboxContent />
    </Suspense>
  );
}
