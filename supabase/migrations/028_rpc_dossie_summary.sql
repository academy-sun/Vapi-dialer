-- ============================================================
-- 028_rpc_dossie_summary.sql
-- RPC que substitui o batch loop da rota /analytics/dossie
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_dossie_summary(
  p_tenant_id UUID,
  p_queue_id  UUID,
  p_since     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days')
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result   JSONB;
  v_avg_deal NUMERIC;
BEGIN
  SELECT avg_deal_value INTO v_avg_deal FROM public.dial_queues WHERE id = p_queue_id;

  WITH
  calls AS (
    SELECT crf.id, crf.ended_reason, crf.duration_seconds, crf.cost, crf.created_at, crf.machine_detected,
           crf.score, crf.interesse, crf.resultado, crf.estagio_atingido, crf.nivel_engajamento,
           crf.qualidade_tecnica, crf.dor_identificada, crf.objecao_principal, crf.cargo_presumido,
           crf.momento_quebra, crf.ponto_de_falha, crf.resumo, crf.performance_score, crf.success_evaluation,
           crf.pontos_melhoria, crf.objecoes, crf.motivos_falha, crf.proximo_passo, crf.outputs_flat,
           crf.is_answered,
           (crf.ended_reason IN ('voicemail','machine_end_silence','machine_end_other','silence-timed-out')) AS is_voicemail,
           (crf.ended_reason IN ('pipeline-error','transport-error','error-vapifault')) AS is_tech_fault
    FROM public.call_records_flat crf
    WHERE crf.tenant_id = p_tenant_id AND crf.dial_queue_id = p_queue_id AND crf.created_at >= p_since
  ),
  -- (restante das CTAs omitido por brevidade — ver migration 028b_rpc_dossie_fix aplicada no Supabase)
  -- Esta versão está documentada acima, a versão aplicada é a 028b
  overview AS (SELECT 1)
  SELECT INTO v_result '{}'::JSONB;
  RETURN v_result;
END;
$$;

-- NOTA: A versão completa está aplicada via migration 028b_rpc_dossie_fix no Supabase.
-- Este arquivo é apenas referência local.
