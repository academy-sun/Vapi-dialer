// Edge Function: generate-tenant-analysis
// Usa call_records_flat para análise eficiente com filtros aplicados no SQL
// verify_jwt: false → configurado em config.toml

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Filters {
  durationMin?:  number | null;
  durationMax?:  number | null;
  // aceita array ou string única para retrocompatibilidade
  endedReasons?: string[] | null;
  endedReason?:  string | null;
  engagement?:   string | null;
  scoreMin?:     number | null;
  scoreMax?:     number | null;
  startDate?:    string | null;
  endDate?:      string | null;
}

interface FlatRow {
  ended_reason:      string | null;
  duration_seconds:  number | null;
  cost:              number | null;
  score:             number | null;
  interesse:         string | null;
  resultado:         string | null;
  estagio_atingido:  string | null;
  nivel_engajamento: string | null;
  qualidade_tecnica: string | null;
  dor_identificada:  string | null;
  objecao_principal: string | null;
  outputs_flat:      Record<string, unknown> | null;
}

function countDist(rows: FlatRow[], field: keyof FlatRow): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const r of rows) {
    const v = r[field];
    if (v == null) continue;
    const k = String(v);
    dist[k] = (dist[k] ?? 0) + 1;
  }
  return dist;
}

function avgField(rows: FlatRow[], field: keyof FlatRow): number | null {
  const nums = rows.map((r) => r[field]).filter((v) => typeof v === "number") as number[];
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length * 10) / 10;
}

