export interface Call {
  id: string;
  vapi_call_id: string;
  status: string | null;
  ended_reason: string | null;
  cost: number | null;
  summary: string | null;
  duration_seconds: number | null;
  created_at: string;
  lead_phone: string | null;
  lead_name: string | null;
  interesse: string | null;
  performance_score: number | null;
  success_evaluation: boolean | null;
  resumo: string | null;
  pontos_melhoria: string | null;
  objecoes: string | null;
  motivos_falha: string | null;
  proximo_passo: string | null;
  score: number | null;
  outputs_flat: Record<string, unknown> | null;
  leads: { next_attempt_at: string | null } | null;
}

export interface CallDetail extends Call {
  transcript: string | null;
  recording_url: string | null;
  stereo_recording_url: string | null;
}

// Campos do result que devem aparecer no topo do drawer (labels amigáveis)
export const RESULT_PRIORITY_FIELDS: Record<string, string> = {
  interesse:                    "Interesse",
  success:                      "Sucesso",
  sucesso:                      "Sucesso",
  successEvaluation:            "Avaliação",
  success_evaluation:           "Avaliação",
  momentoDeCompra:              "Momento de Compra",
  ComparImovelPlanta:           "Comparou Planta",
  QuerReuniaoComVendedor:       "Quer Reunião",
  "Performance Global Score":   "Score Global",
};

const KNOWN_LONG_TEXT_FIELDS = new Set([
  "resumo", "Pontos Melhoria", "Lista Objeções",
  "Possíveis Motivos de Falha", "Justificative Performance Global",
  "compliancePlan", "summary", "notes", "observacoes", "justificativa",
]);

export function isLongTextField(key: string, value: unknown): boolean {
  if (KNOWN_LONG_TEXT_FIELDS.has(key)) return true;
  if (typeof value === "string" && value.length > 60) return true;
  const lk = key.toLowerCase();
  return lk.includes("motiv") || lk.includes("justif") || lk.includes("resum") ||
         lk.includes("descri") || lk.includes("observ") || lk.includes("nota") ||
         lk.includes("comment") || lk.includes("reason") || lk.includes("detail");
}

/** Extrai o nome de exibição do lead a partir de data_json. */
export function getNomeDisplay(dataJson: Record<string, string> | null | undefined): string {
  if (!dataJson) return "";
  return (
    dataJson.nome_identificacao ??
    dataJson.name ??
    dataJson.first_name ??
    dataJson.nome ??
    dataJson.primeiro_nome ??
    ""
  );
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return phone;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRelativeTime(dateStr: string): { relative: string; full: string } {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  let relative: string;
  if (diff < 60) relative = "agora mesmo";
  else if (diff < 3600) relative = `há ${Math.floor(diff / 60)} min`;
  else if (diff < 86400) relative = `há ${Math.floor(diff / 3600)} h`;
  else relative = `há ${Math.floor(diff / 86400)} dias`;
  return { relative, full: date.toLocaleString("pt-BR") };
}

export function extractResult(outputs: Record<string, unknown>): Record<string, unknown> | null {
  if (!outputs) return null;
  if (outputs.result && typeof outputs.result === "object" && !Array.isArray(outputs.result)) {
    return outputs.result as Record<string, unknown>;
  }
  for (const val of Object.values(outputs)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if (obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)) {
        return obj.result as Record<string, unknown>;
      }
    }
  }
  return outputs;
}

export const INTERESSE_KEYS = [
  "interesse", "Interesse", "INTERESSE",
  "interest", "Interest", "INTEREST",
  "nivel_interesse", "nivelInteresse", "nivel_de_interesse",
  "lead_interest", "leadInterest",
  "success", "sucesso", "Sucesso",
  "interested", "successEvaluation", "success_evaluation",
];

export function getInteresseValue(result: Record<string, unknown>): unknown {
  for (const key of INTERESSE_KEYS) {
    if (key in result && result[key] != null && result[key] !== "") {
      return result[key];
    }
  }
  return undefined;
}

export function isSuccessValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return v === true || s === "true" || s === "sucesso" || s === "sim" || s === "yes" || s === "1";
}

export function isFailureValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return v === false || s === "false" || s === "fracasso" || s === "não" || s === "nao" || s === "no" || s === "0";
}

export function valueToLabel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
