-- 004_invites.sql — Sistema de convites por email
create table if not exists public.tenant_invites (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  email       text        not null,
  role        text        not null default 'member' check (role in ('admin','member')),
  invited_by  uuid        not null references auth.users(id),
  token       text        not null unique default encode(gen_random_bytes(32), 'hex'),
  accepted_at timestamptz null,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

create index if not exists tenant_invites_token_idx    on public.tenant_invites(token);
create index if not exists tenant_invites_email_idx    on public.tenant_invites(email);
create index if not exists tenant_invites_tenant_idx   on public.tenant_invites(tenant_id);

alter table public.tenant_invites enable row level security;

-- Só owner/admin do tenant vê os convites
create policy "invites_select_admin"
  on public.tenant_invites for select
  using (public.is_member_of_tenant(tenant_id));

-- Só owner/admin pode criar convites (validação adicional na API route)
create policy "invites_insert_admin"
  on public.tenant_invites for insert
  with check (public.is_member_of_tenant(tenant_id));
