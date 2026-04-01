import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// GET /api/tenants/:tenantId/calls?queueId=&leadId=&sort_by=&sort_dir=&max_duration=&answered_only=&page=&page_size=
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const url = new URL(req.url);
  const queueId      = url.searchParams.get("queueId");
  const leadId       = url.searchParams.get("leadId");
  const maxDuration  = url.searchParams.get("max_duration") ? parseInt(url.searchParams.get("max_duration")!) : null;
  const answeredOnly = url.searchParams.get("answered_only") === "true";

  const ALLOWED_SORT = ["created_at", "cost", "duration_seconds"] as const;
  type SortCol = typeof ALLOWED_SORT[number];
  const sortByRaw = url.searchParams.get("sort_by") ?? "created_at";
  const sortBy: SortCol = (ALLOWED_SORT as readonly string[]).includes(sortByRaw)
    ? (sortByRaw as SortCol)
    : "created_at";
  const ascending = url.searchParams.get("sort_dir") === "asc";

  // Pagination: single request, configurable size up to 5000
  const page     = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(5000, Math.max(15, parseInt(url.searchParams.get("page_size") ?? "5000")));
  const from = (page - 1) * pageSize;

  const service = createServiceClient();

  type CallRow = {
    id: string; vapi_call_id: string; status: string | null;
    ended_reason: string | null; cost: number | null; summary: string | null;
    duration_seconds: number | null; created_at: string;
    lead_phone: string | null; lead_name: string | null;
    interesse: string | null; performance_score: number | null; success_evaluation: boolean | null;
    resumo: string | null; pontos_melhoria: string | null; objecoes: string | null;
    motivos_falha: string | null; proximo_passo: string | null; score: number | null;
    outputs_flat: Record<string, unknown> | null;
    leads: { next_attempt_at: string | null } | null;
  };

  let q = service
    .from("call_records_flat")
    .select(
      `id, vapi_call_id, status, ended_reason, cost, summary, duration_seconds, created_at,
       lead_phone, lead_name, interesse, performance_score, success_evaluation,
       resumo, pontos_melhoria, objecoes, motivos_falha, proximo_passo, score, outputs_flat,
       leads:lead_id (next_attempt_at)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order(sortBy, { ascending, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (queueId)       q = q.eq("dial_queue_id", queueId);
  if (leadId)        q = q.eq("lead_id", leadId);
  if (answeredOnly)  q = q.in("ended_reason", ["customer-ended-call", "assistant-ended-call"]);
  if (maxDuration != null) q = q.lte("duration_seconds", maxDuration);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ calls: (data ?? []) as unknown as CallRow[], total: count ?? 0 });
}
