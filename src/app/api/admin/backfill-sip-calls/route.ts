import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helper";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveVapiKey } from "@/app/api/tenants/[tenantId]/vapi-connection/route";

const RATE_LIMIT_MS  = 120; // ~8 req/s — abaixo do limite do Vapi
const BATCH_LIMIT    = 300; // máx por chamada (evita timeout Vercel)

// POST /api/admin/backfill-sip-calls
// Reconecta call_records com ended_reason = sip-completed-call prematuro
// buscando os dados reais via Vapi API.
//
// Query params:
//   tenantId  — limitar a um tenant específico (opcional)
//   offset    — paginação (default 0)
//   dryRun    — "true" para preview sem gravar (default false)
export async function POST(req: NextRequest) {
  // Aceita autenticação via header x-admin-secret (para uso em Postman/scripts)
  // ou via sessão Supabase (uso normal no painel admin).
  const secret = req.headers.get("x-admin-secret");
  if (secret) {
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Secret inválido" }, { status: 401 });
    }
  } else {
    const { response } = await requireAdmin();
    if (response) return response;
  }

  const url      = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId") ?? null;
  const offset   = parseInt(url.searchParams.get("offset") ?? "0");
  const dryRun   = url.searchParams.get("dryRun") === "true";

  const service = createServiceClient();

  // ── 1. Buscar registros afetados ──────────────────────────────────────────
  let query = service
    .from("call_records")
    .select("id, vapi_call_id, tenant_id, lead_id, dial_queue_id")
    .eq("ended_reason", "call.in-progress.sip-completed-call")
    .not("vapi_call_id", "is", null)
    .order("created_at", { ascending: true })
    .range(offset, offset + BATCH_LIMIT - 1);

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data: records, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!records || records.length === 0) {
    return NextResponse.json({ message: "Nenhum registro afetado encontrado", offset, total: 0 });
  }

  // ── 2. Cache de chaves Vapi por tenant ────────────────────────────────────
  const keyCache = new Map<string, string | null>();
  async function getKey(tid: string): Promise<string | null> {
    if (keyCache.has(tid)) return keyCache.get(tid)!;
    const k = await getActiveVapiKey(tid);
    keyCache.set(tid, k);
    return k;
  }

  // ── 3. Processar cada registro ────────────────────────────────────────────
  const stats = { real: 0, ghost: 0, error: 0, skipped: 0 };
  const realCalls: { vapiCallId: string; endedReason: string; cost: number }[] = [];

  for (const record of records) {
    await sleep(RATE_LIMIT_MS);

    const apiKey = await getKey(record.tenant_id);
    if (!apiKey) { stats.skipped++; continue; }

    let callData: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`https://api.vapi.ai/call/${record.vapi_call_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal:  AbortSignal.timeout(10_000),
      });
      if (res.ok) callData = await res.json() as Record<string, unknown>;
      else { stats.error++; continue; }
    } catch {
      stats.error++;
      continue;
    }

    const realReason = callData.endedReason as string | null;

    // Ghost call confirmado — sem dados reais no Vapi
    if (!realReason || realReason === "call.in-progress.sip-completed-call") {
      stats.ghost++;
      continue;
    }

    // Chamada real — atualizar com dados do Vapi
    stats.real++;
    const artifact       = (callData.artifact as Record<string, unknown>) ?? {};
    const analysis       = (callData.analysis as Record<string, unknown>) ?? {};
    const startedAt      = callData.startedAt as string | null ?? null;
    const endedAt        = callData.endedAt   as string | null ?? null;
    let durationSeconds  = callData.durationSeconds as number | null ?? null;
    if (durationSeconds == null && startedAt && endedAt) {
      const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      if (ms > 0) durationSeconds = ms / 1000;
    }

    realCalls.push({
      vapiCallId:  record.vapi_call_id,
      endedReason: realReason,
      cost:        (callData.cost as number) ?? 0,
    });

    if (!dryRun) {
      await service
        .from("call_records")
        .update({
          ended_reason:        realReason,
          cost:                (callData.cost          as number | null) ?? null,
          cost_breakdown:      (callData.costBreakdown as Record<string, unknown> | null) ?? null,
          transcript:          (callData.transcript    as string | null) ?? null,
          summary:             (analysis.summary       as string | null) ?? null,
          duration_seconds:    durationSeconds,
          started_at:          startedAt,
          ended_at:            endedAt,
          recording_url:       ((artifact.recordingUrl ?? callData.recordingUrl) as string | null) ?? null,
          stereo_recording_url:((artifact.stereoRecordingUrl ?? callData.stereoRecordingUrl) as string | null) ?? null,
          structured_outputs:  (artifact.structuredOutputs as Record<string, unknown> | null) ?? null,
        })
        .eq("id", record.id);
    }
  }

  return NextResponse.json({
    dryRun,
    offset,
    processed:  records.length,
    nextOffset: offset + records.length,
    hasMore:    records.length === BATCH_LIMIT,
    stats,
    sample:     realCalls.slice(0, 10),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
