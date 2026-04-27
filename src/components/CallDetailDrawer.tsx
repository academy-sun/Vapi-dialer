"use client";
import { useState } from "react";
import {
  PhoneCall, X, Mic, ExternalLink, ChevronDown, ChevronUp,
  Star, CheckCircle2, XCircle, Send, Loader2, AlertTriangle, Check,
} from "lucide-react";
import {
  type Call, type CallDetail,
  RESULT_PRIORITY_FIELDS,
  isLongTextField, isSuccessValue, isFailureValue, valueToLabel,
  formatPhone, formatDuration,
} from "@/lib/calls-shared";
import { getReasonInfo } from "@/lib/call-reasons";

/** Badge compacto para tabelas: Sucesso / Fracasso / valor do campo interesse */
export function InteresseBadge({ call }: { call: Call }) {
  if (call.success_evaluation === true) {
    return (
      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <CheckCircle2 style={{ width: 12, height: 12 }} /> Sucesso
      </span>
    );
  }
  if (call.success_evaluation === false) {
    return (
      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <XCircle style={{ width: 12, height: 12 }} /> Fracasso
      </span>
    );
  }
  if (call.interesse) {
    const v = call.interesse.toLowerCase().trim();
    const badgeColor = v === "sucesso" || v === "sim" || v === "true" || v === "yes" || v === "1"
      ? "badge-green"
      : v === "sem interesse" || v === "não" || v === "no" || v === "false" || v === "0"
      ? "badge-red"
      : v === "callback" || v === "retornar" || v === "agendar"
      ? "badge-yellow"
      : "badge-purple";
    return (
      <span className={`badge ${badgeColor}`}>
        {valueToLabel(call.interesse)}
      </span>
    );
  }
  return <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>;
}

