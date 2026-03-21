import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// ─── Classificação de ended_reason ───────────────────────────────────────────
const ANSWERED_REASONS  = new Set(["customer-ended-call", "assistant-ended-call"]);
const VOICEMAIL_REASONS = new Set(["voicemail", "machine_end_silence", "machine_end_other"]);
const BUSY_REASONS      = new Set(["busy"]);
const NO_ANSWER_REASONS = new Set(["no-answer"]);
const FAILED_REASONS    = new Set(["failed", "pipeline-error", "error"]);

function classifyReason(reason: string | null): "answered" | "voicemail" | "busy" | "no-answer" | "failed" | "other" {
  if (!reason)                      return "other";
  if (ANSWERED_REASONS.has(reason)) return "answered";
  if (VOICEMAIL_REASONS.has(reason)) return "voicemail";
  if (BUSY_REASONS.has(reason))     return "busy";
  if (NO_ANSWER_REASONS.has(reason)) return "no-answer";
  if (FAILED_REASONS.has(reason))   return "failed";
  return "other";
}

// ─── Verifica se structured_output indica conversão ──────────────────────────
function isConversion(structured_outputs: unknown): boolean {
  const out = structured_outputs as Record<string, unknown> | null;
  if (!out || typeof out !== "object") return false;
  const v = out.success ?? out.sucesso ?? out.interested ?? out.interesse ?? out.converted ?? out.convertido;
  return v === true || v === "true" || v === "Sucesso" || v === "sim" || v === "yes";
}

