-- =========================================================================
-- 019_cleanup_and_security.sql
-- Segurança, limpeza de índices duplicados e cobertura de FK faltante.
--
-- Execute colando no SQL Editor do painel Supabase (Database → SQL Editor).
--
-- ⚠️  HIBP — NÃO configurável via SQL.
--     Ative em: Authentication → Settings → "Enable HaveIBeenPwned"
-- =========================================================================


-- ==========================================
-- FASE 1: SEGURANÇA
-- ==========================================

-- 1a. Habilitar RLS nas tabelas sem proteção
ALTER TABLE public.assistant_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_configs    ENABLE ROW LEVEL SECURITY;

-- 1b. Policy de acesso para assistant_snapshots
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assistant_snapshots'
      AND policyname = 'assistant_snapshots_crud_member'
  ) THEN
    EXECUTE 'CREATE POLICY "assistant_snapshots_crud_member"
      ON public.assistant_snapshots FOR ALL
      USING  (public.is_member_of_tenant(tenant_id))
      WITH CHECK (public.is_member_of_tenant(tenant_id))';
  END IF;
END $$;

-- 1c. Policy de acesso para assistant_configs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assistant_configs'
      AND policyname = 'assistant_configs_crud_member'
  ) THEN
    EXECUTE 'CREATE POLICY "assistant_configs_crud_member"
      ON public.assistant_configs FOR ALL
      USING  (public.is_member_of_tenant(tenant_id))
      WITH CHECK (public.is_member_of_tenant(tenant_id))';
  END IF;
END $$;

-- 1d. Corrigir search_path mutável da função set_updated_at
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;


-- ==========================================
-- FASE 2A: DROP DUPLICATAS — leads
-- ==========================================

DROP INDEX IF EXISTS leads_tenant_list_status_idx;    -- duplicata de leads_tenant_id_lead_list_id_status_idx
DROP INDEX IF EXISTS leads_tenant_phone_idx;          -- duplicata de leads_tenant_id_phone_e164_idx
DROP INDEX IF EXISTS leads_tenant_status_next_idx;    -- duplicata de leads_tenant_id_status_next_attempt_at_idx
DROP INDEX IF EXISTS leads_tenant_id_pure_idx;        -- coberto pelo composite da 018


-- ==========================================
-- FASE 2B: DROP DUPLICATAS — call_records
-- ==========================================

DROP INDEX IF EXISTS call_records_tenant_queue_idx;   -- duplicata de call_records_tenant_id_dial_queue_id_created_at_idx
DROP INDEX IF EXISTS call_records_tenant_lead_idx;    -- duplicata de call_records_tenant_id_lead_id_created_at_idx
DROP INDEX IF EXISTS call_records_vapi_call_idx;      -- duplicata de call_records_vapi_call_id_idx
DROP INDEX IF EXISTS call_records_vapi_id_idx;        -- duplicata de call_records_vapi_call_id_idx
DROP INDEX IF EXISTS call_records_tenant_id_pure_idx; -- coberto pelos compostos acima


-- ==========================================
-- FASE 2C: DROP DUPLICATAS — memberships
-- ==========================================

DROP INDEX IF EXISTS memberships_tenant_id_pure_idx;  -- duplicata de memberships_tenant_id_idx


-- ==========================================
-- FASE 2D: DROP REDUNDANTES — singletons da 017
-- cobertos pelos compostos da 001
-- ==========================================

DROP INDEX IF EXISTS vapi_connections_tenant_id_pure_idx;   -- coberto por vapi_connections_tenant_active_idx
DROP INDEX IF EXISTS lead_lists_tenant_id_pure_idx;         -- coberto por lead_lists_tenant_created_idx
DROP INDEX IF EXISTS dial_queues_tenant_id_pure_idx;        -- coberto por dial_queues_tenant_status_idx
DROP INDEX IF EXISTS callback_requests_tenant_id_pure_idx;  -- coberto pelos compostos callback_req_tenant_*


-- ==========================================
-- FASE 3: COBERTURA DE FOREIGN KEY faltante
-- ==========================================

CREATE INDEX IF NOT EXISTS tenant_invites_invited_by_idx
ON public.tenant_invites (invited_by);


-- =========================================================================
-- FIM — verifique os índices restantes com:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' ORDER BY tablename, indexname;
-- =========================================================================
