-- Migration 011: limite diário de tentativas por campanha
-- Adiciona max_daily_attempts à tabela dial_queues.
-- 0 = sem limite (comportamento atual, retrocompatível).

alter table public.dial_queues
  add column if not exists max_daily_attempts int not null default 0;

comment on column public.dial_queues.max_daily_attempts
  is 'Máximo de tentativas de ligação por dia por lead. 0 = sem limite.';
