import { NextRequest, NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth-helper";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ tenantId: string }> };

// ─── Helpers de análise ───────────────────────────────────────────────────────

/** Extrai campos escalares de um structured_output (flat ou nested Vapi v2) */
function flattenOutput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const out = raw as Record<string, unknown>;
  const flat: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(out)) {
    if (val === null || val === undefined) continue;

    if (typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      // Vapi v2: { assistantId: { name, result: { ... } } }
      const result = nested.result;
      if (result && typeof result === "object") {
        for (const [rk, rv] of Object.entries(result as Record<string, unknown>)) {
          if (rv !== null && rv !== undefined) flat[rk] = rv;
        }
      } else {
        // Nested simples — achata um nível
        for (const [nk, nv] of Object.entries(nested)) {
          if (nk !== "name" && nv !== null && nv !== undefined && typeof nv !== "object") {
            flat[nk] = nv;
          }
        }
      }
    } else {
      flat[key] = val;
    }
  }
  return flat;
}

type FieldType = "enum" | "number" | "boolean" | "text";

interface FieldAnalysis {
  key: string;
  type: FieldType;
  count: number;
  distribution?: Record<string, number>;
  avg?: number;
  min?: number;
  max?: number;
  trueCount?: number;
  falseCount?: number;
  samples?: string[];
}

function analyzeFields(rows: Record<string, unknown>[]): FieldAnalysis[] {
  const fieldValues: Record<string, unknown[]> = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined || v === "") continue;
      if (!fieldValues[k]) fieldValues[k] = [];
      fieldValues[k].push(v);
    }
  }

  const results: FieldAnalysis[] = [];

  for (const [key, values] of Object.entries(fieldValues)) {
    if (values.length === 0) continue;

    const boolCount = values.filter((v) => typeof v === "boolean").length;
    const numCount  = values.filter((v) => typeof v === "number").length;

    if (boolCount >= values.length * 0.8) {
      const trueCount  = values.filter((v) => v === true || v === 1).length;
      const falseCount = values.length - trueCount;
      results.push({ key, type: "boolean", count: values.length, trueCount, falseCount });
    } else if (numCount >= values.length * 0.8) {
      const nums = values.filter((v) => typeof v === "number") as number[];
      const avg  = nums.reduce((s, n) => s + n, 0) / nums.length;
      results.push({
        key, type: "number", count: values.length,
        avg: Math.round(avg * 10) / 10,
        min: Math.min(...nums),
        max: Math.max(...nums),
      });
    } else {
      const strings = values.map((v) => String(v).trim()).filter(Boolean);
      const unique  = new Set(strings);

      if (unique.size <= 12) {
        const distribution: Record<string, number> = {};
        for (const s of strings) distribution[s] = (distribution[s] ?? 0) + 1;
        results.push({ key, type: "enum", count: values.length, distribution });
      } else {
        const samples = Array.from(unique).slice(0, 5).map((s) => s.substring(0, 120));
        results.push({ key, type: "text", count: values.length, samples });
      }
    }
  }

  const order: FieldType[] = ["enum", "boolean", "number", "text"];
  results.sort((a, b) => {
    const oa = order.indexOf(a.type);
    const ob = order.indexOf(b.type);
    if (oa !== ob) return oa - ob;
    return b.count - a.count;
  });

  return results;
}

const VOICEMAIL_REASONS = new Set([
  "voicemail", "machine_end_silence", "machine_end_other", "silence-timed-out",
]);

const TECH_FAULT_REASONS = new Set([
  "pipeline-error", "transport-error", "error-vapifault",
]);

/** Análise de duração: separando conversas reais de caixa postal */
function analyzeDuration(calls: { duration_seconds: number | null; ended_reason: string | null }[]) {
  const answered = calls.filter((c) =>
    c.ended_reason === "customer-ended-call" || c.ended_reason === "assistant-ended-call"
  );
  const voicemailCount = calls.filter((c) =>
    c.ended_reason != null && VOICEMAIL_REASONS.has(c.ended_reason)
  ).length;

  const buckets: Record<string, number> = {
    "0–10s":  0,
    "10–30s": 0,
    "30–60s": 0,
    "1–3min": 0,
    "3–5min": 0,
    "5min+":  0,
  };
  for (const c of answered) {
    const d = c.duration_seconds ?? 0;
    if (d < 10)       buckets["0–10s"]++;
    else if (d < 30)  buckets["10–30s"]++;
    else if (d < 60)  buckets["30–60s"]++;
    else if (d < 180) buckets["1–3min"]++;
    else if (d < 300) buckets["3–5min"]++;
    else              buckets["5min+"]++;
  }
  const nums = answered.map((c) => c.duration_seconds ?? 0);
  const avg  = nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
  return { buckets, avg: Math.round(avg), total: answered.length, voicemailCount };
}

