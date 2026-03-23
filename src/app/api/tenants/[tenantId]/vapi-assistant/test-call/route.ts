import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/vapi-assistant/test-call
// Retorna a chave pública Vapi para o frontend iniciar uma chamada WebRTC via @vapi-ai/web.
// A chave pública é segura para uso no browser — projetada para esse fim pela Vapi.
// A chave privada NUNCA é retornada por esta rota.
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data } = await service
    .from("vapi_connections")
    .select("encrypted_public_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!data?.encrypted_public_key) {
    return NextResponse.json(
      {
        error:
          "Chave Pública Vapi não configurada. " +
          "Acesse Configuração Vapi → Chave Pública e adicione sua pk_live_... do painel Vapi.",
      },
      { status: 404 }
    );
  }

  const publicKey = decrypt(data.encrypted_public_key);
  return NextResponse.json({ publicKey });
}
