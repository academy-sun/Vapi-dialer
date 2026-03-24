-- migration: leads_phone_unique
-- Garante que o mesmo telefone não pode aparecer duas vezes na mesma lista de leads.
-- Antes de criar a constraint, remove duplicatas mantendo o registro mais recente.

-- 1. Remover duplicatas (mantém o created_at mais recente)
DELETE FROM leads a
USING leads b
WHERE a.created_at < b.created_at
  AND a.phone_e164 = b.phone_e164
  AND a.lead_list_id = b.lead_list_id;

-- 2. Adicionar constraint UNIQUE (se ainda não existir)
-- PostgreSQL não suporta "ADD CONSTRAINT IF NOT EXISTS" — usar bloco DO para checar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_phone_list_unique'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_phone_list_unique
      UNIQUE (phone_e164, lead_list_id);
  END IF;
END
$$;
