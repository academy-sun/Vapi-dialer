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
  const [totalRes, completedRes, failedRes, callingRes] = await Promise.all([
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId),
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId)
      .eq("status", "completed"),
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId)
      .eq("status", "failed"),
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("lead_list_id", queue.lead_list_id)
      .eq("tenant_id", tenantId)
      .eq("status", "calling"),
  ]);

  const total     = totalRes.count ?? 0;
  const completed = completedRes.count ?? 0;
  const failed    = failedRes.count ?? 0;
  const calling   = callingRes.count ?? 0;
  const done      = completed + failed;
  const pending   = Math.max(0, total - done - calling);

  return NextResponse.json({
    queueStatus: queue.status,
    total,
    done,
    calling,
    pending,
    byStatus: {
      completed,
      failed,
      calling
    },
    progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
  });
}
