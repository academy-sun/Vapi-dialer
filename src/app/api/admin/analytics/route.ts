import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helper";
import { createServiceClient } from "@/lib/supabase/service";

const ANSWERED_REASONS = new Set([
  "customer-ended-call",
  "assistant-ended-call",
  "exceeded-max-duration",
]);

// GET /api/admin/analytics?days=7|30|90
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "30")));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const service = createServiceClient();

  // ── Buscar dados em paralelo ──────────────────────────────────────────────────
  const [
    callsRes,
    tenantsRes,
    activeQueuesRes,
    activeCallsRes,
  ] = await Promise.all([
    // Chamadas no período com ended_reason e custo
    service
      .from("call_records")
      .select("id, tenant_id, ended_reason, cost, duration_seconds, created_at")
      .gte("created_at", since)
      .not("ended_reason", "is", null),

    // Total de tenants
    service
      .from("tenants")
      .select("id, name", { count: "exact" }),

    // Filas ativas agora
    service
      .from("dial_queues")
      .select("id, tenant_id", { count: "exact" })
      .eq("status", "running"),

    // Chamadas ativas agora
    service
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "calling"),
  ]);

  const calls = callsRes.data ?? [];

  // ── Cards globais ─────────────────────────────────────────────────────────────
  const totalCalls    = calls.length;
  const answeredCalls = calls.filter((c) => ANSWERED_REASONS.has(c.ended_reason ?? "")).length;
  const totalCost     = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalDuration = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const answerRate    = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  const activeTenants = new Set(calls.map((c) => c.tenant_id)).size;
  const activeQueues  = activeQueuesRes.count ?? 0;
  const activeCalls   = activeCallsRes.count ?? 0;

  // ── Chamadas por dia ──────────────────────────────────────────────────────────
  const byDay = new Map<string, { total: number; answered: number; cost: number }>();
  for (const c of calls) {
    const day = c.created_at.slice(0, 10); // "YYYY-MM-DD"
    if (!byDay.has(day)) byDay.set(day, { total: 0, answered: 0, cost: 0 });
    const d = byDay.get(day)!;
    d.total++;
    if (ANSWERED_REASONS.has(c.ended_reason ?? "")) d.answered++;
    d.cost += c.cost ?? 0;
  }
  // Preencher dias sem chamadas
  const callsByDay: Array<{ date: string; total: number; answered: number; cost: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const entry = byDay.get(date) ?? { total: 0, answered: 0, cost: 0 };
    callsByDay.push({ date, ...entry });
  }

  // ── Top tenants por volume de chamadas ─────────────────────────────────────────
  const tenantMap = new Map<string, { total: number; answered: number; cost: number }>();
  for (const c of calls) {
    if (!tenantMap.has(c.tenant_id)) tenantMap.set(c.tenant_id, { total: 0, answered: 0, cost: 0 });
    const t = tenantMap.get(c.tenant_id)!;
    t.total++;
    if (ANSWERED_REASONS.has(c.ended_reason ?? "")) t.answered++;
    t.cost += c.cost ?? 0;
  }
  const tenantNames = new Map((tenantsRes.data ?? []).map((t) => [t.id, t.name as string]));
  const topTenants = Array.from(tenantMap.entries())
    .map(([id, stats]) => ({ id, name: tenantNames.get(id) ?? id, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ── Breakdown de ended_reason ─────────────────────────────────────────────────
  const reasonMap = new Map<string, number>();
  for (const c of calls) {
    const r = c.ended_reason ?? "unknown";
    reasonMap.set(r, (reasonMap.get(r) ?? 0) + 1);
  }
  const endReasons = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return NextResponse.json({
    days,
    since,
    cards: {
      totalCalls,
      answeredCalls,
      answerRate,
      totalCost: Math.round(totalCost * 100) / 100,
      totalDurationMinutes: Math.round(totalDuration / 60),
      activeTenants,
      totalTenants: tenantsRes.count ?? 0,
      activeQueues,
      activeCalls,
    },
    callsByDay,
    topTenants,
    endReasons,
  });
}
