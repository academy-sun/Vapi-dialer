import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseCallbackTime } from "@/lib/callback-parser";

type Params = { params: Promise<{ tenantId: string }> };

// POST /api/webhooks/vapi/:tenantId
// Não usa sessão — usa service role com tenantId explícito
export async function POST(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const body = await req.json();
  const { message } = body;

  if (!message) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const service = createServiceClient();

  // Buscar timezone do tenant
  const { data: tenant } = await service
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .single();
  const tz = tenant?.timezone ?? "America/Sao_Paulo";

  const msgType = message.type;

  // ── tool-calls ──
  if (msgType === "tool-calls") {
    const toolCallList: Array<{ id: string; function: { name: string; arguments: Record<string, unknown> } }> =
      message.toolCallList ?? [];

    const results: Array<{ toolCallId: string; result: unknown }> = [];

    for (const toolCall of toolCallList) {
      const { id: toolCallId, function: fn } = toolCall;
      const args = fn.arguments ?? {};

      if (fn.name === "parse_callback_time") {
        const parsed = parseCallbackTime(
          args.text as string,
          (args.timezone as string) ?? tz,
          args.nowIso as string | undefined
        );
        results.push({ toolCallId, result: parsed });
      } else if (fn.name === "schedule_callback") {
        const result = await handleScheduleCallback(
          tenantId,
          args as unknown as ScheduleCallbackArgs,
          message.call?.id,
          service
        );
        results.push({ toolCallId, result });
      } else {
        results.push({ toolCallId, result: { error: `Tool desconhecida: ${fn.name}` } });
      }
    }

    return NextResponse.json({ results });
  }

  // ── end-of-call-report ──
  if (msgType === "end-of-call-report") {
    await handleEndOfCallReport(tenantId, message, service);
    return NextResponse.json({ ok: true });
  }

  // Outros eventos ignorados silenciosamente
  return NextResponse.json({ ok: true });
}

// ── Handlers ──

interface ScheduleCallbackArgs {
  phoneE164: string;
  callbackAtIso: string;
  timezone?: string;
  reason?: string;
}

