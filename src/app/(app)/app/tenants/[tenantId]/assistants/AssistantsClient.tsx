"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Bot, ChevronDown, ChevronUp, Save, Loader2, AlertTriangle,
  Check, RefreshCw, Mic, Sparkles, Phone, PhoneOff, MicOff, X, CheckCircle2,
} from "lucide-react";

interface Assistant {
  id: string;
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voice: Record<string, unknown>;
}

interface StructuredOutput {
  id: string;
  fields: string[];
}

interface AssistantCard {
  id: string;
  name: string;
  loaded: boolean;
  loading: boolean;
  expanded: boolean;
  config: Assistant | null;
  structuredOutputs: StructuredOutput[];
  allFields: string[];
  saving: boolean;
  editName: string;
  editFirstMessage: string;
  editSystemPrompt: string;
  error: string;
  saved: boolean;
}

type TestCallStatus = "connecting" | "active" | "ended" | "error";

interface TestCallState {
  assistantId: string;
  assistantName: string;
  status: TestCallStatus;
  error?: string;
  volume: number;
  muted: boolean;
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

export default function AssistantsClient() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toasts, show: showToast } = useToast();
  const [cards, setCards] = useState<AssistantCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [noVapi, setNoVapi] = useState(false);
  const [testCall, setTestCall] = useState<TestCallState | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiRef = useRef<any>(null);

  const loadAssistants = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/vapi-resources`);
    if (!res.ok) { setNoVapi(true); setLoading(false); return; }
    const data = await res.json();
    const assistants: Array<{ id: string; name: string }> = data.assistants ?? [];
    setCards(assistants.map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      loaded: false,
      loading: false,
      expanded: false,
      config: null,
      structuredOutputs: [],
      allFields: [],
      saving: false,
      editName: a.name ?? "",
      editFirstMessage: "",
      editSystemPrompt: "",
      error: "",
      saved: false,
    })));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadAssistants(); }, [loadAssistants]);

  async function toggleCard(id: string) {
    setCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      if (c.expanded) return { ...c, expanded: false };
      return { ...c, expanded: true };
    }));

    const card = cards.find((c) => c.id === id);
    if (!card || card.loaded || card.loading) return;

    setCards((prev) => prev.map((c) => c.id === id ? { ...c, loading: true } : c));
    const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant?assistantId=${id}`);
    if (!res.ok) {
      setCards((prev) => prev.map((c) => c.id === id ? { ...c, loading: false, error: "Erro ao carregar assistente" } : c));
      return;
    }
    const data = await res.json();
    const a = data.assistant as Assistant;
    setCards((prev) => prev.map((c) => c.id === id ? {
      ...c,
      loading: false,
      loaded: true,
      config: a,
      structuredOutputs: data.structuredOutputs ?? [],
      allFields: data.allFields ?? [],
      editName: (a.name as string) ?? c.name,
      editFirstMessage: (a.firstMessage as string) ?? "",
      editSystemPrompt: (a.systemPrompt as string) ?? "",
    } : c));
  }

  function updateCard(id: string, patch: Partial<AssistantCard>) {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  async function saveAssistant(id: string) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    updateCard(id, { saving: true, error: "" });
    const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId: id,
        name: card.editName,
        firstMessage: card.editFirstMessage,
        systemPrompt: card.editSystemPrompt,
      }),
    });
    if (res.ok) {
      updateCard(id, { saving: false, saved: true, name: card.editName });
      showToast(`Assistente "${card.editName}" salvo no Vapi!`);
      setTimeout(() => updateCard(id, { saved: false }), 2000);
    } else {
      const d = await res.json();
      updateCard(id, { saving: false, error: d.error ?? "Erro ao salvar" });
      showToast(d.error ?? "Erro ao salvar", "error");
    }
  }

  async function startTestCall(card: AssistantCard) {
    setTestCall({ assistantId: card.id, assistantName: card.name, status: "connecting", volume: 0, muted: false });

    try {
      // Buscar chave pública do servidor (nunca exposta diretamente — requer autenticação)
      const keyRes = await fetch(`/api/tenants/${tenantId}/vapi-assistant/test-call`);
      if (!keyRes.ok) {
        const d = (await keyRes.json()) as { error?: string };
        setTestCall((prev) =>
          prev ? { ...prev, status: "error", error: d.error ?? "Chave pública Vapi não configurada" } : null
        );
        return;
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      // Importação dinâmica para evitar SSR (WebRTC é browser-only)
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setTestCall((prev) => (prev ? { ...prev, status: "active" } : null));
      });
      vapi.on("call-end", () => {
        setTestCall((prev) => (prev ? { ...prev, status: "ended" } : null));
        vapiRef.current = null;
      });
      vapi.on("volume-level", (volume: number) => {
        setTestCall((prev) => (prev ? { ...prev, volume } : null));
      });
      vapi.on("error", (err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "Erro de conexão WebRTC";
        setTestCall((prev) => (prev ? { ...prev, status: "error", error: msg } : null));
        vapiRef.current = null;
      });

      // Iniciar chamada diretamente do browser com a chave pública
      const result = await vapi.start(card.id); // card.id = assistantId Vapi
      if (!result) {
        setTestCall((prev) =>
          prev?.status === "connecting"
            ? { ...prev, status: "error", error: "Chamada não iniciada pelo Vapi" }
            : prev
        );
        return;
      }
      // Garantir status active caso call-start já tenha sido emitido antes de chegar aqui
      setTestCall((prev) => (prev?.status === "connecting" ? { ...prev, status: "active" } : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao conectar";
      setTestCall((prev) => (prev ? { ...prev, status: "error", error: msg } : null));
      vapiRef.current = null;
    }
  }

  async function stopTestCall() {
    if (vapiRef.current) {
      await (vapiRef.current.stop() as Promise<void>).catch(() => {});
      vapiRef.current = null;
    }
    setTestCall(null);
  }

  function toggleMute() {
    if (!vapiRef.current) return;
    const newMuted = !testCall?.muted;
    vapiRef.current.setMuted(newMuted);
    setTestCall((prev) => prev ? { ...prev, muted: newMuted } : null);
  }

  if (loading) {
    return (
      <div className="cx-loading" style={{ height: 256 }}>
        <div className="cx-spinner" />
      </div>
    );
  }

  if (noVapi) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Assistentes</h1>
            <p className="page-subtitle">Edite o prompt e configurações dos seus agentes de voz</p>
          </div>
        </div>
        <div className="gc empty-state">
          <Bot className="empty-state-icon" style={{ color: "var(--text-3)" }} />
          <p className="empty-state-title">Vapi não configurada</p>
          <p className="empty-state-desc">Configure sua API Key do Vapi em Configuração Vapi para ver os assistentes.</p>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Assistentes</h1>
            <p className="page-subtitle">Edite o prompt e configurações dos seus agentes de voz</p>
          </div>
        </div>
        <div className="gc empty-state">
          <Bot className="empty-state-icon" style={{ color: "var(--text-3)" }} />
          <p className="empty-state-title">Nenhum assistente encontrado</p>
          <p className="empty-state-desc">Crie um assistente no painel do Vapi e ele aparecerá aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assistentes</h1>
          <p className="page-subtitle">Edite o prompt e configurações dos seus agentes de voz</p>
        </div>
        <button onClick={loadAssistants} className="cx-refresh-btn">
          <RefreshCw style={{ width: 14, height: 14 }} />
          Atualizar
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map((card) => (
          <div key={card.id} className="gc">
            {/* Header row — always visible */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => toggleCard(card.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 20,
                  textAlign: "left",
                  minWidth: 0,
                  transition: "background 0.15s",
                  borderRadius: "var(--radius) 0 0 var(--radius)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--red-lo)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Bot style={{ width: 16, height: 16, color: "var(--red)" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.id.slice(0, 20)}&hellip;</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {card.loading && <div className="cx-spinner" />}
                  {card.allFields.length > 0 && (
                    <span className="badge badge-purple" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                      <Sparkles style={{ width: 12, height: 12 }} />
                      {card.allFields.length} campo{card.allFields.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {card.expanded
                    ? <ChevronUp style={{ width: 16, height: 16, color: "var(--text-3)" }} />
                    : <ChevronDown style={{ width: 16, height: 16, color: "var(--text-3)" }} />}
                </div>
              </button>

              {/* Botão Testar — fora do toggle para evitar aninhamento de <button> */}
              <div style={{ paddingRight: 16, flexShrink: 0 }}>
                <button
                  onClick={() => void startTestCall(card)}
                  disabled={testCall !== null}
                  className="cx-filter-btn"
                  style={{ gap: 6, fontSize: 12, fontWeight: 500 }}
                  title="Testar assistente via WebRTC"
                >
                  <Phone style={{ width: 14, height: 14 }} />
                  Testar
                </button>
              </div>
            </div>

            {/* Expanded editor */}
            {card.expanded && (
              <div style={{
                borderTop: "1px solid var(--glass-border)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}>
                {card.loading ? (
                  <div className="cx-loading" style={{ paddingTop: 16, paddingBottom: 16 }}>
                    <div className="cx-spinner" />
                    <span>Carregando configurações&hellip;</span>
                  </div>
                ) : (
                  <>
                    {card.error && (
                      <div className="alert-error">
                        <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>{card.error}</span>
                      </div>
                    )}

                    {/* Name */}
                    <div>
                      <label className="form-label">Nome do assistente</label>
                      <input
                        type="text"
                        className="form-input"
                        value={card.editName}
                        onChange={(e) => updateCard(card.id, { editName: e.target.value })}
                        placeholder="Nome do assistente"
                      />
                    </div>

                    {/* First message */}
                    <div>
                      <label className="form-label">Primeira mensagem</label>
                      <textarea
                        className="form-input"
                        style={{ minHeight: 80, resize: "vertical" }}
                        value={card.editFirstMessage}
                        onChange={(e) => updateCard(card.id, { editFirstMessage: e.target.value })}
                        placeholder="Olá! Aqui é a Ana da Clínica…"
                      />
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                        Primeira coisa que o agente diz quando a chamada é atendida.
                      </p>
                    </div>

                    {/* System prompt */}
                    <div>
                      <label className="form-label">Prompt do sistema</label>
                      <textarea
                        className="form-input"
                        style={{ minHeight: 240, resize: "vertical", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                        value={card.editSystemPrompt}
                        onChange={(e) => updateCard(card.id, { editSystemPrompt: e.target.value })}
                        placeholder="Você é um assistente de vendas…"
                      />
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                        Instruções completas de comportamento do agente.
                      </p>
                    </div>

                    {/* Voice info (read-only) */}
                    {card.config?.voice && Object.keys(card.config.voice).length > 0 && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--text-3)",
                        padding: 12,
                        background: "var(--glass-bg)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--glass-border)",
                      }}>
                        <Mic style={{ width: 14, height: 14, flexShrink: 0 }} />
                        <span>
                          Voz: {String(card.config.voice.voiceId ?? card.config.voice.voice ?? "—")}
                        </span>
                      </div>
                    )}

                    {/* Save button */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                      <p style={{ fontSize: 11, color: "var(--text-3)" }}>
                        Snapshot automático salvo antes de cada edição
                      </p>
                      <button
                        onClick={() => saveAssistant(card.id)}
                        disabled={card.saving}
                        className="btn btn-primary"
                      >
                        {card.saving ? (
                          <><div className="cx-spinner" style={{ width: 16, height: 16 }} />Salvando&hellip;</>
                        ) : card.saved ? (
                          <><Check style={{ width: 16, height: 16 }} />Salvo!</>
                        ) : (
                          <><Save style={{ width: 16, height: 16 }} />Salvar Alterações</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Modal: Testar Assistente ── */}
      {testCall && (
        <div className="modal-overlay">
          <div className="modal" style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontWeight: 600, color: "var(--text-1)" }}>Testar Assistente</h2>
              {(testCall.status === "ended" || testCall.status === "error") && (
                <button
                  onClick={() => setTestCall(null)}
                  className="btn-icon"
                >
                  <X style={{ width: 20, height: 20 }} />
                </button>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{testCall.assistantName}</p>

            {/* Connecting */}
            {testCall.status === "connecting" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 24, paddingBottom: 24 }}>
                <div style={{ position: "relative" }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--red-lo)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Phone style={{ width: 24, height: 24, color: "var(--red)" }} />
                  </div>
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    border: "2px solid var(--red)",
                    animation: "cx-spin 1.5s linear infinite",
                    opacity: 0.4,
                  }} />
                </div>
                <p style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>Conectando ao assistente…</p>
                <p style={{ fontSize: 11, color: "var(--text-3)" }}>Aguarde, isso pode levar alguns segundos</p>
              </div>
            )}

            {/* Active call */}
            {testCall.status === "active" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  background: "rgba(0,214,143,0.10)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(0,214,143,0.20)",
                }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    background: "var(--green)",
                    borderRadius: "50%",
                    animation: "pulse 2s ease-in-out infinite",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--green)" }}>Em chamada</span>
                </div>

                {/* Volume meter */}
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Volume do agente</p>
                  <div style={{
                    height: 6,
                    background: "rgba(255,255,255,0.07)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}>
                    <div
                      style={{
                        height: "100%",
                        background: "var(--green)",
                        borderRadius: 999,
                        transition: "width 75ms",
                        width: `${Math.min(100, testCall.volume * 300)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                  <button
                    onClick={toggleMute}
                    className="cx-filter-btn"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      fontSize: 13,
                      fontWeight: 500,
                      background: testCall.muted ? "rgba(255,184,0,0.10)" : undefined,
                      borderColor: testCall.muted ? "rgba(255,184,0,0.25)" : undefined,
                      color: testCall.muted ? "var(--yellow)" : undefined,
                    }}
                  >
                    {testCall.muted
                      ? <><MicOff style={{ width: 16, height: 16 }} />Ativar mic</>
                      : <><Mic style={{ width: 16, height: 16 }} />Mutar mic</>
                    }
                  </button>
                  <button
                    onClick={() => void stopTestCall()}
                    className="btn"
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--red)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <PhoneOff style={{ width: 16, height: 16 }} />
                    Encerrar
                  </button>
                </div>
              </div>
            )}

            {/* Ended */}
            {testCall.status === "ended" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 24, paddingBottom: 24 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(0,214,143,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <CheckCircle2 style={{ width: 28, height: 28, color: "var(--green)" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>Chamada encerrada</p>
                <p style={{ fontSize: 11, color: "var(--text-3)" }}>O teste foi concluído com sucesso</p>
                <button onClick={() => setTestCall(null)} className="btn btn-secondary" style={{ marginTop: 8 }}>
                  Fechar
                </button>
              </div>
            )}

            {/* Error */}
            {testCall.status === "error" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 24, paddingBottom: 24 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--red-lo)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <AlertTriangle style={{ width: 28, height: 28, color: "var(--red)" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>Erro ao conectar</p>
                <p style={{ fontSize: 11, color: "var(--red)", textAlign: "center", maxWidth: 280 }}>{testCall.error ?? "Erro desconhecido"}</p>
                <button onClick={() => setTestCall(null)} className="btn btn-secondary" style={{ marginTop: 8 }}>
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="cx-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "cx-toast cx-toast-success" : "cx-toast cx-toast-error"}>
            {t.type === "success" ? <Check style={{ width: 16, height: 16, color: "var(--green)" }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
