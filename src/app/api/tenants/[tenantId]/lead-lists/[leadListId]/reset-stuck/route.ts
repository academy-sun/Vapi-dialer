import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

/**
 * POST /api/tenants/:tenantId/lead-lists/:leadListId/reset-stuck
 *
 * Reseta leads presos em status='calling' de volta para 'queued'.
 * Isso acontece quando o worker crasha ou o webhook do Vapi não retorna.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  const { data, error } = await service
    .from("leads")
    .update({
      status:          "queued",
      next_attempt_at: null,
    })
    .eq("tenant_id",    tenantId)
    .eq("lead_list_id", leadListId)
    .eq("status",       "calling")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reset: data?.length ?? 0 });
}
