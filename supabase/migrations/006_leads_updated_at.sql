-- ============================================================
-- 006_leads_updated_at.sql
-- Adiciona coluna updated_at à tabela leads com trigger de
-- auto-atualização. O worker usa last_attempt_at para detectar
-- leads presos em "calling", mas updated_at é útil para
-- auditoria geral e queries de manutenção.
-- IDEMPOTENTE: seguro rodar múltiplas vezes
-- ============================================================

-- 1. Adicionar coluna updated_at (default = created_at para rows existentes)
alter table public.leads
  add column if not exists updated_at timestamptz not null default now();

-- 2. Função genérica de auto-update (reutilizável por outras tabelas)
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. Trigger na tabela leads
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- 4. Índice parcial para acelerar a query do recoverStaleCalls
--    (leads em "calling" com last_attempt_at antigo)
create index if not exists idx_leads_calling_last_attempt
  on public.leads (last_attempt_at)
  where status = 'calling';
