-- 032: Adiciona suporte a registros de falha de dispatch
-- Resolve discrepancia entre leads concluidos e chamadas registradas.
-- Quando o dispatch falha (telefone invalido, SIP 503, erro API), um call_record
-- "fantasma" e criado para manter a rastreabilidade 1:1.

-- Flag para diferenciar falhas de dispatch de chamadas reais
ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS is_dispatch_failure BOOLEAN NOT NULL DEFAULT false;

-- Coluna ended_reason tambem precisa aceitar valores de dispatch
-- (ja e text, nao precisa alterar tipo)

-- Index para queries que filtram ou excluem falhas de dispatch
CREATE INDEX IF NOT EXISTS idx_cr_dispatch_failure
  ON public.call_records(tenant_id, is_dispatch_failure)
  WHERE is_dispatch_failure = true;

-- Atualizar call_records_flat para incluir a coluna (se existir como tabela)
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS is_dispatch_failure BOOLEAN NOT NULL DEFAULT false;

-- Atualizar a funcao de upsert para propagar is_dispatch_failure
-- (A trigger existente usa ON CONFLICT DO UPDATE, entao precisamos
-- garantir que a coluna nova e copiada)

COMMENT ON COLUMN public.call_records.is_dispatch_failure IS
  'true quando o registro foi criado por falha de dispatch (sem chamada real na Vapi)';
