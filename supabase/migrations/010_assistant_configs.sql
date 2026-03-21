-- ============================================================
-- Migration 010: assistant_configs
-- Critério de sucesso por assistente (substitui vapi_connections.success_field)
-- ============================================================

-- 1. Tabela principal
create table if not exists public.assistant_configs (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  assistant_id  text        not null,        -- Vapi assistant ID
  name          text,                        -- label legível (ex: "Agente Imobiliária")
  success_field text,                        -- campo no structured_output que indica sucesso
  success_value text,                        -- valor esperado nesse campo (ex: "sim")
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(tenant_id, assistant_id)
);

create index if not exists assistant_configs_tenant_idx
  on public.assistant_configs(tenant_id, assistant_id);

-- 2. Seed: migrar dados existentes de vapi_connections → assistant_configs
--    Condições: precisa ter assistant_id E success_field preenchidos
--    ON CONFLICT DO NOTHING = idempotente (pode rodar mais de uma vez com segurança)
insert into public.assistant_configs (tenant_id, assistant_id, success_field, success_value)
select
  tenant_id,
  assistant_id,
  success_field,
  coalesce(success_value, 'sim')
from public.vapi_connections
where assistant_id  is not null
  and success_field is not null
  and is_active = true
on conflict (tenant_id, assistant_id) do nothing;

-- 3. vapi_connections.success_field e success_value ficam como fallback (deprecated)
--    NÃO são removidos nessa migration — o código fará fallback para eles
--    enquanto os tenants não configurarem assistant_configs.
