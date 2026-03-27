import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// ─── Classificação de ended_reason ───────────────────────────────────────────
// Vapi v1 usava: "no-answer", "busy", "voicemail", "failed"
// Vapi v2 usa:   "customer-did-not-answer", "customer-busy", "silence-timed-out"
//                "call.in-progress.error-*" para erros SIP

const ANSWERED_REASONS = new Set([
  "customer-ended-call",
  "assistant-ended-call",
]);

const VOICEMAIL_REASONS = new Set([
  "voicemail",
  "machine_end_silence",
  "machine_end_other",
  "silence-timed-out", // Vapi v2: silêncio → caixa postal ou ninguém atendeu
]);

const BUSY_REASONS = new Set([
  "busy",
  "customer-busy", // Vapi v2
]);

const NO_ANSWER_REASONS = new Set([
  "no-answer",
  "customer-did-not-answer", // Vapi v2
]);

const FAILED_REASONS = new Set([
  "failed",
  "pipeline-error",
  "error",
]);

// Erros SIP chegam como strings longas "call.in-progress.error-*"
function isSipError(reason: string): boolean {
  return reason.startsWith("call.in-progress.error");
}

function classifyReason(
  reason: string | null
): "answered" | "voicemail" | "busy" | "no-answer" | "failed" | "other" {
  if (!reason)                        return "other";
  if (ANSWERED_REASONS.has(reason))   return "answered";
  if (VOICEMAIL_REASONS.has(reason))  return "voicemail";
  if (BUSY_REASONS.has(reason))       return "busy";
  if (NO_ANSWER_REASONS.has(reason))  return "no-answer";
  if (FAILED_REASONS.has(reason))     return "failed";
  if (isSipError(reason))             return "failed";
  return "other";
}

// ─── Detecção de conversão em structured_outputs ─────────────────────────────
// Suporta duas estruturas:
//   1. Flat (legado):   { success: true, sucesso: "sim", interesse: "Sucesso" }
//   2. Nested (Vapi v2): { assistantId: { name, result: { interesse, QuerReuniaoComVendedor, ... } } }

const NEGATIVE_VALUES = new Set([
  "fracasso", "falha", "não", "nao", "no", "false", "0",
]);

function isPositiveValue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const norm = v.toLowerCase().trim();
    if (NEGATIVE_VALUES.has(norm)) return false;
    // Valores positivos comuns
    if (["sim", "yes", "sucesso", "true", "convertido", "interessado", "agendado"].includes(norm)) return true;
  }
  return false;
}

// Campos que indicam sucesso quando positivos
const SUCCESS_FIELDS = new Set([
  "success", "sucesso", "interested", "interesse",
  "converted", "convertido", "agendado", "scheduled",
  "QuerReuniaoComVendedor", "querreuniaocumvendedor",
  "momentoDeCompra", "momentodecompra",
]);

function isConversion(structured_outputs: unknown): boolean {
  if (!structured_outputs || typeof structured_outputs !== "object") return false;
  const out = structured_outputs as Record<string, unknown>;

  // 1. Estrutura flat (legado): chaves diretas no objeto raiz
  for (const field of SUCCESS_FIELDS) {
    if (field in out && isPositiveValue(out[field])) return true;
  }

  // 2. Estrutura nested (Vapi v2): { assistantId: { result: { ... } } }
  for (const key of Object.keys(out)) {
    const entry = out[key];
    if (!entry || typeof entry !== "object") continue;
    const entryObj = entry as Record<string, unknown>;

    // Verificar no resultado aninhado
    const result = entryObj.result;
    if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      for (const field of SUCCESS_FIELDS) {
        // Case-insensitive lookup
        const val = resultObj[field] ??
          resultObj[field.toLowerCase()] ??
          resultObj[field.charAt(0).toUpperCase() + field.slice(1)];
        if (val !== undefined && isPositiveValue(val)) return true;
      }
    }

    // Verificar diretamente no entry (sem result aninhado)
    for (const field of SUCCESS_FIELDS) {
      if (field in entryObj && isPositiveValue(entryObj[field])) return true;
    }
  }

  return false;
}

