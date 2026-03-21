import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET — lista todas as configs de assistentes do tenant
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("assistant_configs")
    .select("id, assistant_id, name, success_field, success_value, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configs: data ?? [] });
}

// PUT — upsert de uma config de assistente (cria ou atualiza)
export async function PUT(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const { assistantId, name, successField, successValue } = body;

  if (!assistantId) {
    return NextResponse.json({ error: "assistantId é obrigatório" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("assistant_configs")
    .upsert(
      {
        tenant_id:     tenantId,
        assistant_id:  assistantId,
        name:          name ?? null,
        success_field: successField ?? null,
        success_value: successValue ?? null,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "tenant_id,assistant_id" }
    )
    .select("id, assistant_id, name, success_field, success_value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

// DELETE — remove a config de um assistente
export async function DELETE(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const assistantId = searchParams.get("assistantId");
  if (!assistantId) {
    return NextResponse.json({ error: "assistantId é obrigatório" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("assistant_configs")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("assistant_id", assistantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
