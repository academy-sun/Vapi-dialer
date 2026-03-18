import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Marcar leads new/queued da lista como queued
  const { data: queue } = await service
    .from("dial_queues")
    .select("lead_list_id")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Queue não encontrada" }, { status: 404 });

  // Atualizar status da queue
  const { error } = await service
    .from("dial_queues")
    .update({ status: "running" })
    .eq("id", queueId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date().toISOString();

  // Marcar leads novos como queued
  await service
    .from("leads")
    .update({ status: "queued" })
    .eq("lead_list_id", queue.lead_list_id)
    .eq("tenant_id", tenantId)
    .eq("status", "new");

  // Ao retomar de pausa, limpar next_attempt_at vencido em leads aguardando retry
  // (para que o worker os processe imediatamente no próximo ciclo, sem esperar mais)
  await service
    .from("leads")
    .update({ next_attempt_at: null })
    .eq("lead_list_id", queue.lead_list_id)
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", now);

  return NextResponse.json({ ok: true, status: "running" });
}
