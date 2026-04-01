-- ============================================================
-- 027_rpc_analytics_summary.sql
-- RPC que substitui os batch loops da rota /analytics
-- Faz toda a agregação no Postgres e retorna 1 JSONB
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_analytics_summary(
  p_tenant_id   UUID,
  p_queue_id    UUID    DEFAULT NULL,
  p_since       TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
  p_timezone    TEXT    DEFAULT 'America/Sao_Paulo'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN

  WITH
  calls AS (
    SELECT
      crf.id,
      crf.ended_reason,
      crf.duration_seconds,
      crf.cost,
      crf.created_at,
      crf.dial_queue_id,
      crf.is_answered,
      crf.is_conversion,
      CASE
        WHEN crf.ended_reason IN ('customer-ended-call','assistant-ended-call') THEN 'answered'
        WHEN crf.ended_reason IN ('voicemail','machine_end_silence','machine_end_other','silence-timed-out') THEN 'voicemail'
        WHEN crf.ended_reason IN ('busy','customer-busy') THEN 'busy'
        WHEN crf.ended_reason IN ('no-answer','customer-did-not-answer') THEN 'no-answer'
        WHEN crf.ended_reason IN ('failed','pipeline-error','error') THEN 'failed'
        WHEN crf.ended_reason LIKE 'call.in-progress.error%' THEN 'failed'
        WHEN crf.ended_reason = 'customer-did-not-answer' AND crf.duration_seconds BETWEEN 1 AND 30 THEN 'ura-suspeita'
        ELSE 'other'
      END AS status_cat,
      EXTRACT(HOUR FROM crf.created_at AT TIME ZONE p_timezone)::INT  AS hour_local,
      EXTRACT(ISODOW FROM crf.created_at AT TIME ZONE p_timezone)::INT AS weekday_local
    FROM call_records_flat crf
    WHERE crf.tenant_id = p_tenant_id
      AND crf.created_at >= p_since
      AND (p_queue_id IS NULL OR crf.dial_queue_id = p_queue_id)
  ),
  base_metrics AS (
    SELECT
      COUNT(*)                                           AS total_calls,
      COALESCE(SUM(cost),0)                              AS total_cost,
      COALESCE(SUM(duration_seconds),0)                  AS total_duration_sec,
      COALESCE(MAX(duration_seconds),0)                  AS max_duration_sec,
      COUNT(*) FILTER (WHERE status_cat = 'answered')    AS answered_calls,
      COUNT(*) FILTER (WHERE status_cat = 'no-answer')   AS no_answer_calls,
      COUNT(*) FILTER (WHERE is_conversion = true)       AS conversion_calls,
      COALESCE(SUM(duration_seconds) FILTER (WHERE status_cat = 'answered'), 0) AS total_duration_answered_sec,
      COALESCE(AVG(duration_seconds) FILTER (WHERE status_cat = 'answered'), 0)::NUMERIC(10,2) AS avg_duration_answered_sec,
      COALESCE(AVG(duration_seconds), 0)::NUMERIC(10,2)  AS avg_duration_all_sec
    FROM calls
  ),
  status_bd AS (
    SELECT
      COUNT(*) FILTER (WHERE status_cat = 'answered')     AS answered,
      COUNT(*) FILTER (WHERE status_cat = 'voicemail')    AS voicemail,
      COUNT(*) FILTER (WHERE status_cat = 'busy')         AS busy,
      COUNT(*) FILTER (WHERE status_cat = 'no-answer')    AS no_answer,
      COUNT(*) FILTER (WHERE status_cat = 'failed')       AS failed,
      COUNT(*) FILTER (WHERE status_cat = 'other')        AS other,
      COUNT(*) FILTER (WHERE status_cat = 'ura-suspeita') AS ura_suspeita
    FROM calls
  ),
  reason_raw AS (
    SELECT jsonb_object_agg(COALESCE(ended_reason, 'null'), cnt) AS raw_map
    FROM (SELECT ended_reason, COUNT(*) AS cnt FROM calls GROUP BY ended_reason) x
  ),
  dur_buckets AS (
    SELECT
      COUNT(*) FILTER (WHERE duration_seconds < 10)                   AS b_0_10,
      COUNT(*) FILTER (WHERE duration_seconds >= 10  AND duration_seconds < 60)  AS b_10_60,
      COUNT(*) FILTER (WHERE duration_seconds >= 60  AND duration_seconds < 180) AS b_1_3min,
      COUNT(*) FILTER (WHERE duration_seconds >= 180 AND duration_seconds < 300) AS b_3_5min,
      COUNT(*) FILTER (WHERE duration_seconds >= 300)                 AS b_5min_plus
    FROM calls WHERE status_cat = 'answered'
  ),
  engagement AS (
    SELECT
      COUNT(*) FILTER (WHERE duration_seconds < 10)   AS under10s,
      COUNT(*) FILTER (WHERE duration_seconds BETWEEN 10 AND 60) AS ten_to60s,
      COUNT(*) FILTER (WHERE duration_seconds > 60)   AS over60s
    FROM calls WHERE status_cat = 'answered'
  ),
  by_hour AS (
    SELECT hour_local, COUNT(*) AS total, COUNT(*) FILTER (WHERE status_cat = 'answered') AS answered
    FROM calls GROUP BY hour_local
  ),
  by_hour_agg AS (
    SELECT
      jsonb_object_agg(hour_local::TEXT, total)    AS volume,
      jsonb_object_agg(hour_local::TEXT, answered) AS answered_map,
      jsonb_object_agg(hour_local::TEXT, CASE WHEN total > 0 THEN ROUND((answered::NUMERIC / total) * 100) ELSE 0 END) AS answer_rate
    FROM by_hour
  ),
  by_weekday AS (
    SELECT jsonb_object_agg(weekday_local::TEXT, cnt) AS vol
    FROM (SELECT weekday_local, COUNT(*) AS cnt FROM calls GROUP BY weekday_local) x
  ),
  by_day_hour AS (
    SELECT weekday_local, hour_local, COUNT(*) AS total, COUNT(*) FILTER (WHERE status_cat = 'answered') AS answered
    FROM calls GROUP BY weekday_local, hour_local
  ),
  day_hour_agg AS (
    SELECT
      jsonb_object_agg(weekday_local::TEXT, day_totals)   AS by_day_hour_total,
      jsonb_object_agg(weekday_local::TEXT, day_answered) AS by_day_hour_answered
    FROM (
      SELECT weekday_local,
             jsonb_object_agg(hour_local::TEXT, total)    AS day_totals,
             jsonb_object_agg(hour_local::TEXT, answered) AS day_answered
      FROM by_day_hour GROUP BY weekday_local
    ) sub
  )
  SELECT INTO v_result
    jsonb_build_object(
      'totalCalls',               bm.total_calls,
      'totalCost',                bm.total_cost,
      'totalDurationSec',         bm.total_duration_sec,
      'totalDurationAnsweredSec', bm.total_duration_answered_sec,
      'avgDurationSec',           bm.avg_duration_answered_sec,
      'avgDurationAllSec',        bm.avg_duration_all_sec,
      'maxDurationSec',           bm.max_duration_sec,
      'answeredCalls',            bm.answered_calls,
      'notAnsweredCalls',         bm.no_answer_calls,
      'conversionCalls',          bm.conversion_calls,
      'costPerConversion',        CASE WHEN bm.conversion_calls > 0 THEN ROUND((bm.total_cost / bm.conversion_calls)::NUMERIC, 4) ELSE NULL END,
      'statusBreakdown', jsonb_build_object(
        'answered',sb.answered,'voicemail',sb.voicemail,'busy',sb.busy,
        'no-answer',sb.no_answer,'failed',sb.failed,'other',sb.other,'ura-suspeita',sb.ura_suspeita
      ),
      'endedReasonRaw',   rr.raw_map,
      'durationBuckets',  jsonb_build_object('0-10s',db.b_0_10,'10-60s',db.b_10_60,'1-3min',db.b_1_3min,'3-5min',db.b_3_5min,'5min+',db.b_5min_plus),
      'engagement',       jsonb_build_object('under10s',eg.under10s,'tenTo60s',eg.ten_to60s,'over60s',eg.over60s),
      'engagementRate',   CASE WHEN bm.answered_calls > 0 THEN ROUND((eg.over60s::NUMERIC / bm.answered_calls) * 100) ELSE 0 END,
      'byHour',           bha.volume,
      'byHourAnswerRate', bha.answer_rate,
      'byWeekday',        bwd.vol,
      'byDayHour',        dha.by_day_hour_total,
      'byDayHourAnswered',dha.by_day_hour_answered
    )
  FROM base_metrics bm CROSS JOIN status_bd sb CROSS JOIN reason_raw rr
  CROSS JOIN dur_buckets db CROSS JOIN engagement eg
  CROSS JOIN by_hour_agg bha CROSS JOIN by_weekday bwd CROSS JOIN day_hour_agg dha;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_analytics_summary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_analytics_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_analytics_summary TO service_role;
