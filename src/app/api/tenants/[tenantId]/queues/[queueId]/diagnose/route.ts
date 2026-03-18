import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

/**
 * GET /api/tenants/:tenantId/queues/:queueId/diagnose
 *
 * Diagnóstico completo de uma fila: status dos leads, janela horária,
 * últimas tentativas e possíveis bloqueios.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Buscar fila
  const { data: queue } = await service
    .from("dial_queues")
    .select("*")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (!queue) return NextResponse.json({ error: "Fila não encontrada" }, { status: 404 });

  // Contagem de leads por status
  const { data: leadStatusRows } = await service
    .from("leads")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", queue.lead_list_id);

  const byStatus: Record<string, number> = {};
  for (const row of leadStatusRows ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  // Leads prontos para discar agora (queued + next_attempt_at vencido ou null)
  const now = new Date().toISOString();
  const { count: readyCount } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", queue.lead_list_id)
    .eq("status", "queued")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`);

  // Próximo lead em espera (queued com next_attempt_at futuro)
  const { data: nextWaiting } = await service
    .from("leads")
    .select("phone_e164, next_attempt_at, attempt_count")
    .eq("tenant_id", tenantId)
    .eq("lead_list_id", queue.lead_list_id)
    .eq("status", "queued")
    .gt("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(3);

  // Verificar janela de horário atual
  const tw = queue.allowed_time_window as { start?: string; end?: string; timezone?: string } | null;
  const allowedDays = Array.isArray(queue.allowed_days) ? (queue.allowed_days as number[]) : [];

  let timeWindowStatus: "allowed" | "blocked_day" | "blocked_hour" | "no_restriction" = "no_restriction";
  let currentTimeInfo: Record<string, unknown> = {};

  if (allowedDays.length > 0 && tw?.start && tw?.end && tw?.timezone) {
    const tz = tw.timezone;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hourStr    = parts.find((p) => p.type === "hour")?.value   ?? "0";
      const minStr     = parts.find((p) => p.type === "minute")?.value ?? "0";

      const WEEKDAY_MAP: Record<string, number> = {
        Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
        Friday: 5, Saturday: 6, Sunday: 7,
      };
      const isoDay = WEEKDAY_MAP[weekdayStr] ?? 0;
      const nowMin = parseInt(hourStr) * 60 + parseInt(minStr);
      const [startH, startM] = tw.start.split(":").map(Number);
      const [endH,   endM  ] = tw.end.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const endMin   = endH   * 60 + endM;

      currentTimeInfo = {
        now_in_tz:   `${hourStr}:${minStr}`,
        weekday:      weekdayStr,
        iso_day:      isoDay,
        timezone:     tz,
        window_start: tw.start,
        window_end:   tw.end,
        allowed_days: allowedDays,
      };

      if (!allowedDays.includes(isoDay)) {
        timeWindowStatus = "blocked_day";
      } else if (nowMin < startMin || nowMin >= endMin) {
        timeWindowStatus = "blocked_hour";
      } else {
        timeWindowStatus = "allowed";
      }
    } catch {
      timeWindowStatus = "allowed"; // fallback se timezone inválido
    }
  }

  // Verificar se há chave Vapi configurada
  const { data: vapiConn } = await service
    .from("vapi_connections")
    .select("id, label, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  // Últimas chamadas da fila
  const { data: recentCalls } = await service
    .from("call_records")
    .select("id, vapi_call_id, ended_reason, status, created_at, leads(phone_e164)")
    .eq("tenant_id", tenantId)
    .eq("dial_queue_id", queueId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Resumo de problemas detectados
  const issues: string[] = [];

  if (queue.status !== "running") {
    issues.push(`Fila não está ativa (status atual: ${queue.status})`);
  }
  if (!vapiConn) {
    issues.push("Nenhuma Vapi API Key configurada — configure em Configuração Vapi");
  }
  if (timeWindowStatus === "blocked_day") {
    issues.push(`Hoje é um dia não permitido para discagem (dias permitidos: ${allowedDays.join(", ")})`);
  }
  if (timeWindowStatus === "blocked_hour") {
    issues.push(`Horário atual (${currentTimeInfo.now_in_tz}) fora da janela permitida (${tw?.start}–${tw?.end} ${tw?.timezone})`);
  }
  if ((byStatus["new"] ?? 0) > 0 && (byStatus["queued"] ?? 0) === 0) {
    issues.push(`${byStatus["new"]} leads ainda em status "new" — inicie ou reinicie a fila para colocá-los na fila`);
  }
  if ((readyCount ?? 0) === 0 && queue.status === "running") {
    if ((byStatus["queued"] ?? 0) > 0) {
      issues.push("Leads estão em fila mas com next_attempt_at no futuro — aguarde o tempo de retry");
    } else if ((byStatus["calling"] ?? 0) === 0) {
      issues.push("Nenhum lead disponível para discar — todos já foram processados ou estão aguardando retry");
    }
  }

  return NextResponse.json({
    queue: {
      id:     queue.id,
      name:   queue.name,
      status: queue.status,
      assistant_id:    queue.assistant_id,
      phone_number_id: queue.phone_number_id,
      concurrency:     queue.concurrency,
      max_attempts:    queue.max_attempts,
      retry_delay_minutes: queue.retry_delay_minutes,
    },
    vapi_key_configured: !!vapiConn,
    time_window: {
      status: timeWindowStatus,
      ...currentTimeInfo,
    },
    leads: {
      by_status:    byStatus,
      total:        Object.values(byStatus).reduce((a, b) => a + b, 0),
      ready_to_call: readyCount ?? 0,
      next_waiting:  nextWaiting ?? [],
    },
    recent_calls: recentCalls ?? [],
    issues,
    ok: issues.length === 0,
  });
}