/** Painel de avaliação detalhada no drawer */
function EvaluationPanel({ call }: { call: CallDetail }) {
  const result: Record<string, unknown> = {};
  if (call.outputs_flat) Object.assign(result, call.outputs_flat);

  if (call.interesse) result["Interesse"] = call.interesse;
  if (call.success_evaluation != null) result["Avaliação"] = call.success_evaluation ? "Sim" : "Não";
  if (call.resumo) result["resumo"] = call.resumo;
  if (call.pontos_melhoria) result["Pontos Melhoria"] = call.pontos_melhoria;
  if (call.objecoes) result["Lista Objeções"] = call.objecoes;
  if (call.motivos_falha) result["Possíveis Motivos de Falha"] = call.motivos_falha;
  if (call.proximo_passo) result["Próximo Passo"] = call.proximo_passo;

  if (Object.keys(result).length === 0) return null;

  const shortEntries: [string, unknown][] = [];
  const longEntries: [string, unknown][] = [];

  for (const [k, v] of Object.entries(result)) {
    if (v === null || v === undefined || v === "") continue;
    if (k === "Performance Global Score" || k === "score") continue;
    if (isLongTextField(k, v)) longEntries.push([k, v]);
    else shortEntries.push([k, v]);
  }

  const score = call.score ?? call.performance_score ?? result["Performance Global Score"];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {score != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,194,255,0.08)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(0,194,255,0.15)' }}>
          <Star style={{ width: 16, height: 16, color: 'var(--cyan)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score Global</span>
          <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--cyan)', fontFamily: "'JetBrains Mono', monospace" }}>{String(score)}</span>
        </div>
      )}

      {shortEntries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {shortEntries.map(([k, v]) => {
            const label = RESULT_PRIORITY_FIELDS[k] ?? k;
            const isScore = k === "Performance Global Score";
            if (isScore) return null;
            const isSuccess = isSuccessValue(v);
            const isFailure = isFailureValue(v);
            return (
              <div key={k} style={{ background: 'var(--glass-bg)', borderRadius: 10, padding: '8px 10px', border: '1px solid var(--glass-border)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</p>
                {isSuccess ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} /> Sim
                  </span>
                ) : isFailure ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                    <XCircle style={{ width: 12, height: 12 }} /> Não
                  </span>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valueToLabel(v)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {longEntries.map(([k, v]) => {
        const label = RESULT_PRIORITY_FIELDS[k] ?? k;
        return (
          <div key={k}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
              {valueToLabel(v)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

interface CallDetailDrawerProps {
  call: CallDetail | null;
  onClose: () => void;
  isAdminOrOwner: boolean;
  tenantId: string;
}

type ResendState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; status: number; url: string }
  | { kind: "error"; message: string };

function ResendWebhookPanel({ tenantId, callRecordId }: { tenantId: string; callRecordId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ResendState>({ kind: "idle" });

  async function send() {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/tenants/${tenantId}/calls/${callRecordId}/resend-webhook`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(url.trim() ? { webhookUrl: url.trim() } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState({ kind: "ok", status: data.status ?? res.status, url: data.url ?? "" });
      } else {
        setState({ kind: "error", message: data.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div style={{ paddingTop: 8, borderTop: '1px solid var(--glass-border)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Send style={{ width: 12, height: 12 }} /> Webhook de saída
      </p>

      {!open ? (
        <button
          onClick={() => { setOpen(true); setState({ kind: "idle" }); }}
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '6px 12px', width: '100%', justifyContent: 'center' }}
        >
          <Send style={{ width: 14, height: 14 }} /> Reenviar webhook desta chamada
        </button>
      ) : (
        <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: 12, border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
            URL do webhook (opcional — em branco usa a URL da fila)
          </label>
          <input
            type="url"
            className="form-input"
            style={{ fontSize: 12, padding: '6px 10px' }}
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={state.kind === "loading"}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={send}
              disabled={state.kind === "loading"}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '6px 12px', flex: 1, justifyContent: 'center' }}
            >
              {state.kind === "loading" ? (
                <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Enviando…</>
              ) : (
                <><Send style={{ width: 14, height: 14 }} /> Enviar agora</>
              )}
            </button>
            <button
              onClick={() => { setOpen(false); setUrl(""); setState({ kind: "idle" }); }}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}
              disabled={state.kind === "loading"}
            >
              Cancelar
            </button>
          </div>

          {state.kind === "ok" && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--green)', background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(34,197,94,0.2)' }}>
              <Check style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
              <span>Entregue com HTTP {state.status}{state.url ? ` em ${state.url}` : ""}</span>
            </div>
          )}
          {state.kind === "error" && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--red)', background: 'var(--red-lo)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(232,0,45,0.25)' }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
              <span>{state.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CallDetailDrawer({ call, onClose, isAdminOrOwner, tenantId }: CallDetailDrawerProps) {
  const [showTranscript, setShowTranscript] = useState(false);

  if (!call) return null;

  const reason = getReasonInfo(call.ended_reason);

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-overlay"
        style={{ background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)', alignItems: 'stretch', justifyContent: 'flex-end' }}
        onClick={onClose}
      />

      {/* Painel fixo da direita */}
      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          height: '100%',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          borderLeft: '1px solid var(--glass-border)',
          boxShadow: '0 0 64px rgba(0,0,0,0.5)',
          width: 440,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: 'var(--red-lo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PhoneCall style={{ width: 14, height: 14, color: 'var(--red)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Detalhe da Chamada</h2>
              <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {isAdminOrOwner ? call.vapi_call_id : `${call.vapi_call_id.slice(0, 8)}…`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Conteúdo com scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Info básica — telefone + resultado */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Telefone</p>
              <p className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                {call.lead_phone ? formatPhone(call.lead_phone) : "—"}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span className={`badge ${reason.badge}`}>{reason.label}</span>
            </div>
          </div>

          {/* Métricas rápidas */}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isAdminOrOwner ? '1fr 1fr 1fr' : '1fr 1fr' }}>
            <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Duração</p>
              <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                {formatDuration(call.duration_seconds)}
              </p>
            </div>
            {isAdminOrOwner && (
              <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Custo</p>
                <p className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                  {call.cost != null ? `$${call.cost.toFixed(4)}` : "—"}
                </p>
              </div>
            )}
            <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Data</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                {new Date(call.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          {/* Avaliação estruturada */}
          {(call.outputs_flat || call.interesse || call.success_evaluation || call.resumo) && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Avaliação</p>
              <EvaluationPanel call={call} />
            </div>
          )}

          {/* Resumo do assistente */}
          {call.summary && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Resumo</p>
              <p style={{ fontSize: 13, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: '12px 14px', lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
                {call.summary}
              </p>
            </div>
          )}

          {/* Gravação */}
          {call.recording_url && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mic style={{ width: 14, height: 14 }} /> Gravação
              </p>
              <div style={{ background: 'var(--glass-bg)', borderRadius: 12, padding: 12, border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <audio controls src={call.recording_url} style={{ width: '100%', height: 36 }} />
                <div style={{ display: 'flex', gap: 12 }}>
                  <a
                    href={call.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                  >
                    <ExternalLink style={{ width: 12, height: 12 }} /> Mono
                  </a>
                  {call.stereo_recording_url && (
                    <a
                      href={call.stereo_recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                    >
                      <ExternalLink style={{ width: 12, height: 12 }} /> Estéreo
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Transcrição colapsável */}
          {call.transcript && (
            <div>
              <button
                onClick={() => setShowTranscript((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100%', padding: '4px 0', transition: 'color .15s' }}
              >
                Transcrição
                {showTranscript ? <ChevronUp style={{ width: 14, height: 14, marginLeft: 'auto' }} /> : <ChevronDown style={{ width: 14, height: 14, marginLeft: 'auto' }} />}
              </button>
              {showTranscript && (
                <pre style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', background: 'var(--glass-bg)', borderRadius: 10, padding: 12, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, border: '1px solid var(--glass-border)' }}>
                  {call.transcript}
                </pre>
              )}
            </div>
          )}

          {/* Reenviar webhook (admin/owner) */}
          {isAdminOrOwner && (
            <ResendWebhookPanel tenantId={tenantId} callRecordId={call.id} />
          )}

          {/* Vapi ID */}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--glass-border)' }}>
            {isAdminOrOwner ? (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Vapi Call ID</p>
                <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all', background: 'var(--glass-bg)', borderRadius: 8, padding: '6px 8px', userSelect: 'all', border: '1px solid var(--glass-border)' }}>
                  {call.vapi_call_id}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Call ID</p>
                <p className="mono" style={{ fontSize: 11, color: 'var(--text-3)', background: 'var(--glass-bg)', borderRadius: 8, padding: '6px 8px', border: '1px solid var(--glass-border)' }}>
                  {call.vapi_call_id.slice(0, 8)}…
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
