-- migration: fix_daily_attempt_limit
-- Corrige campanhas com max_daily_attempts inválido (0 ou NULL).
-- Regra de negócio: o campo é obrigatório, mínimo 1, máximo 10.
--
-- Para campanhas que tinham 0 (= "sem limite" no design original),
-- usamos LEAST(max_attempts, 10) como valor — isso preserva o comportamento
-- mais próximo do original: pode fazer até o total de tentativas em um dia.

UPDATE dial_queues
SET max_daily_attempts = GREATEST(1, LEAST(max_attempts, 10))
WHERE max_daily_attempts IS NULL OR max_daily_attempts < 1;

-- Truncar valores acima do máximo permitido (defensivo)
UPDATE dial_queues
SET max_daily_attempts = 10
WHERE max_daily_attempts > 10;
