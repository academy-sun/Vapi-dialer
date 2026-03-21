-- ============================================================
-- 005_recording_url.sql
-- Adiciona URLs de gravação ao call_records
-- IDEMPOTENTE: seguro rodar múltiplas vezes
-- ============================================================

-- URL do áudio mono (MP3/WAV) enviado pelo Vapi no end-of-call-report
alter table public.call_records
  add column if not exists recording_url text null;

-- URL do áudio estéreo (separado por canal: AI / humano)
alter table public.call_records
  add column if not exists stereo_recording_url text null;
