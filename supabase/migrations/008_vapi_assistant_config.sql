-- Add assistant config to vapi_connections
alter table public.vapi_connections
  add column if not exists assistant_id   text,
  add column if not exists success_field  text,
  add column if not exists success_value  text;

-- Snapshot table for assistant version history
create table if not exists public.assistant_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  assistant_id  text        not null,
  snapshot_json jsonb       not null,
  created_at    timestamptz not null default now()
);

create index if not exists assistant_snapshots_tenant_idx on public.assistant_snapshots(tenant_id, assistant_id, created_at desc);
