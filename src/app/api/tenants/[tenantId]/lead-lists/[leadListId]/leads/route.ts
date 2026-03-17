import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

// GET /api/tenants/:tenantId/lead-lists/:leadListId/leads
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const offset = (page - 1) * limit;

  const service = createServiceClient();
  const { data, error, count } = await service
    .from("leads")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", leadListId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: data, total: count, page, limit });
}
