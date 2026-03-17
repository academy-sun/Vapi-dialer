import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes } from "crypto";

type Params = { params: Promise<{ tenantId: string; leadListId: string }> };

// GET /api/tenants/:tenantId/lead-lists/:leadListId/webhook
// Retorna o webhook_secret atual (gerado automaticamente se não existir)
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data: list, error } = await service
    .from("lead_lists")
    .select("id, name, webhook_secret")
    .eq("id", leadListId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !list) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  return NextResponse.json({
    webhook_secret: list.webhook_secret,
    has_secret:     !!list.webhook_secret,
  });
}

// POST /api/tenants/:tenantId/lead-lists/:leadListId/webhook
// Gera (ou regenera) o webhook_secret e retorna a URL completa
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Verificar que a lista pertence ao tenant
  const { data: list } = await service
    .from("lead_lists")
    .select("id")
    .eq("id", leadListId)
    .eq("tenant_id", tenantId)
    .single();

  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  // Gerar novo secret (32 bytes hex = 64 chars)
  const secret = randomBytes(32).toString("hex");

  const { error: updateError } = await service
    .from("lead_lists")
    .update({ webhook_secret: secret })
    .eq("id", leadListId)
    .eq("tenant_id", tenantId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Construir URL base a partir da requisição
  const reqUrl = new URL(req.url);
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  const webhookUrl = `${baseUrl}/api/webhooks/leads/${tenantId}/${leadListId}`;

  return NextResponse.json({
    webhook_secret: secret,
    webhook_url:    webhookUrl,
  });
}

// DELETE /api/tenants/:tenantId/lead-lists/:leadListId/webhook
// Remove o webhook_secret (desativa autenticação)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { tenantId, leadListId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { error } = await service
    .from("lead_lists")
    .update({ webhook_secret: null })
    .eq("id", leadListId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
