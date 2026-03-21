-- Adiciona limite de concorrência Vapi no nível do tenant (org-level concurrency)
-- Default 10 = não quebra nenhuma conexão existente.
-- O worker usa esse valor para distribuir slots entre campanhas ativas do mesmo tenant.
alter table public.vapi_connections
  add column if not exists concurrency_limit integer not null default 10;
