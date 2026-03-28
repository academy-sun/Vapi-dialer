-- Adiciona ticket médio por campanha para cálculo de impacto financeiro no Dossiê 2.0
ALTER TABLE dial_queues
  ADD COLUMN IF NOT EXISTS avg_deal_value DECIMAL(10,2);
