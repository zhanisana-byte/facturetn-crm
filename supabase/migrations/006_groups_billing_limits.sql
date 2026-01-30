-- 006_groups_billing_limits.sql
-- V24: abonnement au niveau du groupe + coordonnées de facturation + liaison sociétés

create extension if not exists pgcrypto;

-- -------------------------
-- GROUPS
-- -------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete cascade,
  group_name text not null,
  -- 'multi' = multi-sociétés, 'cabinet' = cabinet (si vous veux l'utiliser plus tard)
  group_type text not null default 'multi' check (group_type in ('multi','cabinet')),

  -- Billing identity (FactureTN SaaS invoice)
  billing_name text,
  billing_tax_id text,
  billing_address text,
  billing_email text,
  billing_phone text,

  -- Subscription billed at group level
  subscription_plan text not null default 'group',
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','expired','suspended')),
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,

  -- Company limit: NULL = unlimited
  companies_limit int null,

  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_groups_owner on public.groups(owner_user_id);

-- -------------------------
-- GROUP MEMBERS (optional, future)
-- -------------------------
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, user_id)
);

create index if not exists idx_group_members_group on public.group_members(group_id);
create index if not exists idx_group_members_user on public.group_members(user_id);

-- -------------------------
-- GROUP ↔ COMPANIES LINK
-- -------------------------
create table if not exists public.group_companies (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  added_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(group_id, company_id)
);

create index if not exists idx_group_companies_group on public.group_companies(group_id);
create index if not exists idx_group_companies_company on public.group_companies(company_id);

-- updated_at triggers (reuse helper if exists)
do $$
begin
  perform 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if found then
    drop trigger if exists trg_groups_updated_at on public.groups;
    create trigger trg_groups_updated_at
    before update on public.groups
    for each row execute function public.set_updated_at();

    drop trigger if exists trg_group_members_updated_at on public.group_members;
    create trigger trg_group_members_updated_at
    before update on public.group_members
    for each row execute function public.set_updated_at();
  end if;
exception when others then
  -- ignore
end $$;
