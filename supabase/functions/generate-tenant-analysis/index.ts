// Edge Function: generate-tenant-analysis
// Analisa gargalos de chamadas curtas (10-40s) usando OpenAI gpt-4o-mini
// verify_jwt: false → configurado em config.toml para evitar CORS no pre-flight

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Responder pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tenantId, queueId } = await req.json();

    if (!tenantId || !queueId) {
      return new Response(
        JSON.stringify({ error: "tenantId e queueId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Buscar nome da campanha ──
    const { data: queueData } = await supabase
      .from("dial_queues")
      .select("name")
      .eq("id", queueId)
      .single();

    const campaignName = queueData?.name ?? "Campanha desconhecida";

    // ── Buscar chamadas dos últimos 90 dias ──
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const { data: allCalls, error: callsError } = await supabase
      .from("call_records")
      .select("id, duration_seconds, ended_reason, cost, structured_outputs, created_at")
      .eq("tenant_id", tenantId)
      .eq("dial_queue_id", queueId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (callsError) {
      throw new Error(`Erro ao buscar call_records: ${callsError.message}`);
    }

    const calls = allCalls ?? [];
    const totalCalls = calls.length;

    if (totalCalls === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma chamada encontrada para esta campanha no período de 90 dias." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Métricas gerais ──
    const answered = calls.filter(
      (c) => c.ended_reason === "customer-ended-call" || c.ended_reason === "assistant-ended-call"
    );
    const answerRate = totalCalls > 0 ? Math.round((answered.length / totalCalls) * 100) : 0;

    // Distribuição por faixas de duração
    const buckets: Record<string, number> = {
      "0-10s": 0, "10-30s": 0, "30-60s": 0, "1-3min": 0, "3-5min": 0, "5min+": 0,
    };
    for (const c of answered) {
      const d = c.duration_seconds ?? 0;
      if (d < 10)       buckets["0-10s"]++;
      else if (d < 30)  buckets["10-30s"]++;
      else if (d < 60)  buckets["30-60s"]++;
      else if (d < 180) buckets["1-3min"]++;
      else if (d < 300) buckets["3-5min"]++;
      else              buckets["5min+"]++;
    }

    // Ended reason breakdown
    const reasonBreakdown: Record<string, number> = {};
    for (const c of calls) {
      const r = c.ended_reason ?? "desconhecido";
      reasonBreakdown[r] = (reasonBreakdown[r] ?? 0) + 1;
    }

    // Custo total
    const totalCost = calls.reduce((s, c) => s + (c.cost ?? 0), 0);

    // ── Amostra de chamadas curtas (10-40s) para análise qualitativa ──
    const shortCalls = answered.filter(
      (c) => (c.duration_seconds ?? 0) >= 10 && (c.duration_seconds ?? 0) <= 40
    );
    const shortCallsPct = answered.length > 0
      ? Math.round((shortCalls.length / answered.length) * 100)
      : 0;

    // Pega até 50 amostras com structured_outputs
    const withOutputs = shortCalls
      .filter((c) => c.structured_outputs != null)
      .slice(0, 50);

    const outputSamples = withOutputs.map((c) => {
      const so = c.structured_outputs as Record<string, unknown>;
      // Achata outputs aninhados (formato Vapi v2)
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(so)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const nested = v as Record<string, unknown>;
          const result = nested.result;
          if (result && typeof result === "object") {
            Object.assign(flat, result);
          } else {
            for (const [nk, nv] of Object.entries(nested)) {
              if (nk !== "name" && nv !== null && nv !== undefined && typeof nv !== "object") {
                flat[nk] = nv;
              }
            }
          }
        } else {
          flat[k] = v;
        }
      }
      return { duration_seconds: c.duration_seconds, ...flat };
    });

    // ── Montar contexto para a IA ──
    const contextData = {
      campanha: campaignName,
      periodo_dias: 90,
      total_chamadas: totalCalls,
      taxa_atendimento: `${answerRate}%`,
      custo_total_usd: Math.round(totalCost * 100) / 100,
      distribuicao_duracao_chamadas_atendidas: buckets,
      motivos_termino_top: Object.entries(reasonBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      chamadas_curtas_10_40s: {
        quantidade: shortCalls.length,
        percentual_do_total_atendidas: `${shortCallsPct}%`,
      },
      amostras_structured_outputs_chamadas_curtas: outputSamples,
    };

    const prompt = `Você é um especialista em análise de campanhas de discagem automática com IA de voz.

Analise os dados abaixo de uma campanha real e produza um **Relatório de Análise de Gargalo** focado em entender por que leads desligam logo no início da chamada (10-40s).

## Dados da Campanha
\`\`\`json
${JSON.stringify(contextData, null, 2)}
\`\`\`

## Sua análise deve conter (em Markdown):

### 1. Diagnóstico do Gargalo Principal
Identifique o principal problema que faz leads desligarem cedo. Seja direto e específico.

### 2. Padrões Identificados
Liste os 3-5 padrões mais relevantes encontrados nos dados (motivos de término, duração, outputs estruturados).

### 3. Hipóteses de Causa Raiz
Para cada padrão, explique a causa provável (problema de script, timing, voz, objeção não tratada, etc.).

### 4. Recomendações Priorizadas
Liste as 3-5 ações concretas mais impactantes para reduzir abandono precoce, em ordem de prioridade.

### 5. Métricas de Acompanhamento
Quais KPIs monitorar para saber se as melhorias estão funcionando?

Seja objetivo, use dados concretos do relatório. Responda em **português brasileiro**.`;

    // ── Chamar OpenAI ──
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Você é um especialista em análise de campanhas de discagem automática." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI erro ${openaiRes.status}: ${errText}`);
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content ?? "";

    if (!content) {
      throw new Error("OpenAI retornou conteúdo vazio");
    }

    // ── Salvar no banco ──
    const { error: insertError } = await supabase
      .from("tenant_analyses")
      .insert({
        tenant_id: tenantId,
        queue_id: queueId,
        report_type: "campaign",
        content,
        metadata: {
          period_days: 90,
          sample_size: withOutputs.length,
          total_calls: totalCalls,
          short_calls_count: shortCalls.length,
          short_calls_pct: shortCallsPct,
          duration_range: "10-40s",
        },
      });

    if (insertError) {
      // Não bloqueia o retorno ao frontend — só loga
      console.error("Erro ao salvar análise:", insertError.message);
    }

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
