import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; leadListId: string; leadId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId, leadId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { error } = await service
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", leadListId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