/** Correlação entre um campo e duração média */
function correlateWithDuration(
  flatRows: Record<string, unknown>[],
  durations: (number | null)[],
  fieldKey: string
): Record<string, { count: number; avgDuration: number }> {
  const groups: Record<string, { sum: number; count: number }> = {};
  for (let i = 0; i < flatRows.length; i++) {
    const val = flatRows[i][fieldKey];
    const dur = durations[i];
    if (val === null || val === undefined || dur === null) continue;
    const key = String(val).trim();
    if (!groups[key]) groups[key] = { sum: 0, count: 0 };
    groups[key].sum += dur;
    groups[key].count++;
  }
  return Object.fromEntries(
    Object.entries(groups).map(([k, v]) => [
      k,
      { count: v.count, avgDuration: Math.round(v.sum / v.count) },
    ])
  );
}

// Etapas do funil em ordem crescente de profundidade
const FUNNEL_STAGES = [
  "Abertura apenas",
  "Apresentação do produto",
  "Levantamento de objeção",
  "Negociação",
  "Agendamento/Fechamento",
] as const;

/** Funil de abandono por etapa da conversa */
function buildFunnelAnalysis(flatRows: Record<string, unknown>[]) {
  // Conta chamadas que chegaram a CADA etapa (uma call com estagio X
  // também passou pelas etapas anteriores, então é contada em todas elas)
  const reachedCount: Record<string, number> = {};
  const stoppedCount: Record<string, number> = {};

  for (const row of flatRows) {
    const stage = row["estagio_atingido"] as string | undefined;
    if (!stage || stage === "Não atendeu") continue;
    const idx = FUNNEL_STAGES.indexOf(stage as typeof FUNNEL_STAGES[number]);
    if (idx < 0) continue;
    // A call atingiu este estágio → passou por todos os anteriores também
    for (let i = 0; i <= idx; i++) {
      reachedCount[FUNNEL_STAGES[i]] = (reachedCount[FUNNEL_STAGES[i]] ?? 0) + 1;
    }
    stoppedCount[stage] = (stoppedCount[stage] ?? 0) + 1;
  }

  const topCount = reachedCount[FUNNEL_STAGES[0]] ?? 0;
  if (topCount === 0) return { stages: [], totalWithData: 0, hasData: false };

  const stages = FUNNEL_STAGES.map((label, i) => {
    const cumulative = reachedCount[label] ?? 0;
    const stopped    = stoppedCount[label] ?? 0;
    const prev       = i > 0 ? (reachedCount[FUNNEL_STAGES[i - 1]] ?? 0) : topCount;
    const dropoff    = i > 0 && prev > 0 ? Math.round(((prev - cumulative) / prev) * 100) : null;
    const pct        = topCount > 0 ? Math.round((cumulative / topCount) * 100) : 0;
    return { label, cumulative, stopped, pct, dropoff };
  });

  return { stages, totalWithData: topCount, hasData: true };
}

