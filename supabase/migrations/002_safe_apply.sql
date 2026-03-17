-- ============================================================
-- 002_safe_apply.sql
-- Rode este script se as tabelas já existem e você só precisa
-- garantir que RLS, políticas e indexes estão configurados.
-- SEGURO para rodar múltiplas vezes em um banco já existente.
-- ============================================================

-- ── 1. Função helper (CREATE OR REPLACE — sempre seguro) ──────────

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

-- ── 2. Ativar RLS (idempotente — não falha se já ativo) ───────────

alter table public.tenants           enable row level security;
alter table public.memberships       enable row level security;
alter table public.vapi_connections  enable row level security;
alter table public.lead_lists        enable row level security;
alter table public.leads             enable row level security;
alter table public.dial_queues       enable row level security;
alter table public.call_records      enable row level security;
alter table public.callback_requests enable row level security;

-- ── 3. Indexes adicionais do worker (se não existirem) ────────────

create index if not exists leads_tenant_status_next_idx
  on public.leads(tenant_id, status, next_attempt_at);

create index if not exists leads_tenant_phone_idx
  on public.leads(tenant_id, phone_e164);

create index if not exists call_records_vapi_call_idx
  on public.call_records(vapi_call_id);

-- ── 4. Políticas RLS (cria somente se não existir) ────────────────

do $$ begin

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tenants'
      and policyname = 'tenants_select_member'
  ) then
    execute 'create policy "tenants_select_member"
      on public.tenants for select
      using (public.is_member_of_tenant(id))';
    raise notice 'Política tenants_select_member criada.';
  else
    raise notice 'Política tenants_select_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'memberships'
      and policyname = 'memberships_select_member'
  ) then
    execute 'create policy "memberships_select_member"
      on public.memberships for select
      using (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política memberships_select_member criada.';
  else
    raise notice 'Política memberships_select_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vapi_connections'
      and policyname = 'vapi_connections_crud_member'
  ) then
    execute 'create policy "vapi_connections_crud_member"
      on public.vapi_connections for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política vapi_connections_crud_member criada.';
  else
    raise notice 'Política vapi_connections_crud_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lead_lists'
      and policyname = 'lead_lists_crud_member'
  ) then
    execute 'create policy "lead_lists_crud_member"
      on public.lead_lists for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política lead_lists_crud_member criada.';
  else
    raise notice 'Política lead_lists_crud_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leads'
      and policyname = 'leads_crud_member'
  ) then
    execute 'create policy "leads_crud_member"
      on public.leads for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política leads_crud_member criada.';
  else
    raise notice 'Política leads_crud_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dial_queues'
      and policyname = 'dial_queues_crud_member'
  ) then
    execute 'create policy "dial_queues_crud_member"
      on public.dial_queues for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política dial_queues_crud_member criada.';
  else
    raise notice 'Política dial_queues_crud_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'call_records'
      and policyname = 'call_records_crud_member'
  ) then
    execute 'create policy "call_records_crud_member"
      on public.call_records for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política call_records_crud_member criada.';
  else
    raise notice 'Política call_records_crud_member já existe — pulando.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'callback_requests'
      and policyname = 'callback_requests_crud_member'
  ) then
    execute 'create policy "callback_requests_crud_member"
      on public.callback_requests for all
      using (public.is_member_of_tenant(tenant_id))
      with check (public.is_member_of_tenant(tenant_id))';
    raise notice 'Política callback_requests_crud_member criada.';
  else
    raise notice 'Política callback_requests_crud_member já existe — pulando.';
  end if;

end $$;

-- ── 5. Verificação final ──────────────────────────────────────────
-- Rode isto para confirmar que tudo está OK:
select
  tablename,
  rowsecurity as rls_ativo,
  (select count(*) from pg_policies p
   where p.schemaname = 'public' and p.tablename = t.tablename) as total_policies
from pg_tables t
where schemaname = 'public'
  and tablename in (
    'tenants','memberships','vapi_connections',
    'lead_lists','leads','dial_queues',
    'call_records','callback_requests'
  )
order by tablename;