function buildFilterDescription(filters: Filters): string {
  const parts: string[] = [];
  if (filters.startDate || filters.endDate) {
    const from = filters.startDate ? new Date(filters.startDate).toLocaleDateString("pt-BR") : "início";
    const to   = filters.endDate   ? new Date(filters.endDate).toLocaleDateString("pt-BR")   : "hoje";
    parts.push(`período: ${from} até ${to}`);
  }
  if (filters.durationMin != null || filters.durationMax != null) {
    const min = filters.durationMin != null ? `${filters.durationMin}s` : "0";
    const max = filters.durationMax != null ? `${filters.durationMax}s` : "sem limite";
    parts.push(`duração entre ${min} e ${max}`);
  }
  const reasons = filters.endedReasons?.length
    ? filters.endedReasons
    : filters.endedReason
    ? [filters.endedReason]
    : null;
  if (reasons?.length) parts.push(`motivos de encerramento: ${reasons.map((r) => `"${r}"`).join(", ")}`);
  if (filters.engagement) parts.push(`engajamento: "${filters.engagement}"`);
  if (filters.scoreMin != null) parts.push(`score mínimo: ${filters.scoreMin}`);
  if (filters.scoreMax != null) parts.push(`score máximo: ${filters.scoreMax}`);
  return parts.length > 0 ? parts.join(", ") : "nenhum filtro adicional (análise geral)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenantId, queueId, filters = {} }: { tenantId: string; queueId: string; filters: Filters } = body;

    if (!tenantId || !queueId) {
      return new Response(
        JSON.stringify({ error: "tenantId e queueId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Nome da campanha ──────────────────────────────────────────────────────
    const { data: queueData } = await supabase
      .from("dial_queues")
      .select("name")
      .eq("id", queueId)
      .single();

    const campaignName = queueData?.name ?? "Campanha desconhecida";

    // ── Intervalo de datas ────────────────────────────────────────────────────
    // Usa startDate/endDate dos filtros se fornecidos, senão últimos 90 dias
    const since = filters.startDate ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
    const until = filters.endDate   ?? null;

    // Período em dias para contextualizar a IA
    const sinceMs  = new Date(since).getTime();
    const untilMs  = until ? new Date(until).getTime() : Date.now();
    const periodDays = Math.round((untilMs - sinceMs) / 86_400_000);

    // ── Query na tabela flat com filtros aplicados no SQL ─────────────────────
    // Consolida endedReasons: aceita array (novo) ou string única (legado)
    const endedReasonsList: string[] = filters.endedReasons?.length
      ? filters.endedReasons
      : filters.endedReason
      ? [filters.endedReason]
      : [];

    let query = supabase
      .from("call_records_flat")
      .select([
        "ended_reason", "duration_seconds", "cost", "score",
        "interesse", "resultado", "estagio_atingido", "nivel_engajamento",
        "qualidade_tecnica", "dor_identificada", "objecao_principal", "outputs_flat",
      ].join(", "))
      .eq("tenant_id", tenantId)
      .eq("dial_queue_id", queueId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (until)                        query = query.lte("created_at", until);
    if (filters.durationMin != null)  query = query.gte("duration_seconds", filters.durationMin);
    if (filters.durationMax != null)  query = query.lte("duration_seconds", filters.durationMax);
    if (endedReasonsList.length === 1) query = query.eq("ended_reason", endedReasonsList[0]);
    if (endedReasonsList.length > 1)  query = query.in("ended_reason", endedReasonsList);
    if (filters.engagement)           query = query.eq("nivel_engajamento", filters.engagement);
    if (filters.scoreMin != null)     query = query.gte("score", filters.scoreMin);
    if (filters.scoreMax != null)     query = query.lte("score", filters.scoreMax);

    const { data: rawRows, error: queryError } = await query;

    if (queryError) throw new Error(`Erro ao consultar call_records_flat: ${queryError.message}`);

    const rows = (rawRows ?? []) as FlatRow[];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma chamada encontrada com os filtros aplicados no período selecionado." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Agregações em JS ──────────────────────────────────────────────────────
    const totalRows   = rows.length;
    const totalCost   = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
    const avgDuration = avgField(rows, "duration_seconds");
    const avgScore    = avgField(rows, "score");

    const durationBuckets: Record<string, number> = {
      "0-10s": 0, "10-30s": 0, "30-60s": 0, "1-3min": 0, "3-5min": 0, "5min+": 0,
    };
    for (const r of rows) {
      const d = r.duration_seconds ?? 0;
      if (d < 10)       durationBuckets["0-10s"]++;
      else if (d < 30)  durationBuckets["10-30s"]++;
      else if (d < 60)  durationBuckets["30-60s"]++;
      else if (d < 180) durationBuckets["1-3min"]++;
      else if (d < 300) durationBuckets["3-5min"]++;
      else              durationBuckets["5min+"]++;
    }

    const endedReasonDist = countDist(rows, "ended_reason");
    const engagementDist  = countDist(rows, "nivel_engajamento");
    const resultadoDist   = countDist(rows, "resultado");
    const estagioDist     = countDist(rows, "estagio_atingido");
    const qualidadeDist   = countDist(rows, "qualidade_tecnica");
    const dorDist         = countDist(rows, "dor_identificada");
    const objecaoDist     = countDist(rows, "objecao_principal");

    const scores = rows.map((r) => r.score).filter((s): s is number => s != null);
    const scoreDist = { "0-30": 0, "31-60": 0, "61-80": 0, "81-100": 0 };
    for (const s of scores) {
      if (s <= 30) scoreDist["0-30"]++;
      else if (s <= 60) scoreDist["31-60"]++;
      else if (s <= 80) scoreDist["61-80"]++;
      else scoreDist["81-100"]++;
    }

    const sampleSize = Math.min(50, rows.length);
    const step       = Math.max(1, Math.floor(rows.length / sampleSize));
    const samples    = rows
      .filter((_, i) => i % step === 0)
      .slice(0, sampleSize)
      .map((r) => ({
        duracao_segundos:  r.duration_seconds,
        motivo_termino:    r.ended_reason,
        score:             r.score,
        interesse:         r.interesse,
        resultado:         r.resultado,
        estagio_atingido:  r.estagio_atingido,
        nivel_engajamento: r.nivel_engajamento,
        qualidade_tecnica: r.qualidade_tecnica,
        dor_identificada:  r.dor_identificada,
        objecao_principal: r.objecao_principal,
      }));

    // ── Contexto para a IA ────────────────────────────────────────────────────
    const filterDesc = buildFilterDescription(filters);
    const contextData = {
      campanha:                   campaignName,
      periodo_dias:               periodDays,
      filtros_ativos:             filterDesc,
      total_chamadas_no_filtro:   totalRows,
      custo_total_usd:            Math.round(totalCost * 1000) / 1000,
      duracao_media_segundos:     avgDuration,
      score_medio:                avgScore,
      distribuicao_duracao:       durationBuckets,
      distribuicao_score:         scores.length > 0 ? scoreDist : null,
      motivos_encerramento:       endedReasonDist,
      nivel_engajamento:          engagementDist,
      resultado_chamadas:         resultadoDist,
      estagio_atingido:           estagioDist,
      qualidade_tecnica:          qualidadeDist,
      principais_dores:           dorDist,
      principais_objecoes:        objecaoDist,
      amostra_chamadas:           samples,
    };

    const filterNote = filterDesc !== "nenhum filtro adicional (análise geral)"
      ? `\n\n**ATENÇÃO:** Esta análise considera apenas chamadas com os seguintes filtros: ${filterDesc}. Mencione isso no diagnóstico e interprete os dados dentro desse contexto específico.`
      : "";

    const prompt = `Você é um especialista em análise de campanhas de discagem automática com IA de voz.

Analise os dados abaixo e produza um **Relatório de Análise de Gargalo** focado em identificar por que leads desligam precocemente e o que pode ser melhorado.${filterNote}

## Dados da Campanha
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

## Estrutura do Relatório (Markdown):

### 1. Diagnóstico do Gargalo Principal
Qual é o principal problema identificado nos dados? Seja específico com números.

### 2. Padrões Críticos
Liste 3-5 padrões relevantes. Para cada padrão, cite correlações concretas (ex: "leads com nivel_engajamento=alto têm duração média 40% maior que os demais").

### 3. Causas Raiz
Para cada padrão, explique a causa provável (script, timing, objeção não tratada, qualidade técnica, etc.).

### 4. Recomendações (ordenadas por impacto)
Ações concretas e mensuráveis. Inclua sugestões de ajuste de script quando relevante.

### 5. KPIs para Acompanhar
Métricas específicas para medir o progresso após as melhorias.

Use dados concretos. Responda em **português brasileiro**.`;

    // ── OpenAI ────────────────────────────────────────────────────────────────
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você é especialista em análise de campanhas de discagem automática com IA de voz." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1800,
        temperature: 0.3,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI erro ${openaiRes.status}: ${errText}`);
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content ?? "";

    if (!content) throw new Error("OpenAI retornou conteúdo vazio");

    // ── Salvar histórico ──────────────────────────────────────────────────────
    const { error: insertError } = await supabase
      .from("tenant_analyses")
      .insert({
        tenant_id:   tenantId,
        queue_id:    queueId,
        report_type: "campaign",
        content,
        metadata: {
          period_days:   periodDays,
          since,
          until,
          total_calls:   totalRows,
          filters,
          filter_desc:   filterDesc,
          avg_score:     avgScore,
          avg_duration:  avgDuration,
          sample_size:   sampleSize,
          campaign_name: campaignName,
        },
      });

    if (insertError) console.error("Erro ao salvar análise:", insertError.message);

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-tenant-analysis error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
