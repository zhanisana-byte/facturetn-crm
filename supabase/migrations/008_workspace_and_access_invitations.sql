-- 008_workspace_and_access_invitations.sql
-- Workspace + Invitations (required by app routes)

create extension if not exists pgcrypto;

-- ============
-- Workspace
-- ============
create table if not exists public.user_workspace (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  active_mode text not null default 'profil' check (active_mode in ('profil','entreprise','comptable','multi_societe')),
  active_company_id uuid null references public.companies(id) on delete set null,
  active_group_id uuid null references public.groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_workspace_updated_at on public.user_workspace;
do $$ begin
  perform 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if found then
    create trigger trg_user_workspace_updated_at
    before update on public.user_workspace
    for each row execute function public.set_updated_at();
  end if;
exception when others then null; end $$;

alter table public.user_workspace enable row level security;

drop policy if exists "user_workspace_select_own" on public.user_workspace;
create policy "user_workspace_select_own" on public.user_workspace
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "user_workspace_upsert_own" on public.user_workspace;
create policy "user_workspace_upsert_own" on public.user_workspace
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_workspace_update_own" on public.user_workspace;
create policy "user_workspace_update_own" on public.user_workspace
for update to authenticated
using (user_id = auth.uid());

-- ensure a row exists for each user
create or replace function public.ensure_user_workspace()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_workspace (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_user_workspace on public.app_users;
create trigger trg_ensure_user_workspace
after insert on public.app_users
for each row execute function public.ensure_user_workspace();

-- ============
-- Invitations
-- ============
create table if not exists public.access_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid null references public.app_users(id) on delete set null,
  invited_by_user_id uuid not null references public.app_users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  objective text,
  can_manage_customers boolean not null default false,
  can_create_invoices boolean not null default false,
  can_validate_invoices boolean not null default false,
  can_submit_ttn boolean not null default false,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_access_invitations_company on public.access_invitations(company_id);
create index if not exists idx_access_invitations_invited_email on public.access_invitations(invited_email);
create index if not exists idx_access_invitations_invited_by on public.access_invitations(invited_by_user_id);

-- updated_at

drop trigger if exists trg_access_invitations_updated_at on public.access_invitations;
do $$ begin
  perform 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if found then
    create trigger trg_access_invitations_updated_at
    before update on public.access_invitations
    for each row execute function public.set_updated_at();
  end if;
exception when others then null; end $$;

alter table public.access_invitations enable row level security;

-- helpers
create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select coalesce(
    (select email from public.app_users where id = auth.uid()),
    ''
  );
$$;

-- SELECT: sender or recipient

drop policy if exists "access_invitations_select" on public.access_invitations;
create policy "access_invitations_select" on public.access_invitations
for select to authenticated
using (
  invited_by_user_id = auth.uid()
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(public.current_user_email())
);

-- INSERT: must be sender + must have membership on the company

drop policy if exists "access_invitations_insert" on public.access_invitations;
create policy "access_invitations_insert" on public.access_invitations
for insert to authenticated
with check (
  invited_by_user_id = auth.uid()
  and exists(
    select 1 from public.memberships m
    where m.company_id = access_invitations.company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role in ('owner','accountant')
  )
);

-- UPDATE: sender or recipient

drop policy if exists "access_invitations_update" on public.access_invitations;
create policy "access_invitations_update" on public.access_invitations
for update to authenticated
using (
  invited_by_user_id = auth.uid()
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(public.current_user_email())
);

-- DELETE: only sender

drop policy if exists "access_invitations_delete" on public.access_invitations;
create policy "access_invitations_delete" on public.access_invitations
for delete to authenticated
using (invited_by_user_id = auth.uid());
