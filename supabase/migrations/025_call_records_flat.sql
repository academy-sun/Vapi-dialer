-- ============================================================
-- 025_call_records_flat.sql
-- Tabela desnormalizada de call_records para análise de IA
-- Colunas reais para filtros e redução de custo na OpenAI
-- ============================================================

CREATE TABLE IF NOT EXISTS public.call_records_flat (
  id              UUID PRIMARY KEY REFERENCES public.call_records(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dial_queue_id   UUID REFERENCES public.dial_queues(id) ON DELETE SET NULL,
  ended_reason    TEXT,
  duration_seconds DOUBLE PRECISION,
  cost            DOUBLE PRECISION,
  created_at      TIMESTAMPTZ,

  -- Campos extraídos de structured_outputs.*.result
  score               SMALLINT,
  interesse           TEXT,
  resultado           TEXT,
  estagio_atingido    TEXT,
  nivel_engajamento   TEXT,
  qualidade_tecnica   TEXT,
  dor_identificada    TEXT,
  objecao_principal   TEXT,
  cargo_presumido     TEXT,
  momento_quebra      TEXT,
  ponto_de_falha      TEXT,

  -- Todos os campos flat (fallback para campos extras)
  outputs_flat    JSONB
);

ALTER TABLE public.call_records_flat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to call_records_flat"
  ON public.call_records_flat
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Índices para filtros frequentes
CREATE INDEX IF NOT EXISTS idx_crf_tenant_queue   ON public.call_records_flat(tenant_id, dial_queue_id);
CREATE INDEX IF NOT EXISTS idx_crf_duration       ON public.call_records_flat(tenant_id, duration_seconds);
CREATE INDEX IF NOT EXISTS idx_crf_created_at     ON public.call_records_flat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crf_ended_reason   ON public.call_records_flat(ended_reason);
CREATE INDEX IF NOT EXISTS idx_crf_engagement     ON public.call_records_flat(nivel_engajamento);
CREATE INDEX IF NOT EXISTS idx_crf_score          ON public.call_records_flat(score);

-- ── Função auxiliar: achata structured_outputs (formato Vapi v2) ──────────────
CREATE OR REPLACE FUNCTION public.flatten_structured_outputs(so JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  flat       JSONB := '{}'::JSONB;
  key        TEXT;
  val        JSONB;
  result_obj JSONB;
BEGIN
  IF so IS NULL THEN RETURN NULL; END IF;
  FOR key IN SELECT jsonb_object_keys(so) LOOP
    val        := so->key;
    result_obj := val->'result';
    IF result_obj IS NOT NULL AND jsonb_typeof(result_obj) = 'object' THEN
      flat := flat || result_obj;
    END IF;
  END LOOP;
  RETURN NULLIF(flat, '{}'::JSONB);
END;
$$;

-- ── Função do trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_flatten_call_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  flat JSONB;
BEGIN
  flat := public.flatten_structured_outputs(NEW.structured_outputs);

  INSERT INTO public.call_records_flat (
    id, tenant_id, dial_queue_id, ended_reason, duration_seconds, cost, created_at,
    score, interesse, resultado, estagio_atingido, nivel_engajamento, qualidade_tecnica,
    dor_identificada, objecao_principal, cargo_presumido, momento_quebra, ponto_de_falha,
    outputs_flat
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.dial_queue_id, NEW.ended_reason, NEW.duration_seconds,
    NEW.cost, NEW.created_at,
    CASE WHEN flat->>'score' ~ '^-?[0-9]+(\.[0-9]*)?$'
         THEN round((flat->>'score')::NUMERIC)::SMALLINT ELSE NULL END,
    flat->>'interesse',
    flat->>'resultado',
    flat->>'estagio_atingido',
    flat->>'nivel_engajamento',
    flat->>'qualidade_tecnica',
    flat->>'dor_identificada',
    flat->>'objecao_principal',
    flat->>'cargo_presumido',
    flat->>'momento_quebra',
    flat->>'ponto_de_falha',
    flat
  )
  ON CONFLICT (id) DO UPDATE SET
    ended_reason      = EXCLUDED.ended_reason,
    duration_seconds  = EXCLUDED.duration_seconds,
    cost              = EXCLUDED.cost,
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
    outputs_flat      = EXCLUDED.outputs_flat;

  RETURN NEW;
END;
$$;

-- ── Trigger ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_flatten_call_record ON public.call_records;
CREATE TRIGGER trg_flatten_call_record
  AFTER INSERT OR UPDATE OF structured_outputs, ended_reason, duration_seconds, cost
  ON public.call_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_flatten_call_record();

-- ── Backfill de dados existentes ──────────────────────────────────────────────
INSERT INTO public.call_records_flat (
  id, tenant_id, dial_queue_id, ended_reason, duration_seconds, cost, created_at,
  score, interesse, resultado, estagio_atingido, nivel_engajamento, qualidade_tecnica,
  dor_identificada, objecao_principal, cargo_presumido, momento_quebra, ponto_de_falha,
  outputs_flat
)
SELECT
  cr.id,
  cr.tenant_id,
  cr.dial_queue_id,
  cr.ended_reason,
  cr.duration_seconds,
  cr.cost,
  cr.created_at,
  CASE WHEN f.flat->>'score' ~ '^-?[0-9]+(\.[0-9]*)?$'
       THEN round((f.flat->>'score')::NUMERIC)::SMALLINT ELSE NULL END,
  f.flat->>'interesse',
  f.flat->>'resultado',
  f.flat->>'estagio_atingido',
  f.flat->>'nivel_engajamento',
  f.flat->>'qualidade_tecnica',
  f.flat->>'dor_identificada',
  f.flat->>'objecao_principal',
  f.flat->>'cargo_presumido',
  f.flat->>'momento_quebra',
  f.flat->>'ponto_de_falha',
  f.flat
FROM public.call_records cr
LEFT JOIN LATERAL (
  SELECT public.flatten_structured_outputs(cr.structured_outputs) AS flat
) f ON true
ON CONFLICT (id) DO NOTHING;
