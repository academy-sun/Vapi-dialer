import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; callRecordId: string }> };

// POST /api/tenants/:tenantId/calls/:callRecordId/resend-webhook
// Reenvia o webhook de saída de uma chamada específica.
// Acesso: somente owner/admin (incluindo admin global do sistema).
// Body opcional: { webhookUrl?: string } — sobrescreve a URL configurada na fila.
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId, callRecordId } = await params;

  const { membership, response } = await requireTenantAccess(tenantId);
  if (response) return response;
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  let body: { webhookUrl?: string } = {};
  try {
    body = (await req.json()) as { webhookUrl?: string };
  } catch {
    // Body vazio é permitido — nesse caso usa webhook_url da fila
  }
  const overrideUrl = body.webhookUrl?.trim();

  if (overrideUrl && !/^https?:\/\//i.test(overrideUrl)) {
    return NextResponse.json({ error: "URL inválida (deve começar com http:// ou https://)" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: callRow, error: callErr } = await service
    .from("call_records")
    .select(`
      id, vapi_call_id, ended_reason, cost, transcript, summary,
      duration_seconds, structured_outputs, recording_url, stereo_recording_url,
      started_at, ended_at, cost_breakdown, created_at,
      lead_id, dial_queue_id, tenant_id
    `)
    .eq("id", callRecordId)
    .eq("tenant_id", tenantId)
    .single();

  if (callErr || !callRow) {
    return NextResponse.json({ error: "Chamada não encontrada" }, { status: 404 });
  }

  const [{ data: lead }, { data: queue }] = await Promise.all([
    service
      .from("leads")
      .select("phone_e164, data_json, status, attempt_count")
      .eq("id", callRow.lead_id)
      .single(),
    service
      .from("dial_queues")
      .select("name, webhook_url, assistant_id")
      .eq("id", callRow.dial_queue_id)
      .single(),
  ]);

  const targetUrl = overrideUrl || queue?.webhook_url || null;
  if (!targetUrl) {
    return NextResponse.json(
      { error: "Nenhum webhook configurado na fila. Informe uma URL no campo abaixo." },
      { status: 400 }
    );
  }

  const customerNumber = lead?.phone_e164 ?? null;
  const customerName =
    (lead?.data_json && typeof lead.data_json === "object"
      ? ((lead.data_json as Record<string, unknown>).name as string | undefined) ??
        ((lead.data_json as Record<string, unknown>).nome as string | undefined)
      : null) ?? null;

  const payload = {
    event:           "call.completed",
    fired_at:        new Date().toISOString(),
    replay:          true,
    replayed_at:     new Date().toISOString(),
    tenant_id:       tenantId,
    queue_id:        callRow.dial_queue_id,
    queue_name:      queue?.name ?? null,
    lead_id:         callRow.lead_id,
    lead_status:     lead?.status ?? null,
    attempt_count:   lead?.attempt_count ?? 0,

    lead: {
      phone_e164: customerNumber,
      data:       lead?.data_json ?? {},
    },

    call: {
      vapi_call_id:     callRow.vapi_call_id,
      ended_reason:     callRow.ended_reason,
      started_at:       callRow.started_at,
      ended_at:         callRow.ended_at,
      duration_seconds: callRow.duration_seconds,
      duration_minutes: callRow.duration_seconds != null ? callRow.duration_seconds / 60 : null,
      timestamp:        callRow.ended_at ? new Date(callRow.ended_at).getTime() : null,
      id:               callRow.vapi_call_id,
      type:             null,
      status:           "completed",
      metadata:         null,
    },

    customer: {
      number: customerNumber,
      name:   customerName,
    },

    assistant: {
      id:   queue?.assistant_id ?? null,
      name: null,
    },

    transcript:                callRow.transcript,
    summary:                   callRow.summary,
    messages:                  [],
    messages_openai_formatted: [],

    recording_url:        callRow.recording_url,
    stereo_recording_url: callRow.stereo_recording_url,
    recording:            null,

    cost:           callRow.cost,
    cost_breakdown: callRow.cost_breakdown,
    costs:          [],

    structured_outputs: callRow.structured_outputs ?? {},
    analysis:           {
      summary:        callRow.summary,
      structuredData: callRow.structured_outputs ?? null,
    },
  };

  try {
    const res = await fetch(targetUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(15_000),
    });

    const respText = await res.text().catch(() => "");
    if (res.ok) {
      console.log(
        `[resend-webhook] ✓ HTTP ${res.status} | tenant=${tenantId} | call=${callRow.vapi_call_id} | url=${targetUrl}`
      );
      return NextResponse.json({
        ok:        true,
        status:    res.status,
        url:       targetUrl,
        override:  Boolean(overrideUrl),
      });
    }

    console.warn(
      `[resend-webhook] ✗ HTTP ${res.status} | tenant=${tenantId} | call=${callRow.vapi_call_id} | url=${targetUrl} | body=${respText.slice(0, 200)}`
    );
    return NextResponse.json(
      {
        ok:       false,
        status:   res.status,
        url:      targetUrl,
        override: Boolean(overrideUrl),
        error:    `Destino retornou HTTP ${res.status}`,
        body:     respText.slice(0, 500),
      },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[resend-webhook] ✗ Falha de rede | tenant=${tenantId} | call=${callRow.vapi_call_id} | url=${targetUrl} | erro=${msg}`
    );
    return NextResponse.json(
      { ok: false, url: targetUrl, override: Boolean(overrideUrl), error: `Falha de rede: ${msg}` },
      { status: 502 }
    );
  }
}
