-- 009_group_invitations.sql
-- Invitations pour les groupes (team / accès au groupe)

create extension if not exists pgcrypto;

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid null references public.app_users(id) on delete set null,
  invited_by_user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  objective text,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_group_invitations_group_id on public.group_invitations(group_id);
create index if not exists idx_group_invitations_invited_email on public.group_invitations(invited_email);

-- updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_group_invitations_updated_at on public.group_invitations;
create trigger trg_group_invitations_updated_at
before update on public.group_invitations
for each row execute function public.set_updated_at();

alter table public.group_invitations enable row level security;

-- Policies:
-- 1) Sender (owner/admin of group) can read/create/revoke their invitations
drop policy if exists "group_inv_sender_read" on public.group_invitations;
create policy "group_inv_sender_read"
on public.group_invitations for select
using (
  invited_by_user_id = auth.uid()
  or exists (
    select 1 from public.group_members gm
    where gm.group_id = group_invitations.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
      and gm.is_active = true
  )
);

drop policy if exists "group_inv_sender_insert" on public.group_invitations;
create policy "group_inv_sender_insert"
on public.group_invitations for insert
with check (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = group_invitations.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner','admin')
      and gm.is_active = true
  )
);

-- 2) Recipient can read their invitations
drop policy if exists "group_inv_recipient_read" on public.group_invitations;
create policy "group_inv_recipient_read"
on public.group_invitations for select
using (lower(invited_email) = lower((select email from public.app_users where id = auth.uid())));

-- 3) Only server routes should update status; allow recipient/sender update limited fields (status/timestamps)
drop policy if exists "group_inv_update_limited" on public.group_invitations;
create policy "group_inv_update_limited"
on public.group_invitations for update
using (
  invited_by_user_id = auth.uid()
  or lower(invited_email) = lower((select email from public.app_users where id = auth.uid()))
)
with check (
  invited_by_user_id = invited_by_user_id
);

