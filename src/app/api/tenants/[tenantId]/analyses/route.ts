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
  const limit   = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));

  const service = createServiceClient();

  let query = service
    .from("tenant_analyses")
    .select("id, queue_id, content, metadata, created_at, dial_queues(name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queueId) query = query.eq("queue_id", queueId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ analyses: data ?? [] });
}
