-- migration: call_records_timing
-- Adiciona campos de timing e custo detalhado ao call_records
ALTER TABLE call_records
  ADD COLUMN IF NOT EXISTS started_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS ended_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cost_breakdown JSONB NULL;
