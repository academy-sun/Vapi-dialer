import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();
  const { data: conn } = await service
    .from("vapi_connections")
    .select("encrypted_private_key")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: "Nenhuma Vapi API Key configurada" },
      { status: 400 }
    );
  }

  const apiKey = decrypt(conn.encrypted_private_key);

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const signal = AbortSignal.timeout(10_000);

  const [assistantsRes, phoneNumbersRes, toolsRes] = await Promise.allSettled([
    fetch("https://api.vapi.ai/assistant", { headers, signal }),
    fetch("https://api.vapi.ai/phone-number", { headers, signal }),
    fetch("https://api.vapi.ai/tool", { headers, signal }),
  ]);

  async function parseResult(result: PromiseSettledResult<Response>): Promise<unknown[]> {
    if (result.status === "rejected") return [];
    try {
      if (!result.value.ok) return [];
      const data = await result.value.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  const [rawAssistants, rawPhoneNumbers, rawTools] = await Promise.all([
    parseResult(assistantsRes),
    parseResult(phoneNumbersRes),
    parseResult(toolsRes),
  ]);

  const assistants = (rawAssistants as Array<{ id?: string; name?: string }>).map((item) => ({
    id: item.id,
    name: item.name,
  }));

  const phoneNumbers = (rawPhoneNumbers as Array<{ id?: string; name?: string; number?: string }>).map((item) => ({
    id: item.id,
    name: item.name,
    number: item.number,
  }));

  const tools = (rawTools as Array<{ id?: string; name?: string; type?: string }>).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
  }));

  return NextResponse.json({ assistants, phoneNumbers, tools });
}
