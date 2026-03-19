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
          <Link href="/app/admin" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-2 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Visão Geral
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Painel Admin</span>
          </div>
          <h1 className="page-title">Sandbox de Testes</h1>
          <p className="page-subtitle">Simule chamadas, listas e webhooks sem afetar dados de produção</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* ── Left: Controls ── */}
        <div className="col-span-3 space-y-5">

          {/* Step 1: Tenant */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
              <h3 className="font-semibold text-gray-800">Selecionar conta</h3>
            </div>
            <select
              className="select-native"
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
              <div className={`mt-3 flex items-center gap-2 text-xs p-2.5 rounded-lg ${activeTenant.stats.vapi_configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {activeTenant.stats.vapi_configured
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Vapi configurado — pronto para chamadas reais</>
                  : <><AlertTriangle className="w-3.5 h-3.5" /> Sem chave Vapi — apenas simulações disponíveis</>
                }
              </div>
            )}
          </div>

          {/* Step 2: Queue */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">2</div>
                <h3 className="font-semibold text-gray-800">Selecionar fila</h3>
              </div>
              {loadingResources && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
            </div>

            {!selectedTenant ? (
              <p className="text-sm text-gray-400">Selecione uma conta primeiro.</p>
            ) : queues.length === 0 && !loadingResources ? (
              <p className="text-sm text-gray-400">Nenhuma fila cadastrada nesta conta.</p>
            ) : (
              <div className="space-y-2">
                {queues.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQueue(q.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all text-left ${
                      selectedQueue === q.id
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-800">{q.name}</span>
                    </span>
                    <span className={`badge ${queueStatusColor[q.status] ?? "badge-gray"}`}>{q.status}</span>
                  </button>
                ))}
              </div>
            )}

            {lists.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Listas disponíveis nesta conta</p>
                <div className="flex flex-wrap gap-2">
                  {lists.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      <Building2 className="w-2.5 h-2.5" /> {l.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Call */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">3</div>
              <h3 className="font-semibold text-gray-800">Disparar chamada</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="form-label">Número de telefone de teste</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    className="form-input pl-9"
                    placeholder="+5511999990001 ou 11999990001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Use seu próprio número para não afetar leads reais</p>
              </div>

              {/* Variables (LiquidJS) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="form-label flex items-center gap-1.5 mb-0">
                    <Braces className="w-3.5 h-3.5 text-indigo-400" />
                    Variáveis LiquidJS
                    <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={addVar}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>

                {variables.length === 0 ? (
                  <button
                    type="button"
                    onClick={addVar}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ex: first_name = João, empresa = Acme…
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-0.5">
                      <span className="text-xs text-gray-400 px-1">Chave</span>
                      <span className="text-xs text-gray-400 px-1">Valor</span>
                      <span />
                    </div>
                    {variables.map((v) => (
                      <div key={v.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                        <input
                          className="form-input text-xs font-mono py-1.5"
                          placeholder="first_name"
                          value={v.key}
                          onChange={(e) => updateVar(v.id, "key", e.target.value)}
                        />
                        <input
                          className="form-input text-xs py-1.5"
                          placeholder="João"
                          value={v.value}
                          onChange={(e) => updateVar(v.id, "value", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeVar(v.id)}
                          className="btn-icon text-gray-300 hover:text-red-400 w-6 h-6"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-1.5 mt-1">
                      {variables.filter((v) => v.key.trim()).map((v) => (
                        <code key={v.id} className="font-mono mr-1.5 bg-white px-1 rounded">{`{{${v.key.trim()}}}`}</code>
                      ))}
                      {variables.filter((v) => v.key.trim()).length === 0 && "Preencha as chaves para ver as variáveis"}
                    </p>
                  </div>
                )}
              </div>

              {/* Dry run toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div
                  onClick={() => setDryRun((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${dryRun ? "bg-amber-400" : "bg-indigo-600"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${dryRun ? "left-0.5" : "left-5"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {dryRun ? "Modo simulação (Dry Run)" : "Chamada real"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {dryRun
                      ? "Valida os dados mas não liga — seguro para testes"
                      : "Vai fazer a ligação de verdade via Vapi"}
                  </p>
                </div>
              </label>

              {/* Summary */}
              {activeQueue && selectedTenant && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1 text-gray-500">
                  <p><span className="font-medium text-gray-700">Conta:</span> {activeTenant?.name}</p>
                  <p><span className="font-medium text-gray-700">Fila:</span> {activeQueue.name}</p>
                  <p><span className="font-medium text-gray-700">Assistente:</span> <span className="font-mono">{activeQueue.assistant_id}</span></p>
                  <p><span className="font-medium text-gray-700">Número Vapi:</span> <span className="font-mono">{activeQueue.phone_number_id}</span></p>
                </div>
              )}

              <button
                onClick={fireCall}
                disabled={!canFire}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  dryRun
                    ? "bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40"
                }`}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando…</>
                  : dryRun
                    ? <><Eye className="w-4 h-4" /> Simular (Dry Run)</>
                    : <><Play className="w-4 h-4" /> Disparar chamada real</>
                }
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Results + Logs ── */}
        <div className="col-span-2 space-y-5">

          {/* Result */}
          {result && (
            <div className={`card p-5 border-l-4 ${result.ok ? "border-l-emerald-400" : "border-l-red-400"}`}>
              <div className="flex items-center gap-2 mb-3">
                {result.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <XCircle className="w-5 h-5 text-red-500" />
                }
                <h3 className="font-semibold text-gray-800">
                  {result.ok ? (result.dry_run ? "Simulação OK" : "Chamada iniciada!") : "Erro"}
                </h3>
              </div>

              {result.ok && result.dry_run && (
                <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                  {result.message}
                </p>
              )}

              {result.ok && !result.dry_run && (
                <div className="space-y-2 text-sm">
                  <p className="text-gray-600">Vapi Call ID:</p>
                  <p className="font-mono text-xs bg-gray-50 px-3 py-2 rounded-lg break-all text-indigo-700">
                    {result.vapi_call_id}
                  </p>
                  <p className="text-xs text-gray-400">Status: {result.vapi_status}</p>
                </div>
              )}

              {!result.ok && (
                <div className="bg-red-50 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-700 break-all">{result.error}</p>
                </div>
              )}

              {result.summary && (
                <div className="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 space-y-1">
                  <p>Fila: <span className="text-gray-600">{result.summary.queue}</span></p>
                  <p>Telefone: <span className="font-mono text-gray-600">{result.summary.target_phone}</span></p>
                </div>
              )}
            </div>
          )}

          {/* Activity log */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-gray-800 text-sm">Log de atividade</h3>
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-gray-600">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Nenhuma atividade ainda.</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <p key={i} className="text-xs font-mono text-gray-500 py-1 border-b border-gray-50 last:border-0">
                    {log}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="card p-5 bg-indigo-50 border-indigo-100">
            <h3 className="text-sm font-semibold text-indigo-800 mb-2">Como usar o Sandbox</h3>
            <ul className="text-xs text-indigo-700 space-y-1.5">
              <li>• <strong>Dry Run:</strong> valida tudo sem ligar</li>
              <li>• <strong>Chamada real:</strong> liga de verdade via Vapi</li>
              <li>• Use seu número pessoal como alvo</li>
              <li>• Nenhum lead do banco é criado ou alterado</li>
              <li>• O call_record NÃO é salvo no sandbox</li>
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    }>
      <SandboxContent />
    </Suspense>
  );
}