// ─── Detecção de conversão configurada pelo tenant ────────────────────────────
function isConversionConfigured(
  structured_outputs: unknown,
  successField: string,
  successValue: string
): boolean {
  if (!structured_outputs || typeof structured_outputs !== "object") return false;
  const out = structured_outputs as Record<string, unknown>;

  function matchesValue(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    const norm = String(v).toLowerCase().trim();
    return norm === successValue.toLowerCase().trim();
  }

  // Flat structure
  if (successField in out) return matchesValue(out[successField]);

  // Nested: { assistantId: { result: { ... } } }
  for (const key of Object.keys(out)) {
    const entry = out[key];
    if (!entry || typeof entry !== "object") continue;
    const entryObj = entry as Record<string, unknown>;
    const result = entryObj.result;
    if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      if (successField in resultObj) return matchesValue(resultObj[successField]);
    }
    if (successField in entryObj) return matchesValue(entryObj[successField]);
  }
  return false;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response, membership } = await requireTenantAccess(tenantId);
  if (response) return response;

  const userRole = membership?.role ?? "member";

  const { searchParams } = new URL(req.url);
  const queueId = searchParams.get("queueId") ?? null;
  const assistantId = searchParams.get("assistantId") ?? null;
  // Filtro de período: 7, 30, 90 ou 365 dias (padrão 90)
  const days = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? "90")));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const service = createServiceClient();

  // Fetch tenant vapi_connection config (fallback — deprecated em favor de assistant_configs)
  const { data: vapiConn } = await service
    .from("vapi_connections")
    .select("success_field, success_value")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  const configuredSuccessField = vapiConn?.success_field ?? null;
  const configuredSuccessValue = vapiConn?.success_value ?? null;

  // Fetch per-assistant configs (nova tabela) — sobrescreve o fallback tenant-level
  const { data: assistantConfigsRaw } = await service
    .from("assistant_configs")
    .select("assistant_id, name, success_field, success_value")
    .eq("tenant_id", tenantId);

  const assistantConfigMap = new Map<string, {
    name:          string | null;
    success_field: string | null;
    success_value: string | null;
  }>();
  for (const ac of (assistantConfigsRaw ?? [])) {
    assistantConfigMap.set(ac.assistant_id, {
      name:          ac.name,
      success_field: ac.success_field,
      success_value: ac.success_value,
    });
  }

  // ── 1. Campanhas disponíveis (dropdown de filtro) ──
  const { data: campaignsRaw } = await service
    .from("dial_queues")
    .select("id, name, lead_list_id, assistant_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  // Mapa queueId → assistantId para lookup no cálculo de conversão
  const queueAssistantMap = new Map<string, string>();
  for (const q of (campaignsRaw ?? [])) {
    if (q.assistant_id) queueAssistantMap.set(q.id, q.assistant_id);
  }

  // Build assistants list com nomes de assistant_configs (se disponível)
  const assistantsMap = new Map<string, string>();
  for (const q of (campaignsRaw ?? [])) {
    if (q.assistant_id && !assistantsMap.has(q.assistant_id)) {
      const cfg = assistantConfigMap.get(q.assistant_id);
      assistantsMap.set(q.assistant_id, cfg?.name ?? q.assistant_id);
    }
  }
  const assistantsList = Array.from(assistantsMap.entries()).map(([id, name]) => ({ id, name }));

  // Configuração de sucesso para o contexto atual do filtro
  // Se filtrando por assistente específico: usa config daquele assistente (com fallback tenant)
  const filterAssistantCfg = assistantId ? (assistantConfigMap.get(assistantId) ?? null) : null;
  const contextSuccessField = filterAssistantCfg?.success_field ?? configuredSuccessField;
  const contextSuccessValue = filterAssistantCfg?.success_value ?? configuredSuccessValue;

  const campaigns = (campaignsRaw ?? []).map((q) => ({ id: q.id, name: q.name, assistantId: q.assistant_id }));

  // Get queue IDs filtered by assistantId (if provided)
  const filteredQueueIds: string[] | null = assistantId
    ? (campaignsRaw ?? []).filter((q) => q.assistant_id === assistantId).map((q) => q.id)
    : null;

  // ── 2. Call records ──
  // structured_outputs (JSONB pesado) vem em query separada abaixo — evita transferir
  // dados grandes desnecessariamente para chamadas que não têm outputs.
  let callQuery = service
    .from("call_records")
    .select("id, cost, duration_seconds, ended_reason, created_at, dial_queue_id")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .limit(50000);

  if (queueId) {
    callQuery = callQuery.eq("dial_queue_id", queueId);
  } else if (filteredQueueIds) {
    if (filteredQueueIds.length === 0) {
      // No queues match this assistant — short-circuit with zero data
      return NextResponse.json({
        campaigns,
        assistants: assistantsList,
        selectedQueueId: queueId,
        selectedAssistantId: assistantId,
        totalCalls: 0,
        totalLeads: 0,
        totalCost: 0,
        totalDurationSec: 0,
        totalDurationAnsweredSec: 0,
        avgDurationSec: 0,
        avgDurationAllSec: 0,
        maxDurationSec: 0,
        durationBuckets: { "0-10s": 0, "10-60s": 0, "1-3min": 0, "3-5min": 0, "5min+": 0 },
        answeredCalls: 0,
        notAnsweredCalls: 0,
        statusBreakdown: { answered: 0, voicemail: 0, busy: 0, "no-answer": 0, failed: 0, other: 0 },
        endedReasonRaw: {},
        structuredWithOutput: 0,
        structuredSuccessCalls: 0,
        structuredOutputsConfigured: false,
        costPerConversion: null,
        successField: contextSuccessField,
        successValue: contextSuccessValue,
        engagement: { under10s: 0, tenTo60s: 0, over60s: 0 },
        engagementRate: 0,
        byHour: {},
        byHourAnswerRate: {},
        byWeekday: {},
        byDayHour: {},
        byDayHourAnswered: {},
        leadsHealth: { remaining: 0, failed: 0, neverAnswered: 0 },
      });
    }
    callQuery = callQuery.in("dial_queue_id", filteredQueueIds);
  }

  const { data: callData, error: callError } = await callQuery;
  if (callError) return NextResponse.json({ error: callError.message }, { status: 500 });

  // ── 2b. Structured outputs — query separada, só registros não-nulos ──
  // Muito mais leve: só transfere JSONB para o subconjunto de chamadas que têm outputs.
  let soQuery = service
    .from("call_records")
    .select("id, structured_outputs, dial_queue_id")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .not("structured_outputs", "is", null)
    .limit(50000);
  if (queueId) {
    soQuery = soQuery.eq("dial_queue_id", queueId);
  } else if (filteredQueueIds && filteredQueueIds.length > 0) {
    soQuery = soQuery.in("dial_queue_id", filteredQueueIds);
  }
  const { data: soData } = await soQuery;
  // Mapa callId → structured_outputs para lookup O(1) nos cálculos de conversão
  const soMap = new Map<string, unknown>();
  for (const r of (soData ?? [])) soMap.set(r.id, r.structured_outputs);

  // ── 3. Leads health — usar COUNT-only queries (evita buscar milhares de rows) ──
  // Mesmo padrão da rota /progress, que não travou o Supabase.
  const selectedQueue = queueId
    ? (campaignsRaw ?? []).find((q) => q.id === queueId)
    : null;
  const leadListId = selectedQueue?.lead_list_id ?? null;

  const leadsBase = () => {
    const q = service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    return leadListId ? q.eq("lead_list_id", leadListId) : q;
  };

  const [totalLeadsRes, remainingRes, failedRes, neverAnsweredRes] = await Promise.all([
    leadsBase(),
    leadsBase().in("status", ["queued", "callbackScheduled", "new"]),
    leadsBase().eq("status", "failed"),
    leadsBase().eq("status", "failed").gte("attempt_count", 3),
  ]);

  const totalLeads        = totalLeadsRes.count ?? 0;
  const leadsRemaining    = remainingRes.count ?? 0;
  const leadsFailed       = failedRes.count ?? 0;
  const leadsNeverAnswered = neverAnsweredRes.count ?? 0;

  // ── Agregações ────────────────────────────────────────────────────────────
  const calls = callData ?? [];

  // Métricas base
  const totalCalls       = calls.length;
  const totalCost        = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalDurationSec = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);

  // Breakdown por status com ended_reason raw para diagnóstico
  const statusBreakdown = {
    answered:    0,
    voicemail:   0,
    busy:        0,
    "no-answer": 0,
    failed:      0,
    other:       0,
  };
  const endedReasonRaw: Record<string, number> = {}; // diagnóstico: valores reais do banco

  for (const c of calls) {
    const cat = classifyReason(c.ended_reason);
    statusBreakdown[cat]++;

    const raw = c.ended_reason ?? "null";
    endedReasonRaw[raw] = (endedReasonRaw[raw] ?? 0) + 1;
  }

  const answeredCalls    = statusBreakdown.answered;
  const notAnsweredCalls = statusBreakdown["no-answer"];

  // Structured outputs — usar soMap/soData da query dedicada
  const structuredWithOutput = soMap.size;

  // Cálculo de conversão por chamada, usando a config do assistente correto:
  //   1. Busca assistantId da chamada via queueAssistantMap
  //   2. Busca config em assistant_configs para aquele assistantId
  //   3. Fallback para vapi_connections (tenant-level) se não houver config por assistente
  //   4. Fallback para heurística se nem tenant-level estiver configurado
  const structuredSuccessCalls = (soData ?? []).filter((c) => {
    const callAssistantId = c.dial_queue_id ? queueAssistantMap.get(c.dial_queue_id) : undefined;
    const assistantCfg    = callAssistantId ? (assistantConfigMap.get(callAssistantId) ?? null) : null;
    const sfField = assistantCfg?.success_field ?? configuredSuccessField;
    const sfValue = assistantCfg?.success_value ?? configuredSuccessValue;
    if (sfField) {
      return isConversionConfigured(c.structured_outputs, sfField, sfValue ?? "true");
    }
    return isConversion(c.structured_outputs);
  }).length;

  // Configurado = tem structured outputs E ao menos uma config (por assistente ou tenant)
  const hasAnyConfig = assistantConfigsRaw != null && assistantConfigsRaw.length > 0;
  const structuredOutputsConfigured = structuredWithOutput > 0 && (configuredSuccessField != null || hasAnyConfig);

  // ROI: null se não configurado OU 0 conversões (evita mostrar valor quebrado)
  const costPerConversion: number | null =
    structuredOutputsConfigured && structuredSuccessCalls > 0
      ? totalCost / structuredSuccessCalls
      : null;

  // Duração média só de chamadas atendidas
  const answeredWithDuration = calls.filter(
    (c) => classifyReason(c.ended_reason) === "answered" && c.duration_seconds != null
  );
  const totalDurationAnsweredSec =
    answeredWithDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const avgDurationSec =
    answeredWithDuration.length > 0 ? totalDurationAnsweredSec / answeredWithDuration.length : 0;

  // Duração média geral (compatibilidade)
  const callsWithDuration = calls.filter((c) => c.duration_seconds != null);
  const avgDurationAllSec =
    callsWithDuration.length > 0
      ? callsWithDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) /
        callsWithDuration.length
      : 0;

  // Duração máxima e buckets de duração (chamadas atendidas)
  const maxDurationSec = calls.reduce((mx, c) => Math.max(mx, c.duration_seconds ?? 0), 0);
  const durationBuckets: Record<string, number> = {
    "0-10s": 0, "10-60s": 0, "1-3min": 0, "3-5min": 0, "5min+": 0,
  };
  for (const c of calls) {
    if (classifyReason(c.ended_reason) !== "answered") continue;
    const dur = c.duration_seconds ?? 0;
    if (dur < 10)       durationBuckets["0-10s"]++;
    else if (dur < 60)  durationBuckets["10-60s"]++;
    else if (dur < 180) durationBuckets["1-3min"]++;
    else if (dur < 300) durationBuckets["3-5min"]++;
    else                durationBuckets["5min+"]++;
  }

  // Engajamento — só chamadas atendidas, classificadas por duração
  const engagement = { under10s: 0, tenTo60s: 0, over60s: 0 };
  for (const c of calls) {
    if (classifyReason(c.ended_reason) !== "answered") continue;
    const dur = c.duration_seconds ?? 0;
    if (dur < 10)       engagement.under10s++;
    else if (dur <= 60) engagement.tenTo60s++;
    else                engagement.over60s++;
  }
  const engagementRate =
    answeredCalls > 0 ? Math.round((engagement.over60s / answeredCalls) * 100) : 0;

  // Buscar timezone do tenant para heatmap e volume por hora no fuso local
  const { data: tenantInfo } = await service.from("tenants").select("timezone").eq("id", tenantId).single();
  const tz = tenantInfo?.timezone ?? "America/Sao_Paulo";
  const hFmtTz = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false });
  const wdFmtTz = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const WD_TZ: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };

  // Distribuição por hora: volume + taxa de atendimento
  const byHour:         Record<number, number> = {};
  const byHourAnswered: Record<number, number> = {};
  for (let h = 0; h < 24; h++) { byHour[h] = 0; byHourAnswered[h] = 0; }

  const byWeekday: Record<number, number> = {};
  for (let d = 1; d <= 7; d++) byWeekday[d] = 0;

  // Heatmap dia × hora
  const byDayHour:         Record<number, Record<number, number>> = {};
  const byDayHourAnswered: Record<number, Record<number, number>> = {};
  for (let d = 1; d <= 7; d++) {
    byDayHour[d] = {};
    byDayHourAnswered[d] = {};
    for (let h = 0; h < 24; h++) { byDayHour[d][h] = 0; byDayHourAnswered[d][h] = 0; }
  }

  for (const c of calls) {
    const dt     = new Date(c.created_at);
    const h      = parseInt(hFmtTz.format(dt));
    byHour[h]++;
    if (classifyReason(c.ended_reason) === "answered") byHourAnswered[h]++;

    const isoDay = WD_TZ[wdFmtTz.format(dt)] ?? 1;
    byWeekday[isoDay]++;
    byDayHour[isoDay][h]++;
    if (classifyReason(c.ended_reason) === "answered") byDayHourAnswered[isoDay][h]++;
  }

  const byHourAnswerRate: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    byHourAnswerRate[h] =
      byHour[h] > 0 ? Math.round((byHourAnswered[h] / byHour[h]) * 100) : 0;
  }

  return NextResponse.json({
    userRole,
    days,
    since,
    campaigns,
    assistants: assistantsList,
    selectedQueueId: queueId,
    selectedAssistantId: assistantId,

    totalCalls,
    totalLeads:      totalLeads ?? 0,
    totalCost,
    totalDurationSec,
    totalDurationAnsweredSec,
    avgDurationSec,
    avgDurationAllSec,
    maxDurationSec,
    durationBuckets,

    answeredCalls,
    notAnsweredCalls,
    statusBreakdown,
    endedReasonRaw, // diagnóstico — remover depois se quiser

    structuredWithOutput,
    structuredSuccessCalls,
    structuredOutputsConfigured,
    costPerConversion,

    successField: contextSuccessField,
    successValue: contextSuccessValue,

    engagement,
    engagementRate,

    byHour,
    byHourAnswerRate,
    byWeekday,
    byDayHour,
    byDayHourAnswered,

    leadsHealth: {
      remaining:     leadsRemaining,
      failed:        leadsFailed,
      neverAnswered: leadsNeverAnswered,
    },

    timezone: tz,
  });
}
