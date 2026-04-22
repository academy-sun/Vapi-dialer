import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/cron/analytics-refresh
 * Vercel Cron: roda a cada 5 minutos para manter call_records_flat atualizado.
 * Processa call_records sem ended_reason (pendentes de webhook) e recalcula agregados.
 */
export async function GET(req: NextRequest) {
  // Validar que a chamada vem do Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // 1. Buscar call_records que estao in-progress ha mais de 10min (webhook perdido)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleCalls, error: staleErr } = await service
    .from("call_records")
    .select("id, vapi_call_id, tenant_id")
    .eq("status", "in-progress")
    .lt("created_at", staleThreshold)
    .limit(50);

  if (staleErr) {
    return NextResponse.json({ error: staleErr.message }, { status: 500 });
  }

  let updated = 0;
  for (const call of staleCalls ?? []) {
    // Marcar como ended com motivo desconhecido (webhook nao chegou)
    await service
      .from("call_records")
      .update({
        status: "completed",
        ended_reason: "webhook-timeout",
        summary: "Webhook end-of-call-report nao recebido apos 10 minutos",
      })
      .eq("id", call.id)
      .eq("status", "in-progress"); // lock otimista
    updated++;
  }

  // 2. Refresh da view call_records_flat para registros recentes
  // (A trigger de upsert ja cobre novos registros, mas este cron garante consistencia)
  const { error: refreshErr } = await service.rpc("refresh_call_records_flat_recent", {});

  return NextResponse.json({
    ok: true,
    stale_calls_resolved: updated,
    flat_refresh: refreshErr ? refreshErr.message : "ok",
    timestamp: new Date().toISOString(),
  });
}