export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  // Filtro opcional por campanha
  const { searchParams } = new URL(req.url);
  const queueId = searchParams.get("queueId") ?? null;

  const service = createServiceClient();

  // ── 1. Buscar campanhas disponíveis (para o dropdown de filtro) ──
  const { data: campaignsRaw } = await service
    .from("dial_queues")
    .select("id, name, lead_list_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const campaigns = (campaignsRaw ?? []).map((q) => ({ id: q.id, name: q.name }));

  // ── 2. Buscar call_records (com filtro de campanha se aplicável) ──
  let callQuery = service
    .from("call_records")
    .select("cost, duration_seconds, ended_reason, created_at, structured_outputs, dial_queue_id")
    .eq("tenant_id", tenantId)
    .limit(10000);

  if (queueId) callQuery = callQuery.eq("dial_queue_id", queueId);

  const { data: callData, error: callError } = await callQuery;
  if (callError) return NextResponse.json({ error: callError.message }, { status: 500 });

  // ── 3. Buscar leads (com filtro de lead_list se campanha selecionada) ──
  const selectedQueue = queueId ? (campaignsRaw ?? []).find((q) => q.id === queueId) : null;
  const leadListId    = selectedQueue?.lead_list_id ?? null;

  let leadsQuery = service
    .from("leads")
    .select("id, status, attempt_count, last_outcome", { count: "exact" })
    .eq("tenant_id", tenantId);
  if (leadListId) leadsQuery = leadsQuery.eq("lead_list_id", leadListId);

  const { data: leadsRaw, count: totalLeads } = await leadsQuery;
  const leads = leadsRaw ?? [];

  // ────────────────────────────────────────────────────────────────────────────
  // AGREGAÇÕES
  // ────────────────────────────────────────────────────────────────────────────
  const calls = callData ?? [];

  // ── Métricas base ──
  const totalCalls       = calls.length;
  const totalCost        = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalDurationSec = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);

  // ── Breakdown por status ──
  const statusBreakdown = { answered: 0, voicemail: 0, busy: 0, "no-answer": 0, failed: 0, other: 0 };
  for (const c of calls) {
    statusBreakdown[classifyReason(c.ended_reason)]++;
  }

  const answeredCalls    = statusBreakdown.answered;
  const notAnsweredCalls = statusBreakdown["no-answer"];

  // ── Structured outputs ──
  const structuredWithOutput   = calls.filter((c) => c.structured_outputs != null).length;
  const structuredSuccessCalls = calls.filter((c) => isConversion(c.structured_outputs)).length;
  const structuredOutputsConfigured = structuredWithOutput > 0; // false = agente não configurado

  // ── ROI: custo por conversão ──
  // null = structured outputs não configurados (não mostrar valor quebrado)
  // Infinity guard: se 0 conversões mas structured está configurado → "sem conversões"
  const costPerConversion: number | null = !structuredOutputsConfigured
    ? null
    : structuredSuccessCalls > 0
      ? totalCost / structuredSuccessCalls
      : null; // configurado mas 0 conversões → null com flag separada

  // ── Duração média só de chamadas atendidas ──
  const answeredWithDuration = calls.filter(
    (c) => classifyReason(c.ended_reason) === "answered" && c.duration_seconds != null
  );
  const avgDurationSec = answeredWithDuration.length > 0
    ? answeredWithDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / answeredWithDuration.length
    : 0;

  // ── Duração média geral (chamadas com duração, mantido para compatibilidade) ──
  const callsWithDuration = calls.filter((c) => c.duration_seconds != null);
  const avgDurationAllSec = callsWithDuration.length > 0
    ? callsWithDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / callsWithDuration.length
    : 0;

  // ── Engajamento: só chamadas atendidas classificadas por duração ──
  const engagement = { under10s: 0, tenTo60s: 0, over60s: 0 };
  for (const c of calls) {
    if (classifyReason(c.ended_reason) !== "answered") continue;
    const dur = c.duration_seconds ?? 0;
    if (dur < 10)       engagement.under10s++;
    else if (dur <= 60) engagement.tenTo60s++;
    else                engagement.over60s++;
  }
  const engagementRate = answeredCalls > 0
    ? Math.round((engagement.over60s / answeredCalls) * 100)
    : 0;

  // ── Distribuição por hora: VOLUME + TAXA DE ATENDIMENTO por hora ──
  const byHour:           Record<number, number> = {};
  const byHourAnswered:   Record<number, number> = {};
  for (let h = 0; h < 24; h++) { byHour[h] = 0; byHourAnswered[h] = 0; }

  // ── Distribuição por dia da semana ──
  const byWeekday: Record<number, number> = {};
  for (let d = 1; d <= 7; d++) byWeekday[d] = 0;

  for (const c of calls) {
    const dt  = new Date(c.created_at);
    const h   = dt.getUTCHours();
    byHour[h]++;
    if (classifyReason(c.ended_reason) === "answered") byHourAnswered[h]++;

    const jsDay = dt.getUTCDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    byWeekday[isoDay]++;
  }

  // Taxa de atendimento por hora (0-100), só horas com pelo menos 1 chamada
  const byHourAnswerRate: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    byHourAnswerRate[h] = byHour[h] > 0
      ? Math.round((byHourAnswered[h] / byHour[h]) * 100)
      : 0;
  }

  // ── Saúde da lista de leads ──
  const leadsRemaining     = leads.filter((l) => ["queued", "callbackScheduled"].includes(l.status)).length;
  const leadsFailed        = leads.filter((l) => l.status === "failed").length;
  // Leads que tentaram 3+ vezes e nunca foram atendidos (status failed, sem chamada bem-sucedida)
  const leadsNeverAnswered = leads.filter(
    (l) => l.status === "failed" && (l.attempt_count ?? 0) >= 3
  ).length;

  return NextResponse.json({
    // ── Filtro ──
    campaigns,
    selectedQueueId: queueId,

    // ── Métricas base ──
    totalCalls,
    totalLeads:    totalLeads ?? 0,
    totalCost,
    totalDurationSec,
    avgDurationSec,      // só atendidas (nova definição)
    avgDurationAllSec,   // todas com duração (compatibilidade)

    // ── Atendimento ──
    answeredCalls,
    notAnsweredCalls,
    statusBreakdown,

    // ── Structured outputs / ROI ──
    structuredWithOutput,
    structuredSuccessCalls,
    structuredOutputsConfigured,
    costPerConversion,

    // ── Engajamento ──
    engagement,
    engagementRate,

    // ── Distribuição temporal ──
    byHour,
    byHourAnswerRate,
    byWeekday,

    // ── Saúde da lista ──
    leadsHealth: {
      remaining:     leadsRemaining,
      failed:        leadsFailed,
      neverAnswered: leadsNeverAnswered,
    },
  });
}