async function handleScheduleCallback(
  tenantId: string,
  args: ScheduleCallbackArgs,
  vapiCallId: string | undefined,
  service: ReturnType<typeof createServiceClient>
) {
  const { phoneE164, callbackAtIso, timezone, reason } = args;
  if (!phoneE164 || !callbackAtIso) {
    return { ok: false, error: "phoneE164 e callbackAtIso são obrigatórios" };
  }

  // Localizar lead pelo phone
  const { data: lead } = await service
    .from("leads")
    .select("id, lead_list_id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lead) return { ok: false, error: "Lead não encontrado para este telefone" };

  // Encontrar dial_queue associada ao lead_list
  const { data: queue } = await service
    .from("dial_queues")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", lead.lead_list_id)
    .in("status", ["running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!queue) return { ok: false, error: "Nenhuma queue ativa para este lead" };

  // Inserir callback_request
  await service.from("callback_requests").insert({
    tenant_id:     tenantId,
    lead_id:       lead.id,
    dial_queue_id: queue.id,
    callback_at:   callbackAtIso,
    timezone:      timezone ?? "America/Sao_Paulo",
    reason:        reason ?? null,
    source:        "assistant",
    status:        "scheduled",
    vapi_call_id:  vapiCallId ?? null,
  });

  // Atualizar lead
  await service
    .from("leads")
    .update({
      status:          "callbackScheduled",
      next_attempt_at: callbackAtIso,
      last_outcome:    "callback",
    })
    .eq("id", lead.id);

  return { ok: true, callbackAt: callbackAtIso };
}

async function handleEndOfCallReport(
  tenantId: string,
  message: Record<string, unknown>,
  service: ReturnType<typeof createServiceClient>
) {
  const call       = message.call as Record<string, unknown> | undefined;
  const vapiCallId = call?.id as string | undefined;
  if (!vapiCallId) return;

  const endedReason         = (message.endedReason as string) ?? null;
  const cost                = (message.cost        as number) ?? null;
  const transcript          = (message.transcript  as string) ?? null;
  const summary             = (message.analysis    as Record<string, unknown>)?.summary as string ?? null;
  const durationSeconds     = (message.durationSeconds as number) ?? null;
  const artifact            = (message.artifact as Record<string, unknown>) ?? {};
  const structuredOutputs   = (artifact.structuredOutputs ?? null) as Record<string, unknown> | null;
  const recordingUrl        = (artifact.recordingUrl       ?? message.recordingUrl       ?? null) as string | null;
  const stereoRecordingUrl  = (artifact.stereoRecordingUrl ?? message.stereoRecordingUrl ?? null) as string | null;

  // Dados completos para repassar ao webhook de saída
  const callData = {
    vapiCallId,
    transcript,
    summary,
    cost,
    durationSeconds,
    structuredOutputs,
    vapiMessage: message, // payload completo do Vapi
  };

  // ── Idempotência: verificar se call_record já existe ──
  const { data: existing } = await service
    .from("call_records")
    .select("id, lead_id, dial_queue_id, ended_reason")
    .eq("vapi_call_id", vapiCallId)
    .single();

  if (existing?.ended_reason) return; // Já processado com sucesso — ignorar

  if (existing) {
    // ── Caso normal: worker criou o call_record, webhook finaliza ──
    await service
      .from("call_records")
      .update({
        ended_reason:        endedReason,
        cost,
        transcript,
        summary,
        duration_seconds:    durationSeconds,
        structured_outputs:  structuredOutputs,
        recording_url:       recordingUrl,
        stereo_recording_url: stereoRecordingUrl,
      })
      .eq("vapi_call_id", vapiCallId);

    await updateLeadAfterCall(
      existing.lead_id,
      existing.dial_queue_id,
      tenantId,
      endedReason,
      service,
      callData,
    );
    return;
  }

  // ── Fallback: call_record não encontrado (race condition ou teste manual) ──
  const customerNumber = (call?.customer as Record<string, unknown>)?.number as string | undefined;
  if (!customerNumber) return;

  const { data: lead } = await service
    .from("leads")
    .select("id, lead_list_id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", customerNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lead) return;

  const { data: queue } = await service
    .from("dial_queues")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", lead.lead_list_id)
    .in("status", ["running", "paused", "stopped"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!queue) return;

  await service.from("call_records").insert({
    tenant_id:            tenantId,
    dial_queue_id:        queue.id,
    lead_id:              lead.id,
    vapi_call_id:         vapiCallId,
    status:               "completed",
    ended_reason:         endedReason,
    cost,
    transcript,
    summary,
    duration_seconds:     durationSeconds,
    structured_outputs:   structuredOutputs,
    recording_url:        recordingUrl,
    stereo_recording_url: stereoRecordingUrl,
  });

  await updateLeadAfterCall(lead.id, queue.id, tenantId, endedReason, service, callData);
}

interface CallData {
  vapiCallId?:        string;
  transcript?:        string | null;
  summary?:           string | null;
  cost?:              number | null;
  durationSeconds?:   number | null;
  structuredOutputs?: Record<string, unknown> | null;
  vapiMessage?:       Record<string, unknown>; // payload completo do end-of-call-report
}

async function updateLeadAfterCall(
  leadId:      string,
  queueId:     string,
  tenantId:    string,
  endedReason: string | null,
  service:     ReturnType<typeof createServiceClient>,
  callData?:   CallData
) {
  // Verificar se há callback scheduled futuro
  const { data: pendingCallback } = await service
    .from("callback_requests")
    .select("id, callback_at")
    .eq("lead_id", leadId)
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .gte("callback_at", new Date().toISOString())
    .order("callback_at", { ascending: true })
    .limit(1)
    .single();

  if (pendingCallback) {
    await service
      .from("leads")
      .update({ status: "callbackScheduled", last_outcome: endedReason })
      .eq("id", leadId);
    await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "callbackScheduled", service, callData);
    return;
  }

  // Erros do provedor SIP (503, 408, etc.) — re-queuar sem contar como tentativa
  const isProviderFault = endedReason
    ? endedReason.includes("error-providerfault") ||
      endedReason.includes("sip-503") ||
      endedReason.includes("sip-408") ||
      endedReason.includes("sip-500") ||
      endedReason.includes("sip-502") ||
      endedReason.includes("sip-504")
    : false;

  if (isProviderFault) {
    console.log(`[webhook] Provider fault detectado (${endedReason}) — re-queue sem contar tentativa`);
    const { data: currentLead } = await service
      .from("leads")
      .select("attempt_count")
      .eq("id", leadId)
      .single();
    const prevAttempts = Math.max(0, (currentLead?.attempt_count ?? 1) - 1);
    const retryAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // retry em 3 min
    await service
      .from("leads")
      .update({
        status:          "queued",
        last_outcome:    endedReason,
        next_attempt_at: retryAt,
        attempt_count:   prevAttempts, // desfaz o incremento do worker
      })
      .eq("id", leadId);
    // Não disparar webhook externo para provider faults — é ruído
    return;
  }

  const noAnswerReasons = ["no-answer", "busy", "voicemail", "machine_end_silence", "machine_end_other"];
  const isNoAnswer = endedReason ? noAnswerReasons.some((r) => endedReason.includes(r)) : false;

  if (isNoAnswer) {
    const { data: lead } = await service
      .from("leads")
      .select("attempt_count, last_attempt_at")
      .eq("id", leadId)
      .single();

    const { data: queueInfo } = await service
      .from("dial_queues")
      .select("max_attempts, retry_delay_minutes")
      .eq("id", queueId)
      .eq("tenant_id", tenantId)
      .single();

    const attempts    = lead?.attempt_count       ?? 0;
    const maxAttempts = queueInfo?.max_attempts   ?? 3;
    const retryDelay  = queueInfo?.retry_delay_minutes ?? 30;

    if (attempts >= maxAttempts) {
      await service
        .from("leads")
        .update({ status: "failed", last_outcome: endedReason })
        .eq("id", leadId);
      await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "failed", service, callData);
    } else {
      const nextAt = new Date(Date.now() + retryDelay * 60 * 1000).toISOString();
      await service
        .from("leads")
        .update({
          status:          "queued",
          last_outcome:    endedReason,
          next_attempt_at: nextAt,
        })
        .eq("id", leadId);
      await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "queued", service, callData);
    }
  } else {
    await service
      .from("leads")
      .update({ status: "completed", last_outcome: endedReason })
      .eq("id", leadId);
    await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "completed", service, callData);
  }
}

