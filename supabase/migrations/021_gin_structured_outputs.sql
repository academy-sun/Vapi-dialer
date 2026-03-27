-- ============================================================
-- 021_gin_structured_outputs.sql
--
-- Adiciona índice GIN no campo structured_outputs (JSONB) da
-- tabela call_records.
--
-- Benefícios:
--   • Queries por campo específico dentro do JSONB ficam rápidas
--     sem precisar varrer todas as linhas (full table scan).
--   • Exemplo de query que passa a usar o índice:
--       WHERE structured_outputs @> '{"interesse": "Com interesse"}'
--   • Usado pelo Dossiê Comercial, Analytics e filtros futuros.
--
-- Obs: índices GIN podem ser criados com CONCURRENTLY no banco
-- de produção para não bloquear escritas durante a criação.
-- No Supabase SQL Editor use a versão sem CONCURRENTLY (abaixo).
-- ============================================================

CREATE INDEX IF NOT EXISTS call_records_structured_outputs_gin
ON public.call_records
USING gin (structured_outputs jsonb_path_ops);

-- jsonb_path_ops: menor que o gin padrão, mas cobre o operador
-- @> (containment) que é o mais usado em filtros por campo.
-- Se precisar do operador ? (key exists), trocar por gin(structured_outputs).
