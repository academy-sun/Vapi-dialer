import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

const ANSWERED_REASONS = new Set(["customer-ended-call", "assistant-ended-call"]);
const NO_ANSWER_REASONS = new Set(["no-answer", "busy", "voicemail", "machine_end_silence", "machine_end_other", "failed"]);

export async function GET(_req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const service = createServiceClient();

  // Fetch call records with required fields only
  const { data: callData, error: callError } = await service
    .from("call_records")
    .select("cost, duration_seconds, ended_reason, created_at, structured_outputs")
    .eq("tenant_id", tenantId)
    .limit(10000);

  if (callError) return NextResponse.json({ error: callError.message }, { status: 500 });

  // Fetch lead count
  const { count: totalLeads } = await service
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const calls = callData ?? [];

  // ── Aggregate metrics ──
  const totalCalls        = calls.length;
  const answeredCalls     = calls.filter((c) => ANSWERED_REASONS.has(c.ended_reason ?? "")).length;
  const notAnsweredCalls  = calls.filter((c) => NO_ANSWER_REASONS.has(c.ended_reason ?? "")).length;
  const totalCost         = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalDurationSec  = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const callsWithDuration = calls.filter((c) => c.duration_seconds != null);
  const avgDurationSec    = callsWithDuration.length > 0
    ? callsWithDuration.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / callsWithDuration.length
    : 0;

  // Structured outputs success count
  const structuredSuccessCalls = calls.filter((c) => {
    const out = c.structured_outputs as Record<string, unknown> | null;
    if (!out) return false;
    const v = out.success ?? out.sucesso ?? out.interested ?? out.interesse;
    return v === true || v === "true" || v === "Sucesso" || v === "sim";
  }).length;
  const structuredWithOutput = calls.filter((c) => c.structured_outputs != null).length;

  // ── Call distribution by hour (0–23, tenant local time is handled client-side) ──
  const byHour: Record<number, number> = {};
  for (let h = 0; h < 24; h++) byHour[h] = 0;

  // ── Call distribution by weekday (1=Mon … 7=Sun ISO) ──
  const byWeekday: Record<number, number> = {};
  for (let d = 1; d <= 7; d++) byWeekday[d] = 0;

  for (const c of calls) {
    const dt = new Date(c.created_at);
    byHour[dt.getUTCHours()] = (byHour[dt.getUTCHours()] ?? 0) + 1;
    // getDay() = 0 (Sun) … 6 (Sat) → convert to ISO weekday 1=Mon … 7=Sun
    const jsDay = dt.getUTCDay(); // 0=Sun … 6=Sat
    const isoDay = jsDay === 0 ? 7 : jsDay;
    byWeekday[isoDay] = (byWeekday[isoDay] ?? 0) + 1;
  }

  return NextResponse.json({
    totalCalls,
    answeredCalls,
    notAnsweredCalls,
    totalCost,
    totalDurationSec,
    avgDurationSec,
    totalLeads: totalLeads ?? 0,
    structuredSuccessCalls,
    structuredWithOutput,
    byHour,
    byWeekday,
  });
}
