-- =========================================
-- FactureTN ZIP7 - Cabinet team + Assignations
-- =========================================

create extension if not exists pgcrypto;

-- Team members (owned by cabinet owner user)
create table if not exists public.accountant_team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete cascade,
  staff_user_id uuid references public.app_users(id) on delete set null,
  staff_email text not null,
  full_name text,
  can_manage_customers boolean not null default false,
  can_create_invoices boolean not null default false,
  can_validate_invoices boolean not null default false,
  can_submit_ttn boolean not null default false,
  status text not null default 'active' check (status in ('pending','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, staff_email)
);

create index if not exists idx_accountant_team_owner on public.accountant_team_members(owner_user_id);
create index if not exists idx_accountant_team_staff on public.accountant_team_members(staff_user_id);

-- Client assignments (who handles which client company)
create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.app_users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_user_id uuid not null references public.app_users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, company_id, staff_user_id)
);

create index if not exists idx_client_assignments_owner on public.client_assignments(owner_user_id);
create index if not exists idx_client_assignments_staff on public.client_assignments(staff_user_id);
create index if not exists idx_client_assignments_company on public.client_assignments(company_id);

-- updated_at triggers (reuse existing helper if present)
do $$ begin
  perform 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace;
  if found then
    drop trigger if exists trg_accountant_team_members_updated_at on public.accountant_team_members;
    create trigger trg_accountant_team_members_updated_at
    before update on public.accountant_team_members
    for each row execute function public.set_updated_at();

    drop trigger if exists trg_client_assignments_updated_at on public.client_assignments;
    create trigger trg_client_assignments_updated_at
    before update on public.client_assignments
    for each row execute function public.set_updated_at();
  end if;
exception when others then
  -- ignore
end $$;
