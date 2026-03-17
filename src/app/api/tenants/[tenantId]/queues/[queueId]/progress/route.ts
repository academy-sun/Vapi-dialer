import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Busca queue
  const { data: queue, error: queueError } = await service
    .from("dial_queues")
    .select("lead_list_id, status, concurrency")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (queueError || !queue) {
    return NextResponse.json({ error: "Queue não encontrada" }, { status: 404 });
  }

  // Contagem por status
  const { data: counts } = await service
    .from("leads")
    .select("status")
    .eq("lead_list_id", queue.lead_list_id)
    .eq("tenant_id", tenantId);

  const summary: Record<string, number> = {};
  for (const row of counts ?? []) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  const done = (summary.completed ?? 0) + (summary.failed ?? 0) + (summary.doNotCall ?? 0);
  const calling = summary.calling ?? 0;
  const pending = (summary.new ?? 0) + (summary.queued ?? 0) + (summary.callbackScheduled ?? 0);

  return NextResponse.json({
    queueStatus: queue.status,
    total,
    done,
    calling,
    pending,
    byStatus: summary,
    progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
  });
}
