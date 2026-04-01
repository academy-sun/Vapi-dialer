import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; callRecordId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId, callRecordId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const [flatRes, rawRes] = await Promise.all([
    service.from("call_records_flat").select("*").eq("id", callRecordId).eq("tenant_id", tenantId).single(),
    service.from("call_records").select("transcript, stereo_recording_url, leads(phone_e164, data_json, status, next_attempt_at)").eq("id", callRecordId).eq("tenant_id", tenantId).single()
  ]);

  if (flatRes.error || !flatRes.data) {
    return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  }

  const callDetail = {
    ...flatRes.data,
    transcript: rawRes.data?.transcript,
    stereo_recording_url: rawRes.data?.stereo_recording_url,
    leads: rawRes.data?.leads
  };

  return NextResponse.json({ call: callDetail });
}
