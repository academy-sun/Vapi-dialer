-- ============================================================
-- 035_result_from_assistant_success_field.sql
-- Faz a coluna "Resultado" (call_records_flat.interesse) e o badge de
-- sucesso (success_evaluation / is_conversion) derivarem do critério
-- configurado POR ASSISTENTE (assistant_configs.success_field/value),
-- em vez de depender apenas da lista fixa de aliases.
--
-- Motivo: cada tenant nomeia o campo de sucesso de forma diferente
-- (ex: "sucesso", "aceita_cotacao", "result", "descadastramento"...),
-- então a lista global de aliases nunca cobre todos e a coluna fica
-- vazia mesmo com structured output presente.
--
-- O formato PLANO (analysis.structuredData) NÃO é suportado de propósito —
-- é legado e só existe em assistentes antigos; os novos usam o Structured
-- Output (artifact, { id: { result: {...} } }), que a flatten já trata.
--
-- Ligação chamada -> assistente: call_records.dial_queue_id
--   -> dial_queues.assistant_id -> assistant_configs(tenant_id, assistant_id).
--
-- SEGURO: CREATE OR REPLACE da trigger fn + UPDATE idempotente de backfill.
-- NÃO altera flatten_structured_outputs_v2 (mantém a versão da 026).
-- ============================================================

-- ── 1. Trigger fn: achata + aplica critério de sucesso do assistente ─────────

CREATE OR REPLACE FUNCTION public.trg_fn_flatten_call_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r               RECORD;
  v_lead_phone    TEXT;
  v_lead_name     TEXT;
  v_assistant_id  TEXT;
  v_success_field TEXT;
  v_success_value TEXT;
  v_field_value   TEXT;
  v_interesse     TEXT;
  v_success_eval  BOOLEAN;
BEGIN
  -- Dados denormalizados do lead
  SELECT l.phone_e164,
         COALESCE(
           l.data_json->>'nome',
           l.data_json->>'name',
           l.data_json->>'Nome',
           l.data_json->>'NOME',
           l.data_json->>'first_name'
         )
  INTO v_lead_phone, v_lead_name
  FROM public.leads l
  WHERE l.id = NEW.lead_id;

  -- Achatar e normalizar structured_outputs (formato artifact)
  SELECT * INTO r FROM public.flatten_structured_outputs_v2(NEW.structured_outputs);

  -- Critério de sucesso configurado para o assistente desta fila
  SELECT dq.assistant_id INTO v_assistant_id
  FROM public.dial_queues dq
  WHERE dq.id = NEW.dial_queue_id;

  IF v_assistant_id IS NOT NULL THEN
    SELECT ac.success_field, ac.success_value
    INTO v_success_field, v_success_value
    FROM public.assistant_configs ac
    WHERE ac.tenant_id = NEW.tenant_id
      AND ac.assistant_id = v_assistant_id;
  END IF;

  -- Valor do campo configurado, extraído do output achatado
  IF v_success_field IS NOT NULL AND r.flat IS NOT NULL THEN
    v_field_value := NULLIF(r.flat ->> v_success_field, '');
  END IF;

  -- Resultado exibido: prioriza o campo configurado; senão o alias genérico
  v_interesse := COALESCE(v_field_value, r.p_interesse);

  -- Sucesso: compara com success_value se configurado; senão usa o genérico
  IF v_success_field IS NOT NULL AND v_success_value IS NOT NULL AND v_field_value IS NOT NULL THEN
    v_success_eval := lower(btrim(v_field_value)) = lower(btrim(v_success_value));
  ELSE
    v_success_eval := r.p_success_evaluation;
  END IF;

  INSERT INTO public.call_records_flat (
    id, tenant_id, dial_queue_id, lead_id, vapi_call_id,
    status, ended_reason, duration_seconds, cost, created_at,
    summary, recording_url, machine_detected, started_at, ended_at,
    score, interesse, resultado, estagio_atingido, nivel_engajamento,
    qualidade_tecnica, dor_identificada, objecao_principal, cargo_presumido,
    momento_quebra, ponto_de_falha,
    resumo, performance_score, success_evaluation,
    pontos_melhoria, objecoes, motivos_falha, proximo_passo,
    lead_phone, lead_name,
    is_conversion,
    outputs_flat
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.dial_queue_id, NEW.lead_id, NEW.vapi_call_id,
    NEW.status, NEW.ended_reason, NEW.duration_seconds, NEW.cost, NEW.created_at,
    NEW.summary, NEW.recording_url, COALESCE(NEW.machine_detected, false),
    NEW.started_at, NEW.ended_at,
    r.p_score, v_interesse, r.p_resultado, r.p_estagio_atingido,
    r.p_nivel_engajamento, r.p_qualidade_tecnica, r.p_dor_identificada,
    r.p_objecao_principal, r.p_cargo_presumido, r.p_momento_quebra,
    r.p_ponto_de_falha,
    r.p_resumo, r.p_performance_score, v_success_eval,
    r.p_pontos_melhoria, r.p_objecoes, r.p_motivos_falha, r.p_proximo_passo,
    v_lead_phone, v_lead_name,
    COALESCE(v_success_eval, false),
    r.flat
  )
  ON CONFLICT (id) DO UPDATE SET
    lead_id           = EXCLUDED.lead_id,
    vapi_call_id      = EXCLUDED.vapi_call_id,
    status            = EXCLUDED.status,
    ended_reason      = EXCLUDED.ended_reason,
    duration_seconds  = EXCLUDED.duration_seconds,
    cost              = EXCLUDED.cost,
    summary           = EXCLUDED.summary,
    recording_url     = EXCLUDED.recording_url,
    machine_detected  = EXCLUDED.machine_detected,
    started_at        = EXCLUDED.started_at,
    ended_at          = EXCLUDED.ended_at,
    score             = EXCLUDED.score,
    interesse         = EXCLUDED.interesse,
    resultado         = EXCLUDED.resultado,
    estagio_atingido  = EXCLUDED.estagio_atingido,
    nivel_engajamento = EXCLUDED.nivel_engajamento,
    qualidade_tecnica = EXCLUDED.qualidade_tecnica,
    dor_identificada  = EXCLUDED.dor_identificada,
    objecao_principal = EXCLUDED.objecao_principal,
    cargo_presumido   = EXCLUDED.cargo_presumido,
    momento_quebra    = EXCLUDED.momento_quebra,
    ponto_de_falha    = EXCLUDED.ponto_de_falha,
    resumo            = EXCLUDED.resumo,
    performance_score = EXCLUDED.performance_score,
    success_evaluation= EXCLUDED.success_evaluation,
    pontos_melhoria   = EXCLUDED.pontos_melhoria,
    objecoes          = EXCLUDED.objecoes,
    motivos_falha     = EXCLUDED.motivos_falha,
    proximo_passo     = EXCLUDED.proximo_passo,
    lead_phone        = EXCLUDED.lead_phone,
    lead_name         = EXCLUDED.lead_name,
    is_conversion     = EXCLUDED.is_conversion,
    outputs_flat      = EXCLUDED.outputs_flat;

  RETURN NEW;
