-- 033: Indices para busca textual com pg_trgm e filtros colunares
-- Substitui a proposta de pgvector (overkill) por pg_trgm + GIN

-- Habilitar extensao pg_trgm (suporta ILIKE com indice)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indice para busca por telefone com ILIKE
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON public.leads USING GIN (phone_e164 gin_trgm_ops);

-- Indices compostos para filtros colunares frequentes
CREATE INDEX IF NOT EXISTS idx_leads_status_list
  ON public.leads(tenant_id, lead_list_id, status);

CREATE INDEX IF NOT EXISTS idx_leads_attempts
  ON public.leads(tenant_id, lead_list_id, attempt_count);

CREATE INDEX IF NOT EXISTS idx_leads_next_attempt
  ON public.leads(tenant_id, lead_list_id, next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_last_outcome
  ON public.leads(tenant_id, lead_list_id, last_outcome)
  WHERE last_outcome IS NOT NULL;
