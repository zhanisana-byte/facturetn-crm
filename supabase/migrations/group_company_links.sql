-- 013_group_company_links.sql
-- Adds link_type to group_companies and introduces invitations for external companies in groups.

alter table if exists public.group_companies
  add column if not exists link_type text not null default 'internal'
    check (link_type in ('internal','external'));

-- Convenience view requested: group_company_links
create or replace view public.group_company_links as
select
  id,
  group_id,
  company_id,
  link_type,
  added_by_user_id,
  created_at
from public.group_companies;

-- Invitations for linking an external company to a group
create table if not exists public.group_company_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  invited_email text not null,
  invited_user_id uuid references public.app_users(id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending','accepted','declined','revoked')),

  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,

  unique(group_id, company_id, invited_email)
);

create index if not exists idx_gci_group on public.group_company_invitations(group_id);
create index if not exists idx_gci_company on public.group_company_invitations(company_id);
create index if not exists idx_gci_invited_email on public.group_company_invitations(invited_email);

alter table public.group_company_invitations enable row level security;

-- Basic RLS:
-- - Group owners/admins can create/cancel invitations for their group
-- - Invited users (by email) can read and accept/decline
do $$
begin
  -- policies are idempotent via drop/create
  drop policy if exists "gci_read_invited" on public.group_company_invitations;
  create policy "gci_read_invited" on public.group_company_invitations
    for select
    using (
      lower(invited_email) = lower((auth.jwt() ->> 'email')::text)
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = group_company_invitations.group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.groups g
        where g.id = group_company_invitations.group_id
          and g.owner_user_id = auth.uid()
      )
    );

  drop policy if exists "gci_insert_group_admin" on public.group_company_invitations;
  create policy "gci_insert_group_admin" on public.group_company_invitations
    for insert
    with check (
      exists (
        select 1 from public.group_members gm
        where gm.group_id = group_company_invitations.group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.groups g
        where g.id = group_company_invitations.group_id
          and g.owner_user_id = auth.uid()
      )
    );

  drop policy if exists "gci_update_group_admin_or_invited" on public.group_company_invitations;
  create policy "gci_update_group_admin_or_invited" on public.group_company_invitations
    for update
    using (
      lower(invited_email) = lower((auth.jwt() ->> 'email')::text)
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = group_company_invitations.group_id
          and gm.user_id = auth.uid()
          and gm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.groups g
        where g.id = group_company_invitations.group_id
          and g.owner_user_id = auth.uid()
      )
    )
    with check (true);
end$$;
