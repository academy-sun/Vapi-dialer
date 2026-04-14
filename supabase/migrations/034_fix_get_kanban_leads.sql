-- Migration 034: fix get_kanban_leads
-- A função referenciava c.success_evaluation diretamente de call_records,
-- mas essa coluna existe apenas em call_records_flat. Corrigido para
-- usar call_records_flat na lógica das colunas 3 (Qualificado) e 4 (Desqualificado).

CREATE OR REPLACE FUNCTION public.get_kanban_leads(
  p_tenant_id    uuid,
  p_lead_list_id uuid,
  p_column_idx   integer,
  p_limit        integer DEFAULT 100,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE(
  id            uuid,
  phone_e164    text,
  data_json     jsonb,
  status        text,
  attempt_count integer,
  last_outcome  text,
  total_count   bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_leads AS (
    SELECT l.*
    FROM leads l
    WHERE l.tenant_id = p_tenant_id
      AND l.lead_list_id = p_lead_list_id
      AND (
        -- Coluna 0: Novo Lead (sem tentativas)
        (p_column_idx = 0
          AND l.attempt_count = 0
          AND l.status NOT IN ('failed', 'completed', 'doNotCall'))

        OR

        -- Coluna 1: Tentativa(s) em andamento
        (p_column_idx = 1
          AND l.attempt_count > 0
          AND l.status NOT IN ('failed', 'completed', 'doNotCall'))

        OR

        -- Coluna 2: Tentativas Esgotadas
        (p_column_idx = 2
          AND l.status = 'failed')

        OR

        -- Coluna 3: Qualificado (completed + success_evaluation = true)
        (p_column_idx = 3
          AND l.status = 'completed'
          AND EXISTS (
            SELECT 1
            FROM call_records_flat crf
            WHERE crf.lead_id = l.id
              AND crf.success_evaluation = true
          ))

        OR

        -- Coluna 4: Desqualificado (completed sem success_evaluation = true)
        (p_column_idx = 4
          AND l.status = 'completed'
          AND NOT EXISTS (
            SELECT 1
            FROM call_records_flat crf
            WHERE crf.lead_id = l.id
              AND crf.success_evaluation = true
          ))
      )
  ),
  counted AS (
    SELECT COUNT(*) AS exact_count FROM filtered_leads
  )
  SELECT
    f.id,
    f.phone_e164,
    f.data_json,
    f.status,
    f.attempt_count,
    f.last_outcome,
    (SELECT exact_count FROM counted) AS total_count
  FROM filtered_leads f
  ORDER BY f.last_attempt_at DESC NULLS LAST, f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
