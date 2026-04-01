-- ============================================================
-- 030_rpc_dossie_complete.sql
-- Implementação completa de rpc_dossie_summary.
-- Substitui o stub da 028 que retornava '{}' vazio.
-- Retorna: overview, durationAnalysis, funnelAnalysis,
--          opportunitiesCard, fieldAnalysis, correlations,
--          endedReasonBreakdown, avgDealValue
-- campaign e period são injetados pelo route (não pelo RPC).
-- ============================================================

DROP FUNCTION IF EXISTS public.rpc_dossie_summary(UUID, UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.rpc_dossie_summary(
  p_tenant_id UUID,
  p_queue_id  UUID,
  p_since     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days')
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result         JSONB;
  v_field_analysis JSONB;
  v_correlations   JSONB;
  v_avg_deal       NUMERIC;
BEGIN
  -- avg_deal_value da fila (para card de oportunidades)
  SELECT avg_deal_value INTO v_avg_deal
  FROM public.dial_queues WHERE id = p_queue_id;

  -- ── Métricas principais ──────────────────────────────────────────────────────
  WITH calls AS (
    SELECT
      crf.ended_reason,
      crf.duration_seconds,
      crf.cost,
      crf.outputs_flat,
      (crf.ended_reason IN ('customer-ended-call','assistant-ended-call'))                           AS is_ans,
      (crf.ended_reason IN ('voicemail','machine_end_silence','machine_end_other','silence-timed-out')) AS is_vm,
      (crf.ended_reason IN ('pipeline-error','transport-error','error')
       OR crf.ended_reason LIKE 'call.in-progress.error%')                                           AS is_tech
    FROM public.call_records_flat crf
    WHERE crf.tenant_id  = p_tenant_id
      AND crf.dial_queue_id = p_queue_id
      AND crf.created_at >= p_since
  ),
  ov AS (
    SELECT
      COUNT(*)                                                   AS total_calls,
      COUNT(*) FILTER (WHERE is_ans)                             AS answered_calls,
      COALESCE(SUM(cost), 0)                                     AS total_cost,
      COALESCE(AVG(duration_seconds) FILTER (WHERE is_ans), 0)::INT AS avg_dur,
      COUNT(*) FILTER (WHERE outputs_flat IS NOT NULL)           AS structured_count,
      COUNT(*) FILTER (WHERE is_tech)                            AS tech_count,
      COUNT(*) FILTER (WHERE is_vm)                              AS vm_count,
      -- duration buckets (answered only)
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds < 10)                                     AS b0_10,
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds BETWEEN 10  AND 29.999)                   AS b10_30,
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds BETWEEN 30  AND 59.999)                   AS b30_60,
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds BETWEEN 60  AND 179.999)                  AS b1_3,
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds BETWEEN 180 AND 299.999)                  AS b3_5,
      COUNT(*) FILTER (WHERE is_ans AND duration_seconds >= 300)                                   AS b5plus
    FROM calls
  ),
  er AS (
    SELECT COALESCE(
      jsonb_object_agg(COALESCE(ended_reason,'desconhecido'), cnt),
      '{}'::JSONB
    ) AS breakdown
    FROM (SELECT ended_reason, COUNT(*) AS cnt FROM calls GROUP BY ended_reason) x
  ),
  funnel_raw AS (
    SELECT estagio_atingido AS label, COUNT(*) AS cnt
    FROM public.call_records_flat
    WHERE tenant_id = p_tenant_id AND dial_queue_id = p_queue_id AND created_at >= p_since
      AND estagio_atingido IS NOT NULL
    GROUP BY estagio_atingido
    ORDER BY cnt DESC
  ),
  funnel_total AS (
    SELECT COUNT(*) AS total
    FROM public.call_records_flat
    WHERE tenant_id = p_tenant_id AND dial_queue_id = p_queue_id AND created_at >= p_since
      AND estagio_atingido IS NOT NULL
  )
  SELECT INTO v_result
    jsonb_build_object(
      'overview', jsonb_build_object(
        'totalCalls',             ov.total_calls,
        'answeredCalls',          ov.answered_calls,
        'answerRate',             CASE WHEN ov.total_calls > 0 THEN ROUND((ov.answered_calls::NUMERIC / ov.total_calls) * 100)::INT ELSE 0 END,
        'totalCost',              ov.total_cost,
        'avgCostPerCall',         CASE WHEN ov.total_calls > 0 THEN ROUND((ov.total_cost / ov.total_calls)::NUMERIC, 4) ELSE 0 END,
        'structuredOutputsCount', ov.structured_count,
        'structuredOutputsRate',  CASE WHEN ov.total_calls > 0 THEN ROUND((ov.structured_count::NUMERIC / ov.total_calls) * 100)::INT ELSE 0 END
      ),
      'durationAnalysis', jsonb_build_object(
        'total',         ov.answered_calls,
        'avg',           ov.avg_dur,
        'voicemailCount',ov.vm_count,
        'buckets', jsonb_build_object(
          '0–10s',  ov.b0_10,
          '10–30s', ov.b10_30,
          '30–60s', ov.b30_60,
          '1–3min', ov.b1_3,
          '3–5min', ov.b3_5,
          '5min+',  ov.b5plus
        )
      ),
      'endedReasonBreakdown', er.breakdown,
      'opportunitiesCard', jsonb_build_object(
        'techIssueCount',  ov.tech_count,
        'techIssuePct',    CASE WHEN ov.total_calls > 0 THEN ROUND((ov.tech_count::NUMERIC / ov.total_calls) * 100)::INT ELSE 0 END,
        'avgDealValue',    v_avg_deal,
        'potentialValue',  CASE WHEN v_avg_deal IS NOT NULL THEN ov.tech_count * v_avg_deal ELSE NULL END,
        'hasConfig',       v_avg_deal IS NOT NULL
      ),
      'funnelAnalysis', jsonb_build_object(
        'hasData',       ft.total > 0,
        'totalWithData', ft.total,
        'stages', COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'label',      fr.label,
              'cumulative', fr.cnt,
              'stopped',    fr.cnt,
              'pct',        CASE WHEN ft.total > 0 THEN ROUND((fr.cnt::NUMERIC / ft.total) * 100)::INT ELSE 0 END,
              'dropoff',    NULL
            ) ORDER BY fr.cnt DESC
          ) FROM funnel_raw fr),
          '[]'::JSONB
        )
      ),
      'fieldAnalysis',         '[]'::JSONB,
      'correlations',          '{}'::JSONB,
      'avgDealValue',          v_avg_deal
    )
  FROM ov CROSS JOIN er CROSS JOIN funnel_total ft;

  -- ── fieldAnalysis: análise por coluna conhecida ──────────────────────────────
  SELECT COALESCE(jsonb_agg(fa ORDER BY (fa->>'count')::INT DESC), '[]'::JSONB)
  INTO v_field_analysis
  FROM (
    -- interesse (enum)
    SELECT jsonb_build_object(
      'key','interesse','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT interesse AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND interesse IS NOT NULL GROUP BY interesse) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND interesse IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- resultado (enum)
    SELECT jsonb_build_object(
      'key','resultado','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT resultado AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND resultado IS NOT NULL GROUP BY resultado) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND resultado IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- nivel_engajamento (enum)
    SELECT jsonb_build_object(
      'key','nivel_engajamento','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT nivel_engajamento AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND nivel_engajamento IS NOT NULL GROUP BY nivel_engajamento) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND nivel_engajamento IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- objecao_principal (enum)
    SELECT jsonb_build_object(
      'key','objecao_principal','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT objecao_principal AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND objecao_principal IS NOT NULL GROUP BY objecao_principal) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND objecao_principal IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- cargo_presumido (enum)
    SELECT jsonb_build_object(
      'key','cargo_presumido','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT cargo_presumido AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND cargo_presumido IS NOT NULL GROUP BY cargo_presumido) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND cargo_presumido IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- qualidade_tecnica (enum)
    SELECT jsonb_build_object(
      'key','qualidade_tecnica','type','enum','count', cnt,
      'distribution', (SELECT COALESCE(jsonb_object_agg(v,c),'{}'::JSONB) FROM (SELECT qualidade_tecnica AS v,COUNT(*) AS c FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND qualidade_tecnica IS NOT NULL GROUP BY qualidade_tecnica) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND qualidade_tecnica IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- score (number)
    SELECT jsonb_build_object(
      'key','score','type','number','count', cnt,
      'avg', (SELECT ROUND(AVG(score)::NUMERIC,1) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND score IS NOT NULL),
      'min', (SELECT MIN(score) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND score IS NOT NULL),
      'max', (SELECT MAX(score) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND score IS NOT NULL)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND score IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- performance_score (number)
    SELECT jsonb_build_object(
      'key','performance_score','type','number','count', cnt,
      'avg', (SELECT ROUND(AVG(performance_score)::NUMERIC,1) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND performance_score IS NOT NULL),
      'min', (SELECT MIN(performance_score) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND performance_score IS NOT NULL),
      'max', (SELECT MAX(performance_score) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND performance_score IS NOT NULL)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND performance_score IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- success_evaluation (boolean)
    SELECT jsonb_build_object(
      'key','success_evaluation','type','boolean','count', cnt,
      'trueCount',  (SELECT COUNT(*) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND success_evaluation = true),
      'falseCount', (SELECT COUNT(*) FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND success_evaluation = false)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND success_evaluation IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- dor_identificada (text)
    SELECT jsonb_build_object(
      'key','dor_identificada','type','text','count', cnt,
      'samples', (SELECT COALESCE(jsonb_agg(s),'[]'::JSONB) FROM (SELECT DISTINCT dor_identificada AS s FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND dor_identificada IS NOT NULL LIMIT 5) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND dor_identificada IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- resumo (text)
    SELECT jsonb_build_object(
      'key','resumo','type','text','count', cnt,
      'samples', (SELECT COALESCE(jsonb_agg(s),'[]'::JSONB) FROM (SELECT DISTINCT resumo AS s FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND resumo IS NOT NULL LIMIT 5) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND resumo IS NOT NULL) t WHERE cnt > 0
    UNION ALL
    -- pontos_melhoria (text)
    SELECT jsonb_build_object(
      'key','pontos_melhoria','type','text','count', cnt,
      'samples', (SELECT COALESCE(jsonb_agg(s),'[]'::JSONB) FROM (SELECT DISTINCT pontos_melhoria AS s FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND pontos_melhoria IS NOT NULL LIMIT 5) x)
    ) AS fa, cnt FROM (SELECT COUNT(*) AS cnt FROM public.call_records_flat WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since AND pontos_melhoria IS NOT NULL) t WHERE cnt > 0
  ) all_fields;

  -- ── Correlações: campos enum × duração média ─────────────────────────────────
  SELECT jsonb_build_object(
    'interesse', COALESCE((
      SELECT jsonb_object_agg(v, jsonb_build_object('count', cnt, 'avgDuration', avg_dur))
      FROM (SELECT interesse AS v, COUNT(*) AS cnt, ROUND(AVG(duration_seconds))::INT AS avg_dur
            FROM public.call_records_flat
            WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since
              AND interesse IS NOT NULL AND ended_reason IN ('customer-ended-call','assistant-ended-call')
            GROUP BY interesse) x
    ), '{}'::JSONB),
    'nivel_engajamento', COALESCE((
      SELECT jsonb_object_agg(v, jsonb_build_object('count', cnt, 'avgDuration', avg_dur))
      FROM (SELECT nivel_engajamento AS v, COUNT(*) AS cnt, ROUND(AVG(duration_seconds))::INT AS avg_dur
            FROM public.call_records_flat
            WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since
              AND nivel_engajamento IS NOT NULL AND ended_reason IN ('customer-ended-call','assistant-ended-call')
            GROUP BY nivel_engajamento) x
    ), '{}'::JSONB),
    'resultado', COALESCE((
      SELECT jsonb_object_agg(v, jsonb_build_object('count', cnt, 'avgDuration', avg_dur))
      FROM (SELECT resultado AS v, COUNT(*) AS cnt, ROUND(AVG(duration_seconds))::INT AS avg_dur
            FROM public.call_records_flat
            WHERE tenant_id=p_tenant_id AND dial_queue_id=p_queue_id AND created_at>=p_since
              AND resultado IS NOT NULL AND ended_reason IN ('customer-ended-call','assistant-ended-call')
            GROUP BY resultado) x
    ), '{}'::JSONB)
  ) INTO v_correlations;

  -- Merge fieldAnalysis e correlations no resultado final
  v_result := v_result
    || jsonb_build_object('fieldAnalysis', v_field_analysis)
    || jsonb_build_object('correlations',  v_correlations);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_dossie_summary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_dossie_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dossie_summary TO service_role;
