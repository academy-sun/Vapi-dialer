-- migration: dial_queues_last_error
-- Adiciona coluna last_error para registrar motivo de pausa automática por erro de config
ALTER TABLE dial_queues
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
