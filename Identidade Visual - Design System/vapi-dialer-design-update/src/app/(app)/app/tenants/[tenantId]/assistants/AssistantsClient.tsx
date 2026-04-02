"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Bot, ChevronDown, ChevronUp, Save, Loader2, AlertTriangle,
  Check, RefreshCw, Mic, Sparkles, Phone, PhoneOff, MicOff,
  X, CheckCircle2,
} from "lucide-react";

/* ── Interfaces ──────────────────────────────────────────────────── */
interface StructuredOutput {
  name: string;
  description?: string;
  type?: string;
}

interface Assistant {
  id: string;
  name: string;
  firstMessage?: string;
  systemPrompt?: string;
  voice?: { provider?: string; voiceId?: string };
  model?: { model?: string; provider?: string };
  structuredOutputs?: StructuredOutput[];
}

interface AssistantCard {
  assistant: Assistant;
  expanded: boolean;
  draft: { name: string; firstMessage: string; systemPrompt: string };
  saving: boolean;
  saved: boolean;
  dirty: boolean;
}

type TestCallStatus = "idle" | "connecting" | "active" | "ended" | "error";

interface TestCallState {
  status: TestCallStatus;
  assistantId: string | null;
  volumeLevel: number;
  muted: boolean;
  errorMsg: string | null;
}

interface ToastMsg {
  id: string;
  message: string;
  type: "success" | "error";
}

/* ── useToast hook ───────────────────────────────────────────────── */
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, push };
}

/* ── Keyframe styles (injected once) ────────────────────────────── */
const KEYFRAMES = `
@keyframes assistants-spin { to { transform: rotate(360deg); } }
@keyframes assistants-pulse-ring {
  0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(232,0,45,0.55); }
  70%  { transform: scale(1);    box-shadow: 0 0 0 14px rgba(232,0,45,0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(232,0,45,0); }
}
@keyframes assistants-pulse-green {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
@keyframes assistants-slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes assistants-saved-flash {
  0%   { background: rgba(0,214,143,0.18); }
  100% { background: transparent; }
}
`;

