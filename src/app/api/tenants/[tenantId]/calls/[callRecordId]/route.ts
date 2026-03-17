import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; callRecordId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId, callRecordId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("call_records")
    .select(`*, leads(phone_e164, data_json, status)`)
    .eq("id", callRecordId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ call: data });
}
