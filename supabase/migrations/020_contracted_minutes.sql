-- ============================================================
-- 020_contracted_minutes.sql
-- Controle de minutos contratados por tenant (cobrança mensal).
--
-- Adiciona campos em vapi_connections:
--   contracted_minutes  → admin define quantos minutos o cliente tem/mês
--   minutes_used_cache  → worker atualiza a cada ~60s (em segundos)
--   minutes_cache_month → mês de referência do cache ("YYYY-MM")
--   minutes_blocked     → worker bloqueia em 100%, admin desbloqueia
--
-- Adiciona índice composto em call_records(tenant_id, created_at)
-- para que a query de SUM mensal do worker não faça seq scan.
--
-- Cria função RPC usada pelo worker para calcular a soma de segundos
-- sem buscar todas as linhas em JS (SECURITY DEFINER para bypassar RLS).
-- ============================================================

ALTER TABLE public.vapi_connections
  ADD COLUMN IF NOT EXISTS contracted_minutes INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minutes_used_cache  INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS minutes_cache_month VARCHAR(7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minutes_blocked     BOOLEAN DEFAULT FALSE NOT NULL;

-- Índice para a query de soma mensal: WHERE tenant_id = X AND created_at >= first_of_month
-- Sem este índice o Postgres faria seq scan em call_records a cada ciclo do worker.
CREATE INDEX IF NOT EXISTS call_records_tenant_created_idx
ON public.call_records(tenant_id, created_at);

-- Função RPC chamada pelo worker via supabase.rpc()
-- Retorna a soma de segundos de chamadas de um tenant no mês corrente.
-- SECURITY DEFINER: executa como owner, bypassa RLS (worker usa service role mas
-- a função precisa de SECURITY DEFINER para funcionar também via anon role em testes).
CREATE OR REPLACE FUNCTION public.get_monthly_call_seconds(
  p_tenant_id      UUID,
  p_first_of_month TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(duration_seconds), 0)::INTEGER
  FROM call_records
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_first_of_month;
$$;
