"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Bot, ChevronDown, ChevronUp, Save, Loader2, AlertTriangle,
  Check, RefreshCw, Mic, Sparkles,
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
      // expand — load if not yet loaded
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
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
        <div className="card p-10 text-center text-gray-400">
          <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Vapi não configurada</p>
          <p className="text-sm mt-1">Configure sua API Key do Vapi em Configuração Vapi para ver os assistentes.</p>
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
        <div className="card p-10 text-center text-gray-400">
          <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Nenhum assistente encontrado</p>
          <p className="text-sm mt-1">Crie um assistente no painel do Vapi e ele aparecerá aqui.</p>
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
        <button onClick={loadAssistants} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      <div className="space-y-3">
        {cards.map((card) => (
          <div key={card.id} className="card">
            {/* Header row — always visible */}
            <button
              onClick={() => toggleCard(card.id)}
              className="w-full flex items-center justify-between gap-3 p-5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{card.name}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{card.id.slice(0, 20)}&hellip;</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {card.loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                {card.allFields.length > 0 && (
                  <span className="badge badge-indigo flex items-center gap-1 text-xs">
                    <Sparkles className="w-3 h-3" />
                    {card.allFields.length} campo{card.allFields.length !== 1 ? "s" : ""}
                  </span>
                )}
                {card.expanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {/* Expanded editor */}
            {card.expanded && (
              <div className="border-t border-gray-100 p-5 space-y-5">
                {card.loading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando configurações&hellip;
                  </div>
                ) : (
                  <>
                    {card.error && (
                      <div className="alert-error">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-sm">{card.error}</span>
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
                        className="form-input min-h-[80px] resize-y"
                        value={card.editFirstMessage}
                        onChange={(e) => updateCard(card.id, { editFirstMessage: e.target.value })}
                        placeholder="Olá! Aqui é a Ana da Clínica…"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Primeira coisa que o agente diz quando a chamada é atendida.
                      </p>
                    </div>

                    {/* System prompt */}
                    <div>
                      <label className="form-label">Prompt do sistema</label>
                      <textarea
                        className="form-input min-h-[240px] resize-y font-mono text-sm"
                        value={card.editSystemPrompt}
                        onChange={(e) => updateCard(card.id, { editSystemPrompt: e.target.value })}
                        placeholder="Você é um assistente de vendas…"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Instruções completas de comportamento do agente.
                      </p>
                    </div>

                    {/* Voice info (read-only) */}
                    {card.config?.voice && Object.keys(card.config.voice).length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 p-3 bg-gray-50 rounded-lg">
                        <Mic className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Voz: {String(card.config.voice.voiceId ?? card.config.voice.voice ?? "—")}
                        </span>
                      </div>
                    )}

                    {/* Save button */}
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-gray-400">
                        Snapshot automático salvo antes de cada edição
                      </p>
                      <button
                        onClick={() => saveAssistant(card.id)}
                        disabled={card.saving}
                        className="btn-primary"
                      >
                        {card.saving ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Salvando&hellip;</>
                        ) : card.saved ? (
                          <><Check className="w-4 h-4" />Salvo!</>
                        ) : (
                          <><Save className="w-4 h-4" />Salvar Alterações</>
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