/** Card de oportunidades não trabalhadas por problemas técnicos */
function buildOpportunitiesCard(
  calls: { id: string; ended_reason: string | null }[],
  flatRows: Record<string, unknown>[],
  callIds: string[],
  avgDealValue: number | null
) {
  // Problemas técnicos via ended_reason (disponível em TODAS as chamadas)
  const techFaultIds = new Set(
    calls.filter((c) => c.ended_reason != null && TECH_FAULT_REASONS.has(c.ended_reason)).map((c) => c.id)
  );

  // Problemas técnicos adicionais detectados via structured_outputs (schema novo)
  for (let i = 0; i < flatRows.length; i++) {
    const qt = flatRows[i]["qualidade_tecnica"] as string | undefined;
    if (qt === "Latência percebida" || qt === "Queda abrupta") {
      techFaultIds.add(callIds[i]);
    }
  }

  const techIssueCount = techFaultIds.size;
  const techIssuePct   = calls.length > 0 ? Math.round((techIssueCount / calls.length) * 100) : 0;
  const potentialValue = avgDealValue != null && techIssueCount > 0
    ? Math.round(techIssueCount * avgDealValue)
    : null;

  return { techIssueCount, techIssuePct, avgDealValue, potentialValue, hasConfig: avgDealValue != null };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { tenantId } = await params;
  const { response } = await requireTenantAccess(tenantId);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const queueId = searchParams.get("queueId");
  const days    = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? "90")));
  const since   = new Date(Date.now() - days * 86_400_000).toISOString();

  const service = createServiceClient();

  // ── Campanhas disponíveis ──
  const { data: queuesRaw } = await service
    .from("dial_queues")
    .select("id, name, lead_list_id, assistant_id, avg_deal_value")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  const campaigns = (queuesRaw ?? []).map((q) => ({ id: q.id, name: q.name }));

  if (!queueId) {
    return NextResponse.json({ campaigns, data: null });
  }

  const campaign    = campaigns.find((c) => c.id === queueId);
  const queueConfig = queuesRaw?.find((q) => q.id === queueId);
  const avgDealValue: number | null = queueConfig?.avg_deal_value ?? null;

  // ── Call records da campanha — batch pagination (lotes de 1000) ──
  const calls: {
    id: string;
    cost: number | null;
    duration_seconds: number | null;
    ended_reason: string | null;
    created_at: string;
    structured_outputs: unknown;
  }[] = [];
  {
    const BATCH = 1000;
    let from = 0;
    while (true) {
      const { data: batch } = await service
        .from("call_records")
        .select("id, cost, duration_seconds, ended_reason, created_at, structured_outputs")
        .eq("tenant_id", tenantId)
        .eq("dial_queue_id", queueId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, from + BATCH - 1);
      if (!batch || batch.length === 0) break;
      calls.push(...batch);
      if (batch.length < BATCH) break;
      from += BATCH;
    }
  }

  const totalCalls    = calls.length;
  const totalCost     = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
  const answeredCalls = calls.filter((c) =>
    c.ended_reason === "customer-ended-call" || c.ended_reason === "assistant-ended-call"
  ).length;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

  // ── Análise de duração ──
  const durationAnalysis = analyzeDuration(calls);

  // ── Structured outputs → análise dinâmica de campos ──
  const withOutputs = calls.filter((c) => c.structured_outputs != null);
  const flatRows    = withOutputs.map((c) => flattenOutput(c.structured_outputs));
  const callIds     = withOutputs.map((c) => c.id);
  const durations   = withOutputs.map((c) => c.duration_seconds ?? null);

  const fieldAnalysis = analyzeFields(flatRows);

  // ── Funil de abandono por etapa ──
  const funnelAnalysis = buildFunnelAnalysis(flatRows);

  // ── Card de oportunidades não trabalhadas ──
  const opportunitiesCard = buildOpportunitiesCard(calls, flatRows, callIds, avgDealValue);

  // ── Correlação duração × campo (campos relevantes do novo schema + legado) ──
  const ENGAGEMENT_FIELDS = [
    "interesse",
    "nivel_engajamento",
    "resultado",
    "cargo_presumido",
    // campos legado (schema antigo)
    "nivel_de_engajamento",
    "resultado_da_ligacao",
  ];
  const correlations: Record<string, Record<string, { count: number; avgDuration: number }>> = {};
  for (const field of ENGAGEMENT_FIELDS) {
    if (flatRows.some((r) => field in r)) {
      correlations[field] = correlateWithDuration(flatRows, durations, field);
    }
  }

  // ── Ended reason breakdown ──
  const endedReasonBreakdown: Record<string, number> = {};
  for (const c of calls) {
    const r = c.ended_reason ?? "desconhecido";
    endedReasonBreakdown[r] = (endedReasonBreakdown[r] ?? 0) + 1;
  }

  return NextResponse.json({
    campaigns,
    data: {
      campaign,
      period: { days, since },
      avgDealValue,
      overview: {
        totalCalls,
        answeredCalls,
        answerRate,
        totalCost: Math.round(totalCost * 100) / 100,
        avgCostPerCall: totalCalls > 0 ? Math.round((totalCost / totalCalls) * 1000) / 1000 : 0,
        structuredOutputsCount: withOutputs.length,
        structuredOutputsRate: totalCalls > 0 ? Math.round((withOutputs.length / totalCalls) * 100) : 0,
      },
      durationAnalysis,
      funnelAnalysis,
      opportunitiesCard,
      fieldAnalysis,
      correlations,
      endedReasonBreakdown,
    },
  });
}
