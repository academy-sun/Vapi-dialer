import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

// PATCH /api/tenants/:tenantId/lead-lists/:leadListId
// Body: { name: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("lead_lists")
    .update({ name: name.trim() })
    .eq("id", leadListId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });

  return NextResponse.json({ leadList: data });
}

// DELETE /api/tenants/:tenantId/lead-lists/:leadListId
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { error } = await service
    .from("lead_lists")
    .delete()
    .eq("id", leadListId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
