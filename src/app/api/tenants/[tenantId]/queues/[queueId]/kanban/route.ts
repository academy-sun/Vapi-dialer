import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string; queueId: string }> };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface LeadRow {
  id: string;
  phone_e164: string;
  data_json: Record<string, unknown> | null;
  status: string;
  attempt_count: number;
  last_outcome: string | null;
}

interface CallRow {
  id: string;
  lead_id: string;
  ended_reason: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface KanbanCard {
  lead_id: string;
  phone: string;
  name: string | null;
  status: string;
  attempt_count: number;
  last_call: {
    id: string;
    ended_reason: string | null;
    duration_seconds: number | null;
    success_evaluation: boolean | null;
    interesse: string | null;
    score: number | null;
  } | null;
}

interface KanbanColumn {
  index: number;          // 0 = aguardando, 1..N = tentativa
  label: string;
  total: number;
  leads: KanbanCard[];
}

function getLeadName(data: Record<string, unknown> | null): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, string>;
  return (
    d.nome_identificacao ??
    d.name ??
    d.first_name ??
    d.nome ??
    d.primeiro_nome ??
    null
  );
}

// GET /api/tenants/:tenantId/queues/:queueId/kanban
//   (sem query) → retorna todas as colunas com até DEFAULT_LIMIT leads cada
//   ?column=N&offset=100&limit=100 → retorna só a coluna N com paginação
export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId, queueId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const url = new URL(req.url);
  const columnParam = url.searchParams.get("column");
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0"));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT))));

  const service = createServiceClient();

  const { data: queue, error: queueErr } = await service
    .from("dial_queues")
    .select("id, name, lead_list_id, max_attempts")
    .eq("id", queueId)
    .eq("tenant_id", tenantId)
    .single();

  if (queueErr || !queue) {
    return NextResponse.json({ error: "Queue não encontrada" }, { status: 404 });
  }

  const maxAttempts = Math.max(1, queue.max_attempts ?? 1);
  const leadListId = queue.lead_list_id;

  // Helper: fetch leads for a given strict column bucket
  async function fetchLeadsForColumn(
    index: number,
    leadOffset: number,
    leadLimit: number
  ): Promise<{ leads: LeadRow[]; total: number }> {
    const { data, error } = await service.rpc("get_kanban_leads", {
      p_tenant_id: tenantId,
      p_lead_list_id: leadListId,
      p_column_idx: index,
      p_limit: leadLimit,
      p_offset: leadOffset
    });

    if (error) throw new Error(error.message);
    const leads = (data ?? []) as unknown as (LeadRow & { total_count: number })[];
    const total = leads.length > 0 ? Number(leads[0].total_count) : 0;
    return { leads, total };
  }

  // Helper: fetch latest call_record per lead (for this queue)
  async function fetchLastCalls(leadIds: string[]): Promise<Map<string, CallRow>> {
    if (leadIds.length === 0) return new Map();
    const { data, error } = await service
      .from("call_records")
      .select("id, lead_id, ended_reason, duration_seconds, created_at")
      .eq("tenant_id", tenantId)
      .eq("dial_queue_id", queueId)
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    const map = new Map<string, CallRow>();
    for (const row of (data ?? []) as CallRow[]) {
      if (!map.has(row.lead_id)) map.set(row.lead_id, row);
    }
    return map;
  }

  function toCards(leads: LeadRow[], callMap: Map<string, CallRow>): KanbanCard[] {
    return leads.map((l) => {
      const c = callMap.get(l.id);
      return {
        lead_id: l.id,
        phone: l.phone_e164,
        name: getLeadName(l.data_json),
        status: l.status,
        attempt_count: l.attempt_count,
        last_call: c ? {
          id: c.id,
          ended_reason: c.ended_reason,
          duration_seconds: c.duration_seconds,
          success_evaluation: null,
          interesse: null,
          score: null,
        } : null,
      };
    });
  }

  function labelForColumn(index: number): string {
    switch (index) {
      case 0: return "Novo Lead";
      case 1: return "Tentativa de Conexão";
      case 2: return "Tentativas Esgotadas";
      case 3: return "Qualificado";
      case 4: return "Desqualificado";
      default: return "?";
    }
  }

  // --- Modo expand: uma coluna específica ---
  if (columnParam !== null) {
    const colIndex = parseInt(columnParam);
    if (Number.isNaN(colIndex) || colIndex < 0 || colIndex > 4) {
      return NextResponse.json({ error: "column inválida" }, { status: 400 });
    }
    try {
      const { leads, total } = await fetchLeadsForColumn(colIndex, offset, limit);
      const callMap = await fetchLastCalls(leads.map((l) => l.id));
      const column: KanbanColumn = {
        index: colIndex,
        label: labelForColumn(colIndex),
        total,
        leads: toCards(leads, callMap),
      };
      return NextResponse.json({ maxAttempts: 5, queueName: queue.name, column });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // --- Modo inicial: todas as colunas com DEFAULT_LIMIT cada ---
  try {
    const indices = [0, 1, 2, 3, 4];
    const results = await Promise.all(
      indices.map((i) => fetchLeadsForColumn(i, 0, limit))
    );

    const allLeadIds = results.flatMap((r) => r.leads.map((l) => l.id));
    const callMap = await fetchLastCalls(allLeadIds);

    const columns: KanbanColumn[] = results.map((r, i) => ({
      index: i,
      label: labelForColumn(i),
      total: r.total,
      leads: toCards(r.leads, callMap),
    }));

    return NextResponse.json({ maxAttempts: 5, queueName: queue.name, columns });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
