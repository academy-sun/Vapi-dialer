import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/calls?queueId=&leadId=&page=&limit=
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const url = new URL(req.url);
  const queueId = url.searchParams.get("queueId");
  const leadId = url.searchParams.get("leadId");
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 2000);
  const offset = (page - 1) * limit;

  const service = createServiceClient();
  const maxDuration = url.searchParams.get("max_duration")
    ? parseInt(url.searchParams.get("max_duration")!)
    : null;
  const answeredOnly = url.searchParams.get("answered_only") === "true";

  let query = service
    .from("call_records")
    .select(
      `id, vapi_call_id, status, ended_reason, cost, summary, duration_seconds, structured_outputs, created_at,
       leads!inner(phone_e164, data_json)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (queueId) query = query.eq("dial_queue_id", queueId);
  if (leadId) query = query.eq("lead_id", leadId);
  if (answeredOnly) query = query.in("ended_reason", ["customer-ended-call", "assistant-ended-call"]);
  if (maxDuration != null) query = query.lte("duration_seconds", maxDuration);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ calls: data, total: count, page, limit });
}
