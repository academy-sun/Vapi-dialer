import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

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

  // Buscar configurações e tabelas de referência
  const [{ data: vapiConn }, { data: assistantConfigsRaw }, { data: campaignsRaw }, { data: tenantInfo }] = await Promise.all([
    service.from("vapi_connections").select("success_field, success_value").eq("tenant_id", tenantId).eq("is_active", true).single(),
    service.from("assistant_configs").select("assistant_id, name, success_field, success_value").eq("tenant_id", tenantId),
    service.from("dial_queues").select("id, name, lead_list_id, assistant_id").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    service.from("tenants").select("timezone").eq("id", tenantId).single()
  ]);

  const tz = tenantInfo?.timezone ?? "America/Sao_Paulo";

  const configuredSuccessField = vapiConn?.success_field ?? null;
  const configuredSuccessValue = vapiConn?.success_value ?? null;

  const assistantConfigMap = new Map<string, { name: string | null; success_field: string | null; success_value: string | null; }>();
  for (const ac of (assistantConfigsRaw ?? [])) assistantConfigMap.set(ac.assistant_id, { name: ac.name, success_field: ac.success_field, success_value: ac.success_value });

  // Campanhas e Assistentes disponíveis (dropdowns)
  const campaigns = (campaignsRaw ?? []).map((q) => ({ id: q.id, name: q.name, assistantId: q.assistant_id }));
  
  const assistantsMap = new Map<string, string>();
  for (const q of (campaignsRaw ?? [])) {
    if (q.assistant_id && !assistantsMap.has(q.assistant_id)) {
      const cfg = assistantConfigMap.get(q.assistant_id);
      assistantsMap.set(q.assistant_id, cfg?.name ?? q.assistant_id);
    }
  }
  const assistantsList = Array.from(assistantsMap.entries()).map(([id, name]) => ({ id, name }));

  // Identificar queues do assistente selecionado
  const filteredQueueIds: string[] | null = assistantId
    ? (campaignsRaw ?? []).filter((q) => q.assistant_id === assistantId).map((q) => q.id)
    : null;

  const filterAssistantCfg = assistantId ? (assistantConfigMap.get(assistantId) ?? null) : null;
  const contextSuccessField = filterAssistantCfg?.success_field ?? configuredSuccessField;
  const contextSuccessValue = filterAssistantCfg?.success_value ?? configuredSuccessValue;

  if (filteredQueueIds && filteredQueueIds.length === 0) {
    return NextResponse.json({
      campaigns, assistants: assistantsList, selectedQueueId: queueId, selectedAssistantId: assistantId,
      totalCalls: 0, totalLeads: 0, totalCost: 0, totalDurationSec: 0, totalDurationAnsweredSec: 0,
      avgDurationSec: 0, avgDurationAllSec: 0, maxDurationSec: 0, durationBuckets: { "0-10s": 0, "10-60s": 0, "1-3min": 0, "3-5min": 0, "5min+": 0 },
      answeredCalls: 0, notAnsweredCalls: 0, statusBreakdown: { answered: 0, voicemail: 0, busy: 0, "no-answer": 0, failed: 0, other: 0, "ura-suspeita": 0 },
      structuredSuccessCalls: 0, structuredOutputsConfigured: !!contextSuccessField, costPerConversion: null, successField: contextSuccessField, successValue: contextSuccessValue,
      engagement: { under10s: 0, tenTo60s: 0, over60s: 0 }, engagementRate: 0,
      byHour: {}, byHourAnswerRate: {}, byWeekday: {}, byDayHour: {}, byDayHourAnswered: {},
      leadsHealth: { remaining: 0, failed: 0, neverAnswered: 0 }, timezone: tz,
    });
  }

  // ── 2. Chamar RPC no PostgreSQL (call_records_flat) ──
  const { data: metrics, error: rpcError } = await service.rpc("rpc_analytics_summary", {
    p_tenant_id: tenantId,
    p_queue_id: queueId,
    p_since: since,
    p_timezone: tz,
    p_queue_ids: filteredQueueIds
  });

  if (rpcError) {
    console.error("RPC rpc_analytics_summary error:", rpcError);
    return NextResponse.json({ error: "Erro ao calcular métricas analíticas" }, { status: 500 });
  }

  // ── 3. Métricas de Leads (Tabela de Leads) ──
  // Fast COUNT head requests since they touch another table and are quick
  let qLeads = service.from("leads").select("*", { head: true, count: "exact" }).eq("tenant_id", tenantId);
  if (queueId) {
    const listId = campaignsRaw?.find(q => q.id === queueId)?.lead_list_id;
    if (listId) qLeads = qLeads.eq("list_id", listId);
  } else if (filteredQueueIds) {
    const listIds = campaignsRaw?.filter(q => filteredQueueIds.includes(q.id)).map(q => q.lead_list_id).filter(Boolean);
    if (listIds && listIds.length > 0) qLeads = qLeads.in("list_id", listIds);
  }

  const [
    { count: totalLeads },
    { count: leadsRemaining },
    { count: leadsFailed },
    { count: leadsNeverAnswered }
  ] = await Promise.all([
    qLeads,
    qLeads.eq("status", "pending"),
    qLeads.eq("status", "failed"),
    qLeads.in("status", ["busy", "voicemail", "no-answer"])
  ]);

  return NextResponse.json({
    userRole,
    days,
    since,
    campaigns,
    assistants: assistantsList,
    selectedQueueId: queueId,
    selectedAssistantId: assistantId,

    totalCalls: metrics.totalCalls ?? 0,
    totalLeads: totalLeads ?? 0,
    totalCost: metrics.totalCost ?? 0,
    totalDurationSec: metrics.totalDurationSec ?? 0,
    totalDurationAnsweredSec: metrics.totalDurationAnsweredSec ?? 0,
    avgDurationSec: metrics.avgDurationSec ?? 0,
    avgDurationAllSec: metrics.avgDurationAllSec ?? 0,
    maxDurationSec: metrics.maxDurationSec ?? 0,
    durationBuckets: metrics.durationBuckets ?? {},

    answeredCalls: metrics.answeredCalls ?? 0,
    notAnsweredCalls: metrics.notAnsweredCalls ?? 0,
    statusBreakdown: metrics.statusBreakdown ?? {},
    endedReasonRaw: metrics.endedReasonRaw ?? {},

    structuredWithOutput: 0, // deprecado, mantido pro TS do frontend não chorar
    structuredSuccessCalls: metrics.conversionCalls ?? 0,
    structuredOutputsConfigured: !!contextSuccessField,
    costPerConversion: metrics.costPerConversion ?? null,

    successField: contextSuccessField,
    successValue: contextSuccessValue,

    engagement: metrics.engagement ?? {},
    engagementRate: metrics.engagementRate ?? 0,

    byHour: metrics.byHour ?? {},
    byHourAnswerRate: metrics.byHourAnswerRate ?? {},
    byWeekday: metrics.byWeekday ?? {},
    byDayHour: metrics.byDayHour ?? {},
    byDayHourAnswered: metrics.byDayHourAnswered ?? {},

    leadsHealth: {
      remaining:     leadsRemaining ?? 0,
      failed:        leadsFailed ?? 0,
      neverAnswered: leadsNeverAnswered ?? 0,
    },

    timezone: tz,
  });
}
