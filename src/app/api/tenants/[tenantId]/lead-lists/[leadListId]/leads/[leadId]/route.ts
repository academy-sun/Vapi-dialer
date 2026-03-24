import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; leadListId: string; leadId: string }> };

// PATCH — Atualiza status do lead (ex: marcar como doNotCall para remover da campanha)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId, leadId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  let body: { status?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { status } = body;
  // Apenas status seguros: não permite pular direto para calling/completed via API pública
  const ALLOWED = ["new", "queued", "doNotCall", "callbackScheduled", "failed"];
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: `Status inválido. Permitidos: ${ALLOWED.join(", ")}` }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", leadListId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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
