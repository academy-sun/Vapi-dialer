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

// GET — fetch assistant details + structured output schemas
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const assistantId = searchParams.get("assistantId");
  if (!assistantId) return NextResponse.json({ error: "assistantId obrigatório" }, { status: 400 });

  const apiKey = await getApiKey(tenantId);
  if (!apiKey) return NextResponse.json({ error: "Nenhuma Vapi key configurada" }, { status: 400 });

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const signal = AbortSignal.timeout(10_000);

  // Fetch assistant
  const assistantRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers, signal });
  if (!assistantRes.ok) {
    const err = await assistantRes.text().catch(() => "");
    return NextResponse.json({ error: `Vapi error: ${assistantRes.status} ${err.slice(0, 200)}` }, { status: 502 });
  }
  const assistant = await assistantRes.json() as Record<string, unknown>;

  // Get structuredOutputIds from artifactPlan
  const artifactPlan = (assistant.artifactPlan ?? {}) as Record<string, unknown>;
  const structuredOutputIds: string[] = Array.isArray(artifactPlan.structuredOutputIds)
    ? (artifactPlan.structuredOutputIds as string[])
    : [];

  // Fetch each structured output schema
  const structuredOutputs: Array<{ id: string; schema: Record<string, unknown>; fields: string[] }> = [];
  for (const soId of structuredOutputIds) {
    try {
      const soRes = await fetch(`https://api.vapi.ai/structured-output/${soId}`, { headers, signal });
      if (!soRes.ok) continue;
      const so = await soRes.json() as Record<string, unknown>;
      const schema = (so.schema ?? so) as Record<string, unknown>;
      const properties = (schema.properties ?? {}) as Record<string, unknown>;
      structuredOutputs.push({
        id: soId,
        schema,
        fields: Object.keys(properties),
      });
    } catch {
      // skip failed structured output fetches
    }
  }

  // Extract voice info
  const voice = (assistant.voice ?? {}) as Record<string, unknown>;

  // Extract system prompt from model.messages
  const model = (assistant.model ?? {}) as Record<string, unknown>;
  const messages = Array.isArray(model.messages) ? (model.messages as Array<Record<string, unknown>>) : [];
  const systemMessage = messages.find((m) => m.role === "system");
  const systemPrompt = (systemMessage?.content as string) ?? "";

  return NextResponse.json({
    assistant: {
      id: assistant.id,
      name: assistant.name,
      firstMessage: assistant.firstMessage,
      systemPrompt,
      voice,
      model: {
        provider: model.provider,
        model: model.model,
      },
    },
    structuredOutputs,
    allFields: structuredOutputs.flatMap((so) => so.fields),
  });
}

// PATCH — save snapshot + update assistant on Vapi
export async function PATCH(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const body = await req.json() as {
    action?: string;
    assistantId: string;
    serverUrl?: string;
    name?: string;
    firstMessage?: string;
    systemPrompt?: string;
    voice?: Record<string, unknown>;
  };

  const { action, assistantId, serverUrl, name, firstMessage, systemPrompt, voice } = body;
  if (!assistantId) return NextResponse.json({ error: "assistantId obrigatório" }, { status: 400 });

  const apiKey = await getApiKey(tenantId);
  if (!apiKey) return NextResponse.json({ error: "Nenhuma Vapi key configurada" }, { status: 400 });

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const signal = AbortSignal.timeout(10_000);

  // ── Action: update-webhook — only patches serverUrl + serverMessages, no snapshot ──
  if (action === "update-webhook") {
    if (!serverUrl) return NextResponse.json({ error: "serverUrl obrigatório" }, { status: 400 });

    console.log(`[update-webhook] tenant=${tenantId} assistantId=${assistantId} serverUrl=${serverUrl}`);

    // Vapi API: campo "server" só aceita "url" — "messages" não é suportado no PATCH do assistente
    const patchBody = {
      server: {
        url: serverUrl,
      },
    };
    console.log(`[update-webhook] PATCH payload:`, JSON.stringify(patchBody));

    const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patchBody),
      signal,
    });

    const rawBody = await patchRes.text();
    console.log(`[update-webhook] Vapi status=${patchRes.status} body=${rawBody.slice(0, 400)}`);

    if (!patchRes.ok) {
      console.error(`[update-webhook] ✗ Failed — assistantId=${assistantId} status=${patchRes.status}`);
      return NextResponse.json(
        { error: `Vapi error ${patchRes.status}: ${rawBody.slice(0, 300)}` },
        { status: 502 }
      );
    }

    let updated: Record<string, unknown> = {};
    try { updated = JSON.parse(rawBody); } catch { /* ignore */ }
    const confirmedUrl = (updated.server as Record<string, unknown>)?.url ?? serverUrl;
    console.log(`[update-webhook] ✓ OK — assistantId=${updated.id ?? assistantId} server.url=${confirmedUrl}`);

    return NextResponse.json({ ok: true, assistantId: updated.id ?? assistantId, serverUrl: confirmedUrl });
  }

  // Fetch current state for snapshot — read body ONCE into a variable
  let currentData: Record<string, unknown> = {};
  try {
    const currentRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, { headers, signal });
    if (currentRes.ok) {
      currentData = await currentRes.json() as Record<string, unknown>;
      const service = createServiceClient();
      await service.from("assistant_snapshots").insert({
        tenant_id: tenantId,
        assistant_id: assistantId,
        snapshot_json: currentData,
      });
    }
  } catch {
    // snapshot failure is non-fatal
  }

  // Build PATCH payload
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (firstMessage !== undefined) patch.firstMessage = firstMessage;
  if (voice !== undefined) patch.voice = voice;

  if (systemPrompt !== undefined) {
    const currentModel = (currentData.model ?? {}) as Record<string, unknown>;
    const currentMessages = Array.isArray(currentModel.messages)
      ? (currentModel.messages as Array<Record<string, unknown>>)
      : [];

    const updatedMessages = currentMessages.some((m) => m.role === "system")
      ? currentMessages.map((m) => m.role === "system" ? { ...m, content: systemPrompt } : m)
      : [{ role: "system", content: systemPrompt }, ...currentMessages];

    patch.model = { ...currentModel, messages: updatedMessages };
  }

  const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
    signal,
  });

  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => "");
    return NextResponse.json({ error: `Vapi error: ${patchRes.status} ${err.slice(0, 200)}` }, { status: 502 });
  }

  const updated = await patchRes.json();
  return NextResponse.json({ ok: true, assistant: updated });
}
