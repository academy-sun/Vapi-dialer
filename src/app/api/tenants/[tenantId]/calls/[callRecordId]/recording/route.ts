import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveVapiKey } from "@/app/api/tenants/[tenantId]/vapi-connection/route";

type Params = { params: Promise<{ tenantId: string; callRecordId: string }> };

const VAPI_BASE_URL = process.env.VAPI_BASE_URL ?? "https://api.vapi.ai";

// GET /api/tenants/:tenantId/calls/:callRecordId/recording?type=mono|stereo
// Proxy autenticado: busca a URL assinada temporária da Vapi e retorna ao frontend.
// Necessário a partir de 15/Jul/2026 — Vapi exige Bearer token para download de gravações.
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId, callRecordId } = await params;

  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const type = req.nextUrl.searchParams.get("type") ?? "mono";
  const validTypes = ["mono", "stereo", "customer", "assistant", "video"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Tipo inválido. Use: mono, stereo, customer, assistant, video" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: callRow, error } = await service
    .from("call_records")
    .select("vapi_call_id")
    .eq("id", callRecordId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !callRow) {
    return NextResponse.json({ error: "Chamada não encontrada" }, { status: 404 });
  }

  const vapiKey = await getActiveVapiKey(tenantId);
  if (!vapiKey) {
    return NextResponse.json({ error: "Conexão Vapi não configurada para este tenant" }, { status: 503 });
  }

  const vapiUrl = `${VAPI_BASE_URL}/call/${callRow.vapi_call_id}/${type}-recording`;

  try {
    const res = await fetch(vapiUrl, {
      headers: { Authorization: `Bearer ${vapiKey}` },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(
        `[recording-proxy] ✗ Vapi HTTP ${res.status} | call=${callRow.vapi_call_id} | type=${type}`
      );
      return NextResponse.json(
        { error: `Vapi retornou HTTP ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    // Após seguir o redirect, a URL final é a signed URL temporária
    return NextResponse.json({ url: res.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[recording-proxy] ✗ Falha de rede | call=${callRow.vapi_call_id} | erro=${msg}`);
    return NextResponse.json({ error: "Falha ao obter gravação" }, { status: 502 });
  }
}