/* ── Component ───────────────────────────────────────────────────── */
export default function AssistantsClient() {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  const [cards, setCards] = useState<AssistantCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [noVapi, setNoVapi] = useState(false);
  const [testCall, setTestCall] = useState<TestCallState>({
    status: "idle",
    assistantId: null,
    volumeLevel: 0,
    muted: false,
    errorMsg: null,
  });

  const vapiRef = useRef<unknown>(null);
  const { toasts, push: pushToast } = useToast();

  /* inject keyframes once */
  useEffect(() => {
    const id = "assistants-kf";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  /* ── loadAssistants ──────────────────────────────────────────── */
  const loadAssistants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-resources`);
      if (res.status === 404 || res.status === 403) { setNoVapi(true); setLoading(false); return; }
      if (!res.ok) throw new Error("Falha ao carregar assistentes");
      const data = await res.json();
      const list: Assistant[] = data.assistants ?? [];
      setCards(list.map(a => ({
        assistant: a,
        expanded: false,
        draft: {
          name: a.name ?? "",
          firstMessage: a.firstMessage ?? "",
          systemPrompt: a.systemPrompt ?? "",
        },
        saving: false,
        saved: false,
        dirty: false,
      })));
      setNoVapi(false);
    } catch {
      pushToast("Erro ao carregar assistentes", "error");
    } finally {
      setLoading(false);
    }
  }, [tenantId, pushToast]);

  useEffect(() => { loadAssistants(); }, [loadAssistants]);

  /* ── toggleCard ──────────────────────────────────────────────── */
  const toggleCard = useCallback((idx: number) => {
    setCards(prev => prev.map((c, i) =>
      i === idx ? { ...c, expanded: !c.expanded } : c
    ));
  }, []);

  /* ── updateCard (draft field) ────────────────────────────────── */
  const updateCard = useCallback((idx: number, field: keyof AssistantCard["draft"], value: string) => {
    setCards(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const draft = { ...c.draft, [field]: value };
      const dirty =
        draft.name !== c.assistant.name ||
        draft.firstMessage !== (c.assistant.firstMessage ?? "") ||
        draft.systemPrompt !== (c.assistant.systemPrompt ?? "");
      return { ...c, draft, dirty };
    }));
  }, []);

  /* ── saveAssistant ───────────────────────────────────────────── */
  const saveAssistant = useCallback(async (idx: number) => {
    const card = cards[idx];
    if (!card || card.saving) return;
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, saving: true } : c));
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: card.assistant.id,
          name: card.draft.name,
          firstMessage: card.draft.firstMessage,
          systemPrompt: card.draft.systemPrompt,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      const data = await res.json();
      setCards(prev => prev.map((c, i) => {
        if (i !== idx) return c;
        const updated = data.assistant ?? { ...c.assistant, ...card.draft };
        return {
          ...c,
          assistant: updated,
          draft: { name: updated.name ?? "", firstMessage: updated.firstMessage ?? "", systemPrompt: updated.systemPrompt ?? "" },
          saving: false,
          saved: true,
          dirty: false,
        };
      }));
      setTimeout(() => setCards(prev => prev.map((c, i) => i === idx ? { ...c, saved: false } : c)), 2200);
      pushToast("Assistente salvo com sucesso!");
    } catch {
      setCards(prev => prev.map((c, i) => i === idx ? { ...c, saving: false } : c));
      pushToast("Erro ao salvar assistente", "error");
    }
  }, [cards, tenantId, pushToast]);

  /* ── startTestCall ───────────────────────────────────────────── */
  const startTestCall = useCallback(async (assistantId: string) => {
    setTestCall({ status: "connecting", assistantId, volumeLevel: 0, muted: false, errorMsg: null });
    try {
      const res = await fetch(`/api/tenants/${tenantId}/vapi-assistant/test-call?assistantId=${assistantId}`);
      if (!res.ok) throw new Error("Falha ao obter credenciais");
      const { token, publicKey } = await res.json();

      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(publicKey ?? token);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setTestCall(prev => ({ ...prev, status: "active" }));
      });
      vapi.on("call-end", () => {
        setTestCall(prev => ({ ...prev, status: "ended" }));
        vapiRef.current = null;
      });
      vapi.on("volume-level", (vol: number) => {
        setTestCall(prev => ({ ...prev, volumeLevel: vol }));
      });
      vapi.on("error", (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Erro na chamada";
        setTestCall(prev => ({ ...prev, status: "error", errorMsg: msg }));
        vapiRef.current = null;
      });

      vapi.start(assistantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar chamada";
      setTestCall(prev => ({ ...prev, status: "error", errorMsg: msg }));
    }
  }, [tenantId]);

  /* ── stopTestCall ────────────────────────────────────────────── */
  const stopTestCall = useCallback(() => {
    if (vapiRef.current) {
      (vapiRef.current as { stop: () => void }).stop();
      vapiRef.current = null;
    }
    setTestCall({ status: "idle", assistantId: null, volumeLevel: 0, muted: false, errorMsg: null });
  }, []);

  /* ── toggleMute ──────────────────────────────────────────────── */
  const toggleMute = useCallback(() => {
    if (!vapiRef.current) return;
    const vapi = vapiRef.current as { isMuted: () => boolean; setMuted: (v: boolean) => void };
    const next = !vapi.isMuted();
    vapi.setMuted(next);
    setTestCall(prev => ({ ...prev, muted: next }));
  }, []);

  /* ── Loading state ───────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 14 }}>
        <div
          className="cx-spinner"
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "3px solid var(--glass-border)",
            borderTopColor: "var(--red)",
            animation: "assistants-spin 0.8s linear infinite",
          }}
        />
        <span style={{ color: "var(--text-3)", fontSize: 13 }}>Carregando assistentes…</span>
      </div>
    );
  }

  /* ── No Vapi configured ──────────────────────────────────────── */
  if (noVapi) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div
          className="gc"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(18px)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius)",
            padding: "40px 48px",
            textAlign: "center",
            maxWidth: 420,
          }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "var(--red-lo)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 28px rgba(232,0,45,0.18)",
          }}>
            <Bot size={30} style={{ color: "var(--red)" }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
            Vapi não configurado
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65, marginBottom: 24 }}>
            Para usar assistentes de IA, configure sua chave de API do Vapi nas configurações.
          </div>
          <a
            href={`/app/tenants/${tenantId}/vapi`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: "var(--radius-sm)",
              background: "var(--red)", color: "#fff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}
          >
            <Sparkles size={14} /> Ir para Configurações
          </a>
        </div>
      </div>
    );
  }

  /* ── Empty state ─────────────────────────────────────────────── */
  if (cards.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div
          className="gc"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(18px)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius)",
            padding: "40px 48px",
            textAlign: "center",
            maxWidth: 420,
          }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "var(--red-lo)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 28px rgba(232,0,45,0.18)",
          }}>
            <Bot size={30} style={{ color: "var(--red)" }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
            Nenhum assistente encontrado
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65, marginBottom: 24 }}>
            Crie assistentes no painel do Vapi e sincronize aqui para configurá-los.
          </div>
          <button
            className="cx-refresh-btn"
            onClick={loadAssistants}
            style={{ margin: "0 auto" }}
          >
            <RefreshCw size={14} /> Recarregar
          </button>
        </div>
      </div>
    );
  }

  /* ── Main render ─────────────────────────────────────────────── */
  return (
    <>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)" }}>
            Assistentes
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
            {cards.length} assistente{cards.length !== 1 ? "s" : ""} configurado{cards.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button className="cx-refresh-btn" onClick={loadAssistants}>
          <RefreshCw size={14} /> Sincronizar
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map((card, idx) => {
          const isActive = testCall.assistantId === card.assistant.id;
          return (
            <div
              key={card.assistant.id}
              className="gc"
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(18px)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                transition: "box-shadow 0.2s, border-left 0.2s",
                ...(isActive
                  ? { borderLeft: "3px solid var(--red)", boxShadow: "-4px 0 20px rgba(232,0,45,0.2)" }
                  : {}),
              }}
            >
              {/* ── Card Header ── */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "16px 20px", cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => toggleCard(idx)}
              >
                {/* Bot icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: "var(--red-lo)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 16px rgba(232,0,45,0.2)",
                }}>
                  <Bot size={20} style={{ color: "var(--red)" }} />
                </div>

                {/* Name + ID */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.3 }}>
                    {card.assistant.name || "Assistente sem nome"}
                  </div>
                  <div style={{
                    fontSize: 11, color: "var(--text-3)", marginTop: 2,
                    fontFamily: "'JetBrains Mono', monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: 260,
                  }}>
                    {card.assistant.id}
                  </div>
                </div>

                {/* Right controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {/* Structured output badge */}
                  {(card.assistant.structuredOutputs?.length ?? 0) > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "var(--cyan)",
                      background: "rgba(0,194,255,0.12)", border: "1px solid rgba(0,194,255,0.2)",
                      borderRadius: 100, padding: "3px 10px", letterSpacing: "0.02em",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <Sparkles size={10} />
                      {card.assistant.structuredOutputs!.length} saídas
                    </span>
                  )}

                  {/* Testar button */}
                  <button
                    className="cx-filter-btn"
                    style={{
                      fontSize: 12, fontWeight: 600, gap: 6, padding: "7px 14px",
                      color: "var(--green)", border: "1px solid rgba(0,214,143,0.25)",
                      background: "rgba(0,214,143,0.08)",
                    }}
                    onClick={() => startTestCall(card.assistant.id)}
                    disabled={testCall.status !== "idle"}
                  >
                    <Phone size={13} />
                    Testar
                  </button>

                  {/* Chevron */}
                  <div style={{ color: "var(--text-3)", marginLeft: 4 }} onClick={() => toggleCard(idx)}>
                    {card.expanded
                      ? <ChevronUp size={18} />
                      : <ChevronDown size={18} />}
                  </div>
                </div>
              </div>

              {/* ── Expanded Editor ── */}
              {card.expanded && (
                <div style={{
                  borderTop: "1px solid var(--glass-border)",
                  padding: "20px",
                  animation: "assistants-slide-down 0.18s ease",
                  background: "rgba(0,0,0,0.08)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Name */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>
                        Nome do Assistente
                      </label>
                      <input
                        value={card.draft.name}
                        onChange={e => updateCard(idx, "name", e.target.value)}
                        style={{
                          width: "100%", padding: "10px 14px",
                          background: "var(--glass-bg-2)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-1)", fontSize: 14,
                          outline: "none", fontFamily: "inherit",
                          transition: "border-color 0.15s",
                        }}
                        placeholder="Nome do assistente"
                      />
                    </div>

                    {/* First message */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>
                        Primeira Mensagem
                      </label>
                      <textarea
                        value={card.draft.firstMessage}
                        onChange={e => updateCard(idx, "firstMessage", e.target.value)}
                        rows={3}
                        style={{
                          width: "100%", padding: "10px 14px",
                          background: "var(--glass-bg-2)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-1)", fontSize: 14,
                          outline: "none", resize: "vertical",
                          fontFamily: "inherit", lineHeight: 1.6,
                          transition: "border-color 0.15s",
                        }}
                        placeholder="Olá, como posso te ajudar hoje?"
                      />
                    </div>

                    {/* System prompt */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>
                        Prompt do Sistema
                      </label>
                      <textarea
                        value={card.draft.systemPrompt}
                        onChange={e => updateCard(idx, "systemPrompt", e.target.value)}
                        style={{
                          width: "100%", padding: "10px 14px",
                          background: "var(--glass-bg-2)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-1)", fontSize: 13,
                          outline: "none", resize: "vertical",
                          fontFamily: "'JetBrains Mono', monospace",
                          lineHeight: 1.7, minHeight: 240,
                          transition: "border-color 0.15s",
                        }}
                        placeholder="Você é um assistente especializado em..."
                      />
                    </div>

                    {/* Voice chip */}
                    {card.assistant.voice && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          padding: "5px 12px",
                          background: "rgba(168,85,247,0.1)",
                          border: "1px solid rgba(168,85,247,0.2)",
                          borderRadius: 100,
                          fontSize: 12, color: "var(--purple)",
                          fontWeight: 500,
                        }}>
                          <Mic size={12} />
                          {card.assistant.voice.provider ?? "—"}
                          {card.assistant.voice.voiceId ? ` · ${card.assistant.voice.voiceId}` : ""}
                        </div>
                        {card.assistant.model?.model && (
                          <div style={{
                            display: "inline-flex", alignItems: "center", gap: 7,
                            padding: "5px 12px",
                            background: "rgba(0,194,255,0.08)",
                            border: "1px solid rgba(0,194,255,0.18)",
                            borderRadius: 100,
                            fontSize: 12, color: "var(--cyan)",
                            fontWeight: 500,
                          }}>
                            <Sparkles size={12} />
                            {card.assistant.model.model}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save button row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                      <button
                        className="cx-refresh-btn"
                        onClick={() => saveAssistant(idx)}
                        disabled={card.saving || !card.dirty}
                        style={{
                          opacity: card.dirty ? 1 : 0.45,
                          transition: "opacity 0.15s, background 0.2s",
                          ...(card.saved ? { animation: "assistants-saved-flash 0.7s ease" } : {}),
                        }}
                      >
                        {card.saving ? (
                          <><Loader2 size={14} style={{ animation: "assistants-spin 0.8s linear infinite" }} /> Salvando…</>
                        ) : card.saved ? (
                          <><Check size={14} style={{ color: "var(--green)" }} /> Salvo!</>
                        ) : (
                          <><Save size={14} /> Salvar</>
                        )}
                      </button>
                      {card.dirty && !card.saving && (
                        <span style={{ fontSize: 12, color: "var(--text-3)" }}>Alterações não salvas</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Test Call Modal ────────────────────────────────────────── */}
      {testCall.status !== "idle" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
        }}>
          <div
            className="gc"
            style={{
              background: "var(--glass-bg-2)",
              backdropFilter: "blur(24px)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius)",
              padding: "36px 40px",
              minWidth: 340,
              maxWidth: 420,
              textAlign: "center",
              position: "relative",
            }}
          >
            {/* Close */}
            <button
              onClick={stopTestCall}
              style={{
                position: "absolute", top: 14, right: 14,
                width: 30, height: 30,
                background: "var(--glass-bg-2)",
                border: "1px solid var(--glass-border)",
                borderRadius: "50%",
                color: "var(--text-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>

            {/* ── Connecting ── */}
            {testCall.status === "connecting" && (
              <>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "var(--red-lo)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  animation: "assistants-pulse-ring 1.4s ease-in-out infinite",
                }}>
                  <Phone size={28} style={{ color: "var(--red)" }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
                  Conectando…
                </div>
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                  Aguarde enquanto iniciamos a chamada de teste
                </div>
              </>
            )}

            {/* ── Active ── */}
            {testCall.status === "active" && (
              <>
                {/* Green pulse dot */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: "var(--green)",
                    animation: "assistants-pulse-green 1.2s ease-in-out infinite",
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>Em chamada</span>
                </div>

                {/* Volume bar */}
                <div style={{
                  height: 6, background: "var(--glass-bg)",
                  borderRadius: 100, overflow: "hidden",
                  marginBottom: 28, width: "100%",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 100,
                    background: "var(--green)",
                    width: `${Math.min(100, testCall.volumeLevel * 100)}%`,
                    transition: "width 0.1s ease",
                    boxShadow: "0 0 8px rgba(0,214,143,0.4)",
                  }} />
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button
                    className="cx-filter-btn"
                    onClick={toggleMute}
                    style={{
                      gap: 8, padding: "10px 20px",
                      color: testCall.muted ? "var(--yellow)" : "var(--text-2)",
                      border: testCall.muted ? "1px solid rgba(255,184,0,0.3)" : "1px solid var(--glass-border)",
                      background: testCall.muted ? "rgba(255,184,0,0.08)" : "var(--glass-bg)",
                    }}
                  >
                    {testCall.muted ? <MicOff size={15} /> : <Mic size={15} />}
                    {testCall.muted ? "Reativar" : "Mudo"}
                  </button>
                  <button
                    className="cx-refresh-btn"
                    onClick={stopTestCall}
                    style={{ gap: 8, padding: "10px 20px", background: "var(--red)" }}
                  >
                    <PhoneOff size={15} /> Encerrar
                  </button>
                </div>
              </>
            )}

            {/* ── Ended ── */}
            {testCall.status === "ended" && (
              <>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "rgba(0,214,143,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  boxShadow: "0 0 28px rgba(0,214,143,0.15)",
                }}>
                  <CheckCircle2 size={32} style={{ color: "var(--green)" }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
                  Chamada encerrada
                </div>
                <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 24 }}>
                  A chamada de teste foi concluída com sucesso.
                </div>
                <button className="cx-filter-btn" onClick={stopTestCall} style={{ margin: "0 auto", gap: 8 }}>
                  <X size={14} /> Fechar
                </button>
              </>
            )}

            {/* ── Error ── */}
            {testCall.status === "error" && (
              <>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "var(--red-lo)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                  boxShadow: "0 0 28px rgba(232,0,45,0.18)",
                }}>
                  <AlertTriangle size={30} style={{ color: "var(--red)" }} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
                  Erro na chamada
                </div>
                {testCall.errorMsg && (
                  <div style={{
                    fontSize: 12, color: "var(--text-3)", marginBottom: 20,
                    background: "var(--red-lo)", borderRadius: "var(--radius-sm)",
                    padding: "8px 14px", lineHeight: 1.6,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {testCall.errorMsg}
                  </div>
                )}
                <button className="cx-refresh-btn" onClick={stopTestCall} style={{ margin: "0 auto", gap: 8 }}>
                  <X size={14} /> Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toasts ───────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed", bottom: 24, right: 24,
          display: "flex", flexDirection: "column", gap: 8,
          zIndex: 2000,
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`cx-toast cx-toast-${t.type}`}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              background: "var(--glass-bg-2)",
              backdropFilter: "blur(16px)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13, color: "var(--text-1)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              animation: "assistants-slide-down 0.2s ease",
            }}
          >
            {t.type === "success"
              ? <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} />
              : <X size={14} style={{ color: "var(--red)", flexShrink: 0 }} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
