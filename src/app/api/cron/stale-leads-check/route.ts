import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/cron/stale-leads-check
 * Vercel Cron: roda a cada 10 minutos.
 * Detecta e resolve leads presos em "calling" apos o timeout do webhook.
 * Complementa o stale recovery do worker Railway.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const STALE_MINUTES = 15;
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

  // 1. Buscar leads presos em "calling"
  const { data: staleLeads, error } = await service
    .from("leads")
    .select("id, lead_list_id, attempt_count, last_attempt_at")
    .eq("status", "calling")
    .lt("last_attempt_at", staleThreshold)
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleLeads || staleLeads.length === 0) {
    return NextResponse.json({ ok: true, resolved: 0, failed: 0 });
  }

  // 2. Buscar max_attempts das filas envolvidas
  const listIds = [...new Set(staleLeads.map((l) => l.lead_list_id))];
  const { data: queueConfigs } = await service
    .from("dial_queues")
    .select("lead_list_id, max_attempts")
    .in("lead_list_id", listIds);

  const maxAttemptsMap = new Map<string, number>(
    (queueConfigs ?? []).map((q: { lead_list_id: string; max_attempts: number | null }) => [
      q.lead_list_id,
      q.max_attempts ?? 3,
    ])
  );

  let resolved = 0;
  let failed = 0;
  const retryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  for (const lead of staleLeads) {
    const maxAttempts = maxAttemptsMap.get(lead.lead_list_id) ?? 3;
    const attempts = (lead.attempt_count ?? 0) + 1;

    if (attempts >= maxAttempts) {
      await service
        .from("leads")
        .update({
          status: "failed",
          last_outcome: "stale-calling-reset",
          next_attempt_at: null,
          attempt_count: attempts,
        })
        .eq("id", lead.id);
      failed++;
    } else {
      await service
        .from("leads")
        .update({
          status: "queued",
          last_outcome: "stale-calling-reset",
          next_attempt_at: retryAt,
          attempt_count: attempts,
        })
        .eq("id", lead.id);
      resolved++;
    }
  }

  return NextResponse.json({
    ok: true,
    resolved,
    failed,
    total_stale: staleLeads.length,
    timestamp: new Date().toISOString(),
  });
}
