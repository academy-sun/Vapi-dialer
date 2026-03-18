-- ============================================================
-- 004_call_duration_structured_outputs.sql
-- Adiciona duração da chamada e structured outputs ao call_records
-- IDEMPOTENTE: seguro rodar múltiplas vezes
-- ============================================================

-- Duração da chamada em segundos (vem do payload durationSeconds da Vapi)
alter table public.call_records
  add column if not exists duration_seconds double precision null;

-- Structured outputs do assistente Vapi (ex: { success: true, interest: "alto" })
alter table public.call_records
  add column if not exists structured_outputs jsonb null;

-- Índice para filtrar chamadas respondidas com duração curta
create index if not exists call_records_duration_idx
  on public.call_records(tenant_id, duration_seconds)
  where duration_seconds is not null;
