import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ tenantId: string }> };

async function getApiKey(tenantId: string): Promise<string | null> {
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

// POST /api/tenants/:tenantId/vapi-assistant/test-call
// Body: { assistantId: string }
// Cria uma web call no Vapi usando a chave privada do servidor e retorna
// o webCallUrl (Daily.co) para o browser se conectar via @vapi-ai/web.
// A chave privada nunca é exposta ao cliente.
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = (await req.json()) as { assistantId?: string };
  const { assistantId } = body;
  if (!assistantId) {
    return NextResponse.json({ error: "assistantId obrigatório" }, { status: 400 });
  }

  const apiKey = await getApiKey(tenantId);
  if (!apiKey) {
    return NextResponse.json({ error: "Nenhuma Vapi key configurada" }, { status: 400 });
  }

  const vapiRes = await fetch("https://api.vapi.ai/call/web", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assistantId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!vapiRes.ok) {
    const err = await vapiRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Vapi error: ${vapiRes.status} ${err.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const call = (await vapiRes.json()) as { id: string; webCallUrl: string };
  return NextResponse.json({ callId: call.id, webCallUrl: call.webCallUrl });
}