END;
$$;

-- ── 2. Re-backfill: reaplica o critério de sucesso aos registros existentes ───
-- Usa a flatten atual (artifact) + o success_field configurado por assistente.

WITH base AS (
  SELECT
    cr.id,
    dq.assistant_id,
    ac.success_field,
    ac.success_value,
    f.*
  FROM public.call_records cr
  LEFT JOIN public.dial_queues dq      ON dq.id = cr.dial_queue_id
  LEFT JOIN public.assistant_configs ac ON ac.tenant_id = cr.tenant_id
                                       AND ac.assistant_id = dq.assistant_id
  CROSS JOIN LATERAL public.flatten_structured_outputs_v2(cr.structured_outputs) f
  WHERE cr.structured_outputs IS NOT NULL
    AND cr.structured_outputs <> '{}'::jsonb
),
src AS (
  SELECT
    b.*,
    NULLIF(b.flat ->> b.success_field, '') AS field_value
  FROM base b
)
UPDATE public.call_records_flat crf
SET
  interesse = COALESCE(src.field_value, src.p_interesse),
  success_evaluation = CASE
    WHEN src.success_field IS NOT NULL AND src.success_value IS NOT NULL AND src.field_value IS NOT NULL
      THEN lower(btrim(src.field_value)) = lower(btrim(src.success_value))
    ELSE src.p_success_evaluation
  END,
  is_conversion = COALESCE(
    CASE
      WHEN src.success_field IS NOT NULL AND src.success_value IS NOT NULL AND src.field_value IS NOT NULL
        THEN lower(btrim(src.field_value)) = lower(btrim(src.success_value))
      ELSE src.p_success_evaluation
    END, false),
  score             = src.p_score,
  performance_score = src.p_performance_score,
  resultado         = src.p_resultado,
  estagio_atingido  = src.p_estagio_atingido,
  nivel_engajamento = src.p_nivel_engajamento,
  qualidade_tecnica = src.p_qualidade_tecnica,
  dor_identificada  = src.p_dor_identificada,
  objecao_principal = src.p_objecao_principal,
  cargo_presumido   = src.p_cargo_presumido,
  momento_quebra    = src.p_momento_quebra,
  ponto_de_falha    = src.p_ponto_de_falha,
  resumo            = src.p_resumo,
  pontos_melhoria   = src.p_pontos_melhoria,
  objecoes          = src.p_objecoes,
  motivos_falha     = src.p_motivos_falha,
  proximo_passo     = src.p_proximo_passo,
  outputs_flat      = src.flat
FROM src
WHERE crf.id = src.id;
