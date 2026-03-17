-- ============================================================
-- 001_initial.sql — Schema completo com RLS
-- IDEMPOTENTE: seguro para rodar múltiplas vezes.
-- Aplicar no Supabase SQL Editor ou via supabase db push
-- ============================================================

-- Extensão
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELAS (IF NOT EXISTS — seguro re-executar)
-- ============================================================

create table if not exists public.tenants (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  timezone    text        not null default 'America/Sao_Paulo',
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists memberships_user_id_idx      on public.memberships(user_id);
create index if not exists memberships_tenant_id_idx    on public.memberships(tenant_id);

create table if not exists public.vapi_connections (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  label                 text        not null,
  encrypted_private_key text        not null,
  is_active             boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists vapi_connections_tenant_active_idx on public.vapi_connections(tenant_id, is_active);

create table if not exists public.lead_lists (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists lead_lists_tenant_created_idx on public.lead_lists(tenant_id, created_at);

create table if not exists public.leads (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  lead_list_id     uuid        not null references public.lead_lists(id) on delete cascade,
  phone_e164       text        not null,
  data_json        jsonb       not null default '{}'::jsonb,
  status           text        not null check (status in (
                     'new','queued','calling','completed','failed',
                     'doNotCall','callbackScheduled'
                   )),
  attempt_count    int         not null default 0,
  last_attempt_at  timestamptz null,
  next_attempt_at  timestamptz null,
  last_outcome     text        null,
  created_at       timestamptz not null default now()
);
create index if not exists leads_tenant_list_status_idx      on public.leads(tenant_id, lead_list_id, status);
create index if not exists leads_tenant_status_next_idx      on public.leads(tenant_id, status, next_attempt_at);
create index if not exists leads_tenant_phone_idx            on public.leads(tenant_id, phone_e164);

create table if not exists public.dial_queues (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  name                  text        not null,
  assistant_id          text        not null,
  phone_number_id       text        not null,
  lead_list_id          uuid        not null references public.lead_lists(id) on delete cascade,
  status                text        not null check (status in ('draft','running','paused','stopped')),
  concurrency           int         not null default 3,
  max_attempts          int         not null default 3,
  retry_delay_minutes   int         not null default 30,
  allowed_days          jsonb       not null default '[1,2,3,4,5]'::jsonb,
  allowed_time_window   jsonb       not null default '{"start":"09:00","end":"18:00","timezone":"America/Sao_Paulo"}'::jsonb,
  created_at            timestamptz not null default now()
);
create index if not exists dial_queues_tenant_status_idx on public.dial_queues(tenant_id, status);

create table if not exists public.call_records (
  id              uuid              primary key default gen_random_uuid(),
  tenant_id       uuid              not null references public.tenants(id) on delete cascade,
  dial_queue_id   uuid              not null references public.dial_queues(id) on delete cascade,
  lead_id         uuid              not null references public.leads(id) on delete cascade,
  vapi_call_id    text              not null unique,
  status          text              null,
  ended_reason    text              null,
  cost            double precision  null,
  transcript      text              null,
  summary         text              null,
  created_at      timestamptz       not null default now()
);
create index if not exists call_records_tenant_queue_idx  on public.call_records(tenant_id, dial_queue_id, created_at);
create index if not exists call_records_tenant_lead_idx   on public.call_records(tenant_id, lead_id, created_at);
create index if not exists call_records_vapi_call_idx     on public.call_records(vapi_call_id);

create table if not exists public.callback_requests (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  lead_id         uuid        not null references public.leads(id) on delete cascade,
  dial_queue_id   uuid        not null references public.dial_queues(id) on delete cascade,
  requested_at    timestamptz not null default now(),
  callback_at     timestamptz not null,
  timezone        text        not null default 'America/Sao_Paulo',
  reason          text        null,
  source          text        not null check (source in ('assistant','human','api')),
  status          text        not null check (status in ('scheduled','done','canceled','expired')),
  vapi_call_id    text        null,
  created_at      timestamptz not null default now()
);
create index if not exists callback_req_tenant_queue_idx on public.callback_requests(tenant_id, dial_queue_id, status, callback_at);
create index if not exists callback_req_tenant_lead_idx  on public.callback_requests(tenant_id, lead_id, status);

-- ============================================================
-- RLS HELPER (CREATE OR REPLACE — sempre seguro)
-- ============================================================

create or replace function public.is_member_of_tenant(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = tid
      and m.user_id = auth.uid()
  );
$$;

-- ============================================================
-- ENABLE RLS (idempotente — seguro rodar várias vezes)
-- ============================================================

alter table public.tenants           enable row level security;
alter table public.memberships       enable row level security;
alter table public.vapi_connections  enable row level security;
alter table public.lead_lists        enable row level security;
alter table public.leads             enable row level security;
alter table public.dial_queues       enable row level security;
alter table public.call_records      enable row level security;
alter table public.callback_requests enable row level security;

-- ============================================================
-- POLICIES (DO block — cria somente se não existir)
-- ============================================================

do $$ begin

  -- tenants
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenants'
      and policyname = 'tenants_select_member'
  ) then
    execute 'create policy "tenants_select_member"
      on public.tenants for select
      using (public.is_member_of_tenant(id))';
  end if;

  -- memberships
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'memberships'
      and policyname = 'memberships_select_member'
  ) then
    execute 'create policy "memberships_select_member"
      on public.memberships for select
      using (public.is_member_of_tenant(tenant_id))';
  end if;

  -- vapi_connections
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vapi_connections'
      and policyname = 'vapi_connections_crud_member'
  ) then
    execute 'create policy "vapi_connections_crud_member"
      on public.vapi_connections for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

  -- lead_lists
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_lists'
      and policyname = 'lead_lists_crud_member'
  ) then
    execute 'create policy "lead_lists_crud_member"
      on public.lead_lists for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

  -- leads
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads'
      and policyname = 'leads_crud_member'
  ) then
    execute 'create policy "leads_crud_member"
      on public.leads for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

  -- dial_queues
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dial_queues'
      and policyname = 'dial_queues_crud_member'
  ) then
    execute 'create policy "dial_queues_crud_member"
      on public.dial_queues for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

  -- call_records
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'call_records'
      and policyname = 'call_records_crud_member'
  ) then
    execute 'create policy "call_records_crud_member"
      on public.call_records for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

  -- callback_requests
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'callback_requests'
      and policyname = 'callback_requests_crud_member'
  ) then
    execute 'create policy "callback_requests_crud_member"
      on public.callback_requests for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
  end if;

end $$;
