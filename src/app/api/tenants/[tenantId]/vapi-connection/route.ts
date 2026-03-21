import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ tenantId: string }> };

// GET — retorna metadata (sem revelar a key)
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from("vapi_connections")
    .select("id, label, is_active, created_at, updated_at, assistant_id, success_field, success_value, concurrency_limit")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (error && error.code === "PGRST116") {
    return NextResponse.json({ connection: null });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data });
}

// POST — salva ou atualiza a Vapi key (criptografada)
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const { apiKey, label = "default", assistantId, successField, successValue } = body;
  if (!apiKey) return NextResponse.json({ error: "apiKey é obrigatório" }, { status: 400 });

  const encryptedKey = encrypt(apiKey);
  const service = createServiceClient();

  // Desativar conexões anteriores
  await service
    .from("vapi_connections")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);

  const { data, error } = await service
    .from("vapi_connections")
    .insert({
      tenant_id: tenantId,
      label,
      encrypted_private_key: encryptedKey,
      is_active: true,
      assistant_id: assistantId ?? null,
      success_field: successField ?? null,
      success_value: successValue ?? null,
    })
    .select("id, label, is_active, created_at, assistant_id, success_field, success_value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data }, { status: 201 });
}

// PATCH — atualiza assistant_id, success_field, success_value sem alterar a API key
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json();
  const { assistantId, successField, successValue, concurrencyLimit } = body;

  const service = createServiceClient();
  const { error } = await service
    .from("vapi_connections")
    .update({
      assistant_id: assistantId ?? null,
      success_field: successField ?? null,
      success_value: successValue ?? null,
      ...(concurrencyLimit !== undefined && { concurrency_limit: Math.max(1, Math.min(100, Number(concurrencyLimit))) }),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Utilitário exportado para uso interno (worker/webhook)
export async function getActiveVapiKey(tenantId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("vapi_connections")
    .select("encrypted_private_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  return decrypt(data.encrypted_private_key);
}