// ── Outbound webhook: envia resultado rico da chamada para URL externa (n8n, Zapier, etc.) ──
async function fireOutboundWebhook(
  leadId:      string,
  queueId:     string,
  tenantId:    string,
  endedReason: string | null,
  leadStatus:  string,
  service:     ReturnType<typeof createServiceClient>,
  callData?:   CallData
) {
  // Buscar webhook_url da fila
  const { data: queueInfo } = await service
    .from("dial_queues")
    .select("webhook_url, name")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queueInfo?.webhook_url) {
    console.log(`[outbound-webhook] Fila ${queueId} sem webhook_url configurada — ignorando`);
    return;
  }

  console.log(`[outbound-webhook] Disparando para ${queueInfo.webhook_url} | lead=${leadId} | status=${leadStatus}`);

  // Buscar dados do lead
  const { data: lead } = await service
    .from("leads")
    .select("phone_e164, data_json, attempt_count")
    .eq("id", leadId)
    .single();

  // ── Extrair campos ricos do payload completo do Vapi ──
  const msg      = callData?.vapiMessage ?? {};
  const artifact = (msg.artifact ?? {})   as Record<string, unknown>;
  const call     = (msg.call     ?? {})   as Record<string, unknown>;
  const customer = (msg.customer ?? call.customer ?? {}) as Record<string, unknown>;
  const assistant= (msg.assistant ?? {}) as Record<string, unknown>;

  // Recordings
  const recordingUrl       = (artifact.recordingUrl       ?? msg.recordingUrl)       as string | null ?? null;
  const stereoRecordingUrl = (artifact.stereoRecordingUrl ?? msg.stereoRecordingUrl) as string | null ?? null;
  const recording          = (artifact.recording          ?? null) as Record<string, unknown> | null;

  // Transcript
  const transcript = (artifact.transcript ?? callData?.transcript ?? msg.transcript) as string | null ?? null;

  // Messages (conversa completa)
  const messages              = (artifact.messages              ?? msg.messages              ?? []) as unknown[];
  const messagesOpenAIFormatted = (artifact.messagesOpenAIFormatted ?? []) as unknown[];

  // Analysis / structured outputs
  const structuredOutputs = (artifact.structuredOutputs ?? {}) as Record<string, unknown>;
  const analysis          = (msg.analysis ?? {}) as Record<string, unknown>;
  const summary           = (analysis.summary ?? callData?.summary ?? null) as string | null;

  // Timing & duration
  const startedAt       = (msg.startedAt       ?? null) as string | null;
  const endedAt         = (msg.endedAt         ?? null) as string | null;
  const durationSeconds = (msg.durationSeconds ?? null) as number | null;
  const durationMinutes = (msg.durationMinutes ?? null) as number | null;

  // Cost
  const cost          = (msg.cost ?? callData?.cost ?? null) as number | null;
  const costBreakdown = (msg.costBreakdown ?? null) as Record<string, unknown> | null;
  const costs         = (msg.costs ?? []) as unknown[];

  // Timestamp do payload original
  const timestamp = (msg.timestamp ?? null) as number | null;

  const payload = {
    // ── Metadados do sistema ──
    event:          "call.completed",
    fired_at:       new Date().toISOString(),
    tenant_id:      tenantId,
    queue_id:       queueId,
    queue_name:     queueInfo.name,
    lead_id:        leadId,
    lead_status:    leadStatus,
    attempt_count:  lead?.attempt_count ?? 0,

    // ── Dados do lead ──
    lead: {
      phone_e164: lead?.phone_e164 ?? null,
      data:       lead?.data_json  ?? {},
    },

    // ── Resultado da chamada ──
    call: {
      vapi_call_id:    callData?.vapiCallId ?? null,
      ended_reason:    endedReason,
      started_at:      startedAt,
      ended_at:        endedAt,
      duration_seconds: durationSeconds,
      duration_minutes: durationMinutes,
      timestamp,
      id:              call.id        ?? callData?.vapiCallId ?? null,
      type:            call.type      ?? null,
      status:          call.status    ?? null,
      metadata:        call.metadata  ?? null,
    },

    // ── Cliente ──
    customer: {
      number: customer.number ?? lead?.phone_e164 ?? null,
      name:   customer.name   ?? lead?.data_json?.name ?? null,
    },

    // ── Assistente ──
    assistant: {
      id:   (assistant.id   ?? null) as string | null,
      name: (assistant.name ?? null) as string | null,
    },

    // ── Conteúdo da chamada ──
    transcript,
    summary,
    messages,
    messages_openai_formatted: messagesOpenAIFormatted,

    // ── Gravações ──
    recording_url:        recordingUrl,
    stereo_recording_url: stereoRecordingUrl,
    recording,

    // ── Custo ──
    cost,
    cost_breakdown: costBreakdown,
    costs,

    // ── Análise estruturada (structuredOutputs do Vapi) ──
    structured_outputs: structuredOutputs,
    analysis,
  };

  try {
    const res = await fetch(queueInfo.webhook_url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(12_000), // 12s
    });

    if (res.ok) {
      console.log(`[outbound-webhook] ✓ Entregue | HTTP ${res.status} | url=${queueInfo.webhook_url}`);
    } else {
      const body = await res.text().catch(() => "");
      console.error(
        `[outbound-webhook] ✗ Destino retornou HTTP ${res.status} | url=${queueInfo.webhook_url} | body=${body.slice(0, 200)}`
      );
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[outbound-webhook] ✗ Falha de rede | url=${queueInfo.webhook_url} | erro=${msg}`);
  }
}
