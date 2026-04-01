import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const queueId = searchParams.get("queueId") ?? null;
  const assistantId = searchParams.get("assistantId") ?? null;
  // Filtro de período: 7, 30, 90 ou 365 dias (padrão 90)
  const days = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? "90")));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

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

    // Se assistente não tem fila, retornar payload "vazio" (todas as métricas zeradas)
    if (filteredQueueIds.length === 0) {
      return NextResponse.json({
        data: {
          overview: { totalCalls: 0, answeredCalls: 0, answerRate: 0, totalCost: 0, avgCostPerCall: 0, structuredOutputsCount: 0, structuredOutputsRate: 0 },
          durationAnalysis: { total: 0, avg: 0, voicemailCount: 0, buckets: { "0–10s": 0, "10–30s": 0, "30–60s": 0, "1–3min": 0, "3–5min": 0, "5min+": 0 } },
          funnelAnalysis: { hasData: false, totalWithData: 0, stages: [] },
          opportunitiesCard: { techIssueCount: 0, techIssuePct: 0, avgDealValue: null, potentialValue: null, hasConfig: false },
          fieldAnalysis: { interesse: {}, nivel_engajamento: {}, resultado: {}, cargo_presumido: {} },
          correlations: { interesse: {}, nivel_engajamento: {}, resultado: {} },
          performanceScore: { avg: 0, min: 0, max: 0, count: 0, distribution: {} },
          endedReasonBreakdown: {},
        },
        campaigns,
      });
    }
  }

  // Chamar RPC no PostgreSQL (call_records_flat)
  const { data: dossie, error: rpcError } = await service.rpc("rpc_dossie_summary", {
    p_tenant_id: tenantId,
    p_queue_id: queueId,
    p_since: since,
  });

  if (rpcError) {
    console.error("RPC rpc_dossie_summary error:", rpcError);
    return NextResponse.json({ error: "Erro ao gerar dossiê analítico" }, { status: 500 });
  }

  // Enriquecer com campaign e period (campos que a página espera mas não vêm do RPC)
  const enrichedData = dossie ? {
    ...(dossie as Record<string, unknown>),
    campaign: queueId ? campaigns.find((c) => c.id === queueId) : undefined,
    period: { days, since },
  } : null;

  return NextResponse.json({ data: enrichedData, campaigns });
}
