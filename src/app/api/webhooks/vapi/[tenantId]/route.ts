import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseCallbackTime } from "@/lib/callback-parser";

// ── Jitter helpers (evita engargalamento no início da janela de horário) ───────

const _WD: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };

type TW = { start: string; end: string; timezone: string };

function _inWindow(dt: Date, days: number[], tw: TW): boolean {
  const fmt  = new Intl.DateTimeFormat("en-US", { timeZone: tw.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const p    = fmt.formatToParts(dt);
  const day  = _WD[p.find((x) => x.type === "weekday")!.value] ?? 1;
  if (!days.includes(day)) return false;
  const cur  = parseInt(p.find((x) => x.type === "hour")!.value)   * 60
             + parseInt(p.find((x) => x.type === "minute")!.value);
  const [sh, sm] = tw.start.split(":").map(Number);
  const [eh, em] = tw.end.split(":").map(Number);
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

function _nextStart(from: Date, days: number[], tw: TW): Date {
  const wdFmt   = new Intl.DateTimeFormat("en-US", { timeZone: tw.timezone, weekday: "short" });
  const dateFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: tw.timezone, dateStyle: "short" });
  const hFmt    = new Intl.DateTimeFormat("en-US", { timeZone: tw.timezone, hour: "2-digit", hour12: false });
  const mFmt    = new Intl.DateTimeFormat("en-US", { timeZone: tw.timezone, minute: "2-digit" });
  const [sh, sm] = tw.start.split(":").map(Number);
  for (let d = 1; d <= 14; d++) {
    const c   = new Date(from.getTime() + d * 86_400_000);
    const iso = _WD[wdFmt.format(c)] ?? 1;
    if (!days.includes(iso)) continue;
    const approx = new Date(`${dateFmt.format(c)}T${tw.start}:00Z`);
    const diff   = ((sh * 60 + sm) - (parseInt(hFmt.format(approx)) * 60 + parseInt(mFmt.format(approx)))) * 60_000;
    return new Date(approx.getTime() + diff);
  }
  return new Date(from.getTime() + 86_400_000);
}

function scheduleNextAttempt(base: Date, delayMin: number, days: number[] | null | undefined, tw: TW | null | undefined, jitterMin = 60, sameDayJitterMin = 10): string {
  const naive = new Date(base.getTime() + delayMin * 60_000);
  // Jitter para retentativas dentro da mesma janela (evita pile-up no mesmo minuto)
  const sameDayJitterMs = Math.floor(Math.random() * (sameDayJitterMin + 1)) * 60_000;
  if (!days || days.length === 0 || !tw?.start || !tw?.end || !tw?.timezone)
    return new Date(naive.getTime() + sameDayJitterMs).toISOString();
  if (_inWindow(naive, days, tw))
    return new Date(naive.getTime() + sameDayJitterMs).toISOString();
  // Fora da janela → próximo início com jitter maior (evita thundering herd no início do dia)
  const next     = _nextStart(naive, days, tw);
  const jitterMs = Math.floor(Math.random() * (jitterMin + 1)) * 60_000;
  return new Date(next.getTime() + jitterMs).toISOString();
}

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

  const msgType = message.type;

  // ── transcript (detecção de caixa postal / URA em tempo real) ──
  if (msgType === "transcript") {
    const transcriptText = message.transcript as string | undefined;
    const call = message.call as Record<string, unknown> | undefined;
    const controlUrl = (call?.monitor as Record<string, unknown> | undefined)?.controlUrl as string | undefined;

    if (controlUrl && transcriptText) {
      const startedAt = call?.startedAt as string | undefined;
      const elapsedSec = startedAt
        ? (Date.now() - new Date(startedAt).getTime()) / 1000
        : 0;

      if (elapsedSec <= 25) {
        const VOICEMAIL_RE = /grave (sua )?mensagem|ap[oó]s o sinal|deixe (seu|sua) recado|caixa postal|n[aã]o est[aá] dispon[ií]vel/i;
        const IVR_RE = /para falar com|disque|tecle|digite|op[cç][aã]o|ramal/i;

        if (VOICEMAIL_RE.test(transcriptText) || IVR_RE.test(transcriptText)) {
          const callId = call?.id as string | undefined;
          console.log(
            `[webhook] 📵 Caixa postal/URA detectada | call=${callId}` +
            ` | transcript="${transcriptText.slice(0, 100)}"` +
            ` | elapsed=${elapsedSec.toFixed(1)}s`
          );

          // Marcar call_record antes de encerrar — race condition improvável
          // (worker cria o record antes do dispatch), mas UPDATE é no-op se não existir
          if (callId) {
            await service
              .from("call_records")
              .update({ machine_detected: true })
              .eq("vapi_call_id", callId);
          }

          try {
            await fetch(controlUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "end-call" }),
              signal: AbortSignal.timeout(5_000),
            });
          } catch (err) {
            console.error(
              `[webhook] ✗ Falha ao encerrar call via controlUrl | call=${callId}` +
              ` | erro=${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  // ── tool-calls ──
  if (msgType === "tool-calls") {
    // Buscar timezone do tenant (necessário apenas para parse_callback_time)
    const { data: tenant } = await service
      .from("tenants")
      .select("timezone")
      .eq("id", tenantId)
      .single();
    const tz = tenant?.timezone ?? "America/Sao_Paulo";

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
    try {
      await handleEndOfCallReport(tenantId, message, service);
    } catch (err) {
      // Retornar 200 mesmo em erro interno para evitar loop de retry do Vapi.
      // O erro é logado para diagnóstico — o lead pode precisar de reconciliação manual.
      console.error(
        `[webhook] ✗ Erro ao processar end-of-call-report | tenant=${tenantId}` +
        ` | erro=${err instanceof Error ? err.message : String(err)}` +
        ` | payload=${JSON.stringify(message).slice(0, 300)}`
      );
    }
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
  if (!vapiCallId) {
    console.warn("[webhook] end-of-call-report sem vapiCallId — ignorado");
    return NextResponse.json({ ok: false, reason: "no-call-id" });
  }

  const endedReason         = (message.endedReason as string) ?? null;
  const cost                = (message.cost        as number) ?? null;
  const transcript          = (message.transcript  as string) ?? null;
  const analysis            = (message.analysis as Record<string, unknown>) ?? {};
  const summary             = (analysis.summary as string) ?? null;
  const durationSeconds     = (message.durationSeconds as number) ?? null;
  const artifact            = (message.artifact as Record<string, unknown>) ?? {};
  // structuredOutputs can come from either artifact.structuredOutputs OR analysis.structuredData
  const artifactSO          = (artifact.structuredOutputs ?? null) as Record<string, unknown> | null;
  const analysisSO          = (analysis.structuredData ?? null) as Record<string, unknown> | null;
  const structuredOutputs   = analysisSO || artifactSO;
  const recordingUrl        = (artifact.recordingUrl       ?? message.recordingUrl       ?? null) as string | null;
  const stereoRecordingUrl  = (artifact.stereoRecordingUrl ?? message.stereoRecordingUrl ?? null) as string | null;
  const startedAt           = (message.startedAt    as string) ?? null;
  const endedAt             = (message.endedAt      as string) ?? null;
  const costBreakdown       = (message.costBreakdown as Record<string, unknown>) ?? null;

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
        status:               "completed",
        ended_reason:         endedReason,
        cost,
        transcript,
        summary,
        duration_seconds:     durationSeconds,
        structured_outputs:   structuredOutputs,
        recording_url:        recordingUrl,
        stereo_recording_url: stereoRecordingUrl,
        started_at:           startedAt,
        ended_at:             endedAt,
        cost_breakdown:       costBreakdown,
      })
      .eq("vapi_call_id", vapiCallId);

    await updateLeadAfterCall(
      existing.lead_id,
      existing.dial_queue_id,
      tenantId,
      endedReason,
      durationSeconds,
      service,
      callData,
    );
    await maybeOpenCircuitBreaker(existing.dial_queue_id, tenantId, endedReason, service);
    return;
  }

  // ── Fallback: call_record não encontrado (race condition ou teste manual) ──
  const customerNumber = (call?.customer as Record<string, unknown>)?.number as string | undefined;
  if (!customerNumber) {
    console.warn(`[webhook] call ${vapiCallId} sem customerNumber — ignorado`);
    return NextResponse.json({ ok: false, reason: "no-customer-number" });
  }

  const { data: lead } = await service
    .from("leads")
    .select("id, lead_list_id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", customerNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!lead) {
    console.warn(`[webhook] lead não encontrado para ${customerNumber} (tenant ${tenantId})`);
    return NextResponse.json({ ok: false, reason: "lead-not-found" });
  }

  const { data: queue } = await service
    .from("dial_queues")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", lead.lead_list_id)
    .in("status", ["running", "paused", "stopped"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!queue) {
    console.warn(`[webhook] fila não encontrada para lead ${lead.id} (tenant ${tenantId})`);
    return NextResponse.json({ ok: false, reason: "queue-not-found" });
  }

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
    started_at:           startedAt,
    ended_at:             endedAt,
    cost_breakdown:       costBreakdown,
  });

  await updateLeadAfterCall(lead.id, queue.id, tenantId, endedReason, durationSeconds, service, callData);
  await maybeOpenCircuitBreaker(queue.id, tenantId, endedReason, service);
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
  leadId:          string,
  queueId:         string,
  tenantId:        string,
  endedReason:     string | null,
  durationSeconds: number | null,
  service:         ReturnType<typeof createServiceClient>,
  callData?:       CallData
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

  // ── Falhas de infra REAIS do Vapi (pipeline de IA, transcrição, LLM, rede Vapi) ──
  // Claramente culpa do Vapi, não do número de destino.
  // → Retry sem contar tentativa (desfaz o increment do worker).
  const isTrueVapiFault = endedReason != null && (
    endedReason.includes("error-vapifault") ||   // falha de serviço Vapi (Deepgram, LLM, etc.)
    endedReason.startsWith("pipeline-error") ||  // erro no pipeline de processamento Vapi
    endedReason.startsWith("transport-error")    // falha DTLS/WebRTC no Vapi (ex: transport-error-dtls-failed)
  );

  if (isTrueVapiFault) {
    console.warn(`[webhook] ⚠ VapiFault (${endedReason}) | lead=${leadId} — retry em 3min sem contar tentativa`);
    const { data: currentLead } = await service
      .from("leads")
      .select("attempt_count")
      .eq("id", leadId)
      .single();
    const prevAttempts = Math.max(0, (currentLead?.attempt_count ?? 1) - 1);
    const retryAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    await service
      .from("leads")
      .update({
        status:          "queued",
        last_outcome:    endedReason,
        next_attempt_at: retryAt,
        attempt_count:   prevAttempts,
      })
      .eq("id", leadId);
    return;
  }

  // ── 403 Forbidden (número bloqueado, SPAM, ou não autorizado pelo provedor) ──
  // Erro permanente: tentar novamente não resolve — o provedor recusa a chamada.
  // → Marcar como doNotCall para não desperdiçar recursos.
  const isForbidden = endedReason != null && (
    endedReason.includes("sip-403") ||
    /^403$/.test(endedReason)
  );

  if (isForbidden) {
    console.warn(
      `[webhook] ⛔ 403 Forbidden (${endedReason}) | lead=${leadId}` +
      ` — número bloqueado/proibido pelo provedor → doNotCall permanente`
    );
    await service
      .from("leads")
      .update({ status: "doNotCall", last_outcome: endedReason, next_attempt_at: null })
      .eq("id", leadId);
    await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "doNotCall", service, callData);
    return;
  }

  // ── 480 Temporarily Unavailable (desligado, sem sinal, fora de área) ──
  // Erro transitório de longa duração: o número ficará inacessível por horas.
  // Retry de 3 min é ineficaz — usa retry_delay_minutes da fila (mínimo 30 min).
  const isTemporarilyUnavailable = endedReason != null && (
    endedReason.includes("sip-480") ||
    /^480$/.test(endedReason)
  );

  if (isTemporarilyUnavailable) {
    const { data: currentLead } = await service
      .from("leads")
      .select("attempt_count")
      .eq("id", leadId)
      .single();
    const { data: queueFor480 } = await service
      .from("dial_queues")
      .select("max_attempts, retry_delay_minutes, allowed_days, allowed_time_window")
      .eq("id", queueId)
      .eq("tenant_id", tenantId)
      .single();
    const attempts    = currentLead?.attempt_count ?? 0;
    const maxAttempts = (queueFor480?.max_attempts as number | null | undefined) ?? 3;

    if (attempts >= maxAttempts) {
      console.warn(
        `[webhook] ⛔ 480 Unavailable (${endedReason}) | lead=${leadId}` +
        ` — tentativas esgotadas (${attempts}/${maxAttempts}) → failed`
      );
      await service
        .from("leads")
        .update({ status: "failed", last_outcome: endedReason, next_attempt_at: null })
        .eq("id", leadId);
      await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "failed", service, callData);
    } else {
      // Usar retry_delay_minutes da fila, mas no mínimo 30 min (não 3 min)
      const configDelay = (queueFor480?.retry_delay_minutes as number | null | undefined) ?? 30;
      const delayMin    = Math.max(30, configDelay);
      const allowedDays = Array.isArray(queueFor480?.allowed_days) ? (queueFor480.allowed_days as number[]) : [];
      const tw          = queueFor480?.allowed_time_window as TW | null ?? null;
      const retryAt     = scheduleNextAttempt(new Date(), delayMin, allowedDays, tw, 30);
      console.warn(
        `[webhook] ⚠ 480 Unavailable (${endedReason}) | lead=${leadId}` +
        ` — tentativa ${attempts}/${maxAttempts} | retry em ${delayMin}min (número temporariamente fora do ar)`
      );
      await service
        .from("leads")
        .update({
          status:          "queued",
          last_outcome:    endedReason,
          next_attempt_at: retryAt,
        })
        .eq("id", leadId);
    }
    return;
  }

  // ── Erros SIP ambíguos (503/408/500 do provedor) ──
  // Podem ser: SIP provider sobrecarregado (transitório) OU número inválido/indisponível (permanente).
  // → Conta como tentativa para evitar loop infinito em números inválidos.
  // → Retry rápido (3 min) para cobrir indisponibilidade transitória.
  // → Após max_attempts: failed (igual a qualquer outro não-atendimento).
  // Nota: 403 e 480 são tratados acima com lógica própria.
  const isAmbiguousSip = endedReason != null && (
    (endedReason.includes("error-providerfault") && !endedReason.includes("sip-403") && !endedReason.includes("sip-480")) ||
    endedReason.includes("error-sip-outbound") ||   // failed-to-connect e variantes
    endedReason.includes("sip-503") ||
    endedReason.includes("sip-408") ||
    endedReason.includes("sip-500") ||
    endedReason.includes("sip-502") ||
    endedReason.includes("sip-504") ||
    /^(503|408|500|502|504)$/.test(endedReason)
  );

  if (isAmbiguousSip) {
    const { data: currentLead } = await service
      .from("leads")
      .select("attempt_count")
      .eq("id", leadId)
      .single();
    const { data: queueForSip } = await service
      .from("dial_queues")
      .select("max_attempts")
      .eq("id", queueId)
      .eq("tenant_id", tenantId)
      .single();
    const attempts    = currentLead?.attempt_count ?? 0;
    const maxAttempts = (queueForSip?.max_attempts as number | null | undefined) ?? 3;

    if (attempts >= maxAttempts) {
      console.warn(
        `[webhook] ⛔ SIP ambíguo (${endedReason}) | lead=${leadId}` +
        ` — tentativas esgotadas (${attempts}/${maxAttempts}) → failed` +
        ` (número possivelmente inválido/indisponível)`
      );
      await service
        .from("leads")
        .update({ status: "failed", last_outcome: endedReason, next_attempt_at: null })
        .eq("id", leadId);
      await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "failed", service, callData);
    } else {
      const jitterMs = Math.floor(Math.random() * 13) * 60_000; // 0–12 min aleatório
      const retryAt  = new Date(Date.now() + 3 * 60_000 + jitterMs).toISOString();
      const retryMin = Math.round((3 * 60_000 + jitterMs) / 60_000);
      console.warn(
        `[webhook] ⚠ SIP ambíguo (${endedReason}) | lead=${leadId}` +
        ` — tentativa ${attempts}/${maxAttempts} | retry em ${retryMin}min (3+${Math.round(jitterMs/60_000)} jitter)`
      );
      // NÃO alterar attempt_count — manter o incremento feito pelo worker
      await service
        .from("leads")
        .update({
          status:          "queued",
          last_outcome:    endedReason,
          next_attempt_at: retryAt,
        })
        .eq("id", leadId);
    }
    return;
  }

  // Razões que CONFIRMAM que a chamada foi realmente atendida.
  // Apenas estas devem marcar o lead como "concluído".
  // Qualquer outra razão (inclusive desconhecidas) cai no fluxo de não-atendido
  // para respeitar max_attempts e nunca marcar como concluído por engano.
  const ANSWERED_REASONS = new Set([
    "customer-ended-call",     // cliente desligou normalmente
    "assistant-ended-call",    // assistente encerrou intencionalmente
    "exceeded-max-duration",   // ligação chegou ao limite de tempo (estava em curso)
  ]);

  // silence-timed-out com duração >= 1s = chamada foi atendida (gerou custo real).
  // O cliente atendeu mas ficou em silêncio ou caiu. Tratamos como concluído para não
  // gerar retry indesejado. Duração 0 (sem conexão real) continua no fluxo de retry.
  const silenceButAnswered =
    endedReason === "silence-timed-out" &&
    durationSeconds != null &&
    durationSeconds >= 1;

  // assistant-ended-call com duração curta = caixa postal/URA detectada por nós via transcript
  // e encerrada via controlUrl. O Vapi retorna "assistant-ended-call" nesse caso, mas
  // NÃO é uma conversa real — deve voltar para retry como qualquer não-atendimento.
  const voicemailDetectedByUs =
    endedReason === "assistant-ended-call" &&
    durationSeconds != null &&
    durationSeconds < 25;

  const isAnswered = endedReason != null && (ANSWERED_REASONS.has(endedReason) || silenceButAnswered) && !voicemailDetectedByUs;

  if (isAnswered) {
    // ── Chamada realmente atendida → concluído ──
    await service
      .from("leads")
      .update({ status: "completed", last_outcome: endedReason, next_attempt_at: null })
      .eq("id", leadId);
    await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "completed", service, callData);
  } else {
    // ── Não atendido, sem resposta, erro desconhecido, etc.
    // endedReason null também cai aqui — tratado como não-atendido.
    // Inclui razões do Vapi v1 e v2: no-answer, busy, voicemail,
    // customer-did-not-answer, customer-busy, silence-timed-out,
    // e qualquer razão nova/desconhecida que não seja atendimento confirmado.
    const { data: lead } = await service
      .from("leads")
      .select("attempt_count, last_attempt_at")
      .eq("id", leadId)
      .single();

    const { data: queueInfo } = await service
      .from("dial_queues")
      .select("max_attempts, retry_delay_minutes, allowed_days, allowed_time_window, max_daily_attempts")
      .eq("id", queueId)
      .eq("tenant_id", tenantId)
      .single();

    const attempts        = lead?.attempt_count            ?? 0;
    const maxAttempts     = queueInfo?.max_attempts        ?? 3;
    const retryDelay      = queueInfo?.retry_delay_minutes ?? 30;
    const allowedDays     = Array.isArray(queueInfo?.allowed_days) ? (queueInfo.allowed_days as number[]) : [];
    const tw              = queueInfo?.allowed_time_window as TW | null ?? null;
    const maxDailyAttempts = (queueInfo?.max_daily_attempts as number | null | undefined) ?? 0;

    if (attempts >= maxAttempts) {
      await service
        .from("leads")
        .update({ status: "failed", last_outcome: endedReason, next_attempt_at: null })
        .eq("id", leadId);
      await fireOutboundWebhook(leadId, queueId, tenantId, endedReason, "failed", service, callData);
    } else {
      // Verificar se o limite diário foi atingido (contar call_records de hoje para este lead)
      let nextAt: string;
      if (maxDailyAttempts > 0) {
        // Calcular meia-noite de hoje no timezone da fila (corrigido para UTC-)
        const tzForDay = tw?.timezone ?? "America/Sao_Paulo";
        const dfFmt  = new Intl.DateTimeFormat("sv-SE", { timeZone: tzForDay, dateStyle: "short" });
        const hFmtD  = new Intl.DateTimeFormat("en-US", { timeZone: tzForDay, hour: "2-digit", hour12: false });
        const mFmtD  = new Intl.DateTimeFormat("en-US", { timeZone: tzForDay, minute: "2-digit" });
        const approxDay = new Date(`${dfFmt.format(new Date())}T00:00:00Z`);
        const hD = parseInt(hFmtD.format(approxDay));
        const mD = parseInt(mFmtD.format(approxDay));
        let deltaDayMin = -(hD * 60 + mD);
        if (deltaDayMin < -(12 * 60)) deltaDayMin += 24 * 60;
        const todayStartForWebhook = new Date(approxDay.getTime() + deltaDayMin * 60_000).toISOString();

        const { count: todayCount } = await service
          .from("call_records")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", leadId)
          .gte("created_at", todayStartForWebhook);

        if ((todayCount ?? 0) >= maxDailyAttempts) {
          // Limite diário atingido → reagendar para amanhã (início da janela permitida)
          const days = Array.isArray(allowedDays) ? allowedDays : [];
          if (tw && days.length > 0) {
            const nextDay = _nextStart(new Date(), days, tw);
            const jitterMs = Math.floor(Math.random() * 61) * 60_000;
            nextAt = new Date(nextDay.getTime() + jitterMs).toISOString();
          } else {
            nextAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString(); // +24h fallback
          }
        } else {
          nextAt = scheduleNextAttempt(new Date(), retryDelay, allowedDays, tw);
        }
      } else {
        nextAt = scheduleNextAttempt(new Date(), retryDelay, allowedDays, tw);
      }

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
  }
}

// ── Circuit Breaker: protege contra cascata de erros SIP ─────────────────────
// Quando detectar >= THRESHOLD erros SIP para uma fila nos últimos 2 minutos,
// grava um circuit_open_until no campo last_error para que o worker pause os
// disparos automaticamente pelo período de cooldown.
const CB_THRESHOLD_COUNT  = 5;     // erros em 2 min para abrir o circuito
const CB_WINDOW_MS        = 2 * 60_000;  // janela de detecção: 2 min
const CB_COOLDOWN_MS      = 10 * 60_000; // duração do bloqueio: 10 min

async function maybeOpenCircuitBreaker(
  queueId:     string,
  tenantId:    string,
  endedReason: string | null,
  service:     ReturnType<typeof createServiceClient>
) {
  if (!endedReason) return;

  // Só monitorar erros do provedor SIP (não erros de infra Vapi ou chamadas normais)
  const isSipError =
    endedReason.includes("error-sip") ||
    endedReason.includes("error-providerfault") ||
    endedReason.includes("failed-to-connect") ||
    endedReason.includes("sip-403") ||
    endedReason.includes("sip-480") ||
    endedReason.includes("sip-503") ||
    endedReason.includes("sip-500") ||
    endedReason.includes("sip-408");

  if (!isSipError) return;

  // Contagem de erros SIP recentes para esta fila
  const windowStart = new Date(Date.now() - CB_WINDOW_MS).toISOString();
  const { count } = await service
    .from("call_records")
    .select("id", { count: "exact", head: true })
    .eq("dial_queue_id", queueId)
    .gte("created_at", windowStart)
    .or(
      "ended_reason.ilike.%error-sip%," +
      "ended_reason.ilike.%error-providerfault%," +
      "ended_reason.ilike.%failed-to-connect%," +
      "ended_reason.ilike.%sip-403%," +
      "ended_reason.ilike.%sip-480%," +
      "ended_reason.ilike.%sip-503%," +
      "ended_reason.ilike.%sip-500%"
    );

  if ((count ?? 0) < CB_THRESHOLD_COUNT) return;

  // Verificar se já há um circuit breaker ativo (evita updates redundantes)
  const { data: queueRow } = await service
    .from("dial_queues")
    .select("last_error")
    .eq("id", queueId)
    .single();

  if (queueRow?.last_error) {
    try {
      const cb = JSON.parse(queueRow.last_error) as { circuit_open_until?: string };
      if (cb.circuit_open_until && new Date(cb.circuit_open_until) > new Date()) return; // já ativo
    } catch { /* não é JSON do circuit breaker, continuar */ }
  }

  const circuitOpenUntil = new Date(Date.now() + CB_COOLDOWN_MS).toISOString();
  const lastError = JSON.stringify({
    circuit_open_until: circuitOpenUntil,
    reason:             endedReason,
    error_count:        count,
    triggered_at:       new Date().toISOString(),
  });

  await service
    .from("dial_queues")
    .update({ last_error: lastError })
    .eq("id",        queueId)
    .eq("tenant_id", tenantId);

  console.warn(
    `[webhook] ⚡ Circuit breaker ativado | fila=${queueId} | tenant=${tenantId}` +
    ` | ${count} erros SIP em 2min | bloqueado até ${circuitOpenUntil}`
  );
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
