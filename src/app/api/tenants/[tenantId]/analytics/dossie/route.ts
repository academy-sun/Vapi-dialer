import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const queueId     = searchParams.get("queueId") ?? null;
  const assistantId = searchParams.get("assistantId") ?? null;

  // Período: startDate/endDate (datas customizadas) têm prioridade sobre days
  const days      = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? "90")));
  const startDate = searchParams.get("startDate") ?? null;
  const endDate   = searchParams.get("endDate") ?? null;
  const since     = startDate ?? new Date(Date.now() - days * 86_400_000).toISOString();
  const until     = endDate ?? null;

  // Filtros de duração e motivos de término
  const minDurationRaw  = searchParams.get("minDuration");
  const maxDurationRaw  = searchParams.get("maxDuration");
  const endedReasonsRaw = searchParams.get("endedReasons");

  const minDuration  = minDurationRaw  ? parseInt(minDurationRaw,  10) : null;
  const maxDuration  = maxDurationRaw  ? parseInt(maxDurationRaw,  10) : null;
  const endedReasons = endedReasonsRaw ? endedReasonsRaw.split(",").filter(Boolean) : null;

  const service = createServiceClient();

  // Buscar todas as campanhas para o dropdown
  const { data: campaignsRaw } = await service
    .from("dial_queues")
    .select("id, name, assistant_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const campaigns = campaignsRaw?.map((c) => ({ id: c.id, name: c.name, assistantId: c.assistant_id })) || [];

  // Filtrar queues pelo assistantId (se aplicável)
  let filteredQueueIds: string[] | null = null;
  if (assistantId && !queueId) {
    const { data: queues } = await service
      .from("dial_queues")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("assistant_id", assistantId);

    filteredQueueIds = queues ? queues.map((q) => q.id) : [];

    if (filteredQueueIds.length === 0) {
      return NextResponse.json({
        data: {
          overview: { totalCalls: 0, answeredCalls: 0, answerRate: 0, totalCost: 0, avgCostPerCall: 0, structuredOutputsCount: 0, structuredOutputsRate: 0 },
          durationAnalysis: { total: 0, avg: 0, voicemailCount: 0, buckets: { "0–10s": 0, "10–30s": 0, "30–60s": 0, "1–3min": 0, "3–5min": 0, "5min+": 0 } },
          funnelAnalysis: { hasData: false, totalWithData: 0, stages: [] },
          opportunitiesCard: { techIssueCount: 0, techIssuePct: 0, avgDealValue: null, potentialValue: null, hasConfig: false },
          fieldAnalysis: [],
          correlations: {},
          endedReasonBreakdown: {},
          availableReasons: [],
        },
        campaigns,
      });
    }
  }

  // Chamar RPC no PostgreSQL
  const rpcParams: Record<string, unknown> = {
    p_tenant_id: tenantId,
    p_queue_id:  queueId,
    p_since:     since,
  };
  if (until)        rpcParams.p_until         = until;
  if (minDuration !== null) rpcParams.p_min_duration = minDuration;
  if (maxDuration !== null) rpcParams.p_max_duration = maxDuration;
  if (endedReasons) rpcParams.p_ended_reasons  = endedReasons;

  const { data: dossie, error: rpcError } = await service.rpc("rpc_dossie_summary", rpcParams);

  if (rpcError) {
    console.error("RPC rpc_dossie_summary error:", rpcError);
    return NextResponse.json({ error: "Erro ao gerar dossiê analítico" }, { status: 500 });
  }

  const enrichedData = dossie ? {
    ...(dossie as Record<string, unknown>),
    campaign: queueId ? campaigns.find((c) => c.id === queueId) : undefined,
    period: { days, since, until },
  } : null;

  // Suprimir aviso de variável não usada
  void filteredQueueIds;

  return NextResponse.json({ data: enrichedData, campaigns });
}
