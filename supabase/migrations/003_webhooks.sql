-- ============================================================
-- 003_webhooks.sql — Suporte a webhooks de entrada e saída
-- IDEMPOTENTE: seguro para rodar múltiplas vezes.
-- ============================================================

-- Webhook de saída: URL para onde o resultado das chamadas será enviado
ALTER TABLE public.dial_queues ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Webhook de entrada: secret para autenticar chamadas externas que inserem leads
ALTER TABLE public.lead_lists ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
