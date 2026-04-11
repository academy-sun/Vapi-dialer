export type ReasonTone = "success" | "failure" | "warning" | "neutral" | "info";

export interface ReasonInfo {
  label: string;
  badge: string;
  tone: ReasonTone;
}

const EXACT: Record<string, ReasonInfo> = {
  "customer-ended-call":      { label: "Cliente encerrou",    badge: "badge-green",  tone: "success" },
  "assistant-ended-call":     { label: "Assistente encerrou", badge: "badge-blue",   tone: "info"    },
  "assistant-said-end-call-phrase": { label: "Assistente encerrou", badge: "badge-blue", tone: "info" },
  "no-answer":                { label: "Sem resposta",        badge: "badge-gray",   tone: "neutral" },
  "customer-did-not-answer":  { label: "Não atendeu",         badge: "badge-gray",   tone: "neutral" },
  "busy":                     { label: "Ocupado",             badge: "badge-yellow", tone: "warning" },
  "voicemail":                { label: "Caixa postal",        badge: "badge-purple", tone: "warning" },
  "customer-busy":            { label: "Ocupado",             badge: "badge-yellow", tone: "warning" },
  "failed":                   { label: "Falha",               badge: "badge-red",    tone: "failure" },
  "pipeline-error":           { label: "Falha técnica",       badge: "badge-red",    tone: "failure" },
  "exceeded-max-duration":    { label: "Duração máxima",      badge: "badge-gray",   tone: "neutral" },
  "silence-timed-out":        { label: "Silêncio na ligação", badge: "badge-gray",   tone: "neutral" },
};

const PATTERNS: Array<{ test: (r: string) => boolean; info: ReasonInfo }> = [
  {
    test: (r) => r.includes("sip-outbound-call-failed-to-connect"),
    info: { label: "Falha ao conectar com o número", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.includes("sip-503") || r.includes("sip-408") || r.includes("sip-404") || r.includes("sip-500") || r.includes("sip-502"),
    info: { label: "Número indisponível / inválido", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.includes("sip-480"),
    info: { label: "Número temporariamente indisponível", badge: "badge-yellow", tone: "warning" },
  },
  {
    test: (r) => r.includes("sip-403") || r.includes("sip-401") || r.includes("sip-407"),
    info: { label: "Número desconhecido", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.includes("sip-486") || r.includes("sip-487") || r.includes("sip-603"),
    info: { label: "Chamada recusada", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.startsWith("vapifault-") || r.includes("deepgram") || r.includes("transcriber-failed") || r.includes("assistant-error") || r.includes("model-error"),
    info: { label: "Falha técnica", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.includes("silence"),
    info: { label: "Silêncio na ligação", badge: "badge-gray", tone: "neutral" },
  },
  {
    test: (r) => r.includes("twilio") || r.includes("telnyx") || r.includes("vonage"),
    info: { label: "Falha da operadora", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.startsWith("call.in-progress.error") || r.startsWith("call.ringing.error"),
    info: { label: "Falha ao conectar com o número", badge: "badge-red", tone: "failure" },
  },
  {
    test: (r) => r.includes("error") || r.includes("fault") || r.includes("failed"),
    info: { label: "Falha técnica", badge: "badge-red", tone: "failure" },
  },
];

const FALLBACK: ReasonInfo = { label: "Encerramento", badge: "badge-gray", tone: "neutral" };
const IN_PROGRESS: ReasonInfo = { label: "Em andamento", badge: "badge-gray", tone: "neutral" };

export function getReasonInfo(reason: string | null | undefined): ReasonInfo {
  if (reason === null || reason === undefined || reason === "") return IN_PROGRESS;
  const key = String(reason).toLowerCase().trim();
  if (EXACT[key]) return EXACT[key];
  for (const p of PATTERNS) {
    if (p.test(key)) return p.info;
  }
  return FALLBACK;
}

export function getReasonLabel(reason: string | null | undefined): string {
  return getReasonInfo(reason).label;
}

export function getReasonBadge(reason: string | null | undefined): string {
  return getReasonInfo(reason).badge;
}

export function getReasonTone(reason: string | null | undefined): ReasonTone {
  return getReasonInfo(reason).tone;
}
