-- Sinaliza calls encerradas por detecção automática de caixa postal / URA.
-- Usado para separar essas calls das conversas reais nas métricas.
ALTER TABLE call_records
  ADD COLUMN IF NOT EXISTS machine_detected boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_call_records_machine_detected
  ON call_records (machine_detected)
  WHERE machine_detected = true;
