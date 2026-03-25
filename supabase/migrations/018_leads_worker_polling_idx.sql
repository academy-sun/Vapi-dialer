-- ============================================================
-- 018_leads_worker_polling_idx.sql
-- Índice composto para as queries de polling do worker.
--
-- O worker executa a cada 5-10s estas queries por fila:
--   WHERE tenant_id = X AND lead_list_id = Y AND status = 'calling'
--   WHERE tenant_id = X AND lead_list_id = Y AND status = 'queued'   ORDER BY next_attempt_at
--   WHERE tenant_id = X AND lead_list_id = Y AND status = 'callbackScheduled' ORDER BY next_attempt_at
--
-- Sem este índice o PostgreSQL faz Full Table Scan na tabela leads
-- a cada ciclo, causando picos de CPU conforme a tabela cresce.
--
-- Execute no SQL Editor do painel Supabase (Database → SQL Editor).
-- ============================================================

CREATE INDEX IF NOT EXISTS leads_worker_polling_idx
ON public.leads (tenant_id, lead_list_id, status, next_attempt_at);
