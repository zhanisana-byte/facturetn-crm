-- =========================================
-- FactureTN ZIP1 - INIT (Supabase/Postgres)
-- =========================================

-- EXTENSIONS (Supabase usually has these)
create extension if not exists pgcrypto;

-- -------------------------
-- TYPES
-- -------------------------
do $$ begin
  create type public.membership_role as enum ('owner','accountant','staff','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reset_scope as enum ('year','month','never');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum (
    'draft',
    'validated',
    'ready_to_send',
    'sent_ttn',
    'accepted_ttn',
    'rejected_ttn',
    'canceled'
  );
exception when duplicate_object then null; end $$;

-- -------------------------
-- updated_at helper
-- -------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------
-- USERS
-- -------------------------
create table if not exists public.app_users (
  id uuid primary key,
  email text not null unique,
  full_name text,
  role text not null default 'user' check (role in ('user','admin')),
  account_type text not null default 'entreprise' check (account_type in ('entreprise','multi_societe','comptable')),
  is_active boolean not null default true,
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

-- Auto-create app_users row on auth.users insert
create or replace function public.ensure_app_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.app_users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.app_users.full_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ensure_app_user on auth.users;
create trigger trg_ensure_app_user
after insert on auth.users
for each row execute function public.ensure_app_user();

-- -------------------------
-- COMPANIES + SETTINGS
-- -------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  tax_id text,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  default_stamp_enabled boolean not null default false,
  default_stamp_amount numeric not null default 1.000,
  require_accountant_validation_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at
before update on public.company_settings
for each row execute function public.set_updated_at();

-- -------------------------
-- MEMBERSHIPS (roles/permissions)
-- -------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  can_manage_customers boolean not null default false,
  can_create_invoices boolean not null default false,
  can_validate_invoices boolean not null default false,
  can_submit_ttn boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_company on public.memberships(company_id);

drop trigger if exists trg_memberships_updated_at on public.memberships;
create trigger trg_memberships_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

-- -------------------------
-- CUSTOMERS
-- -------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  tax_id text,
  address text,
  phone text,
  email text,
  default_vat_pct numeric not null default 19.000,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_company on public.customers(company_id);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

-- -------------------------
-- NUMBERING RULES + COUNTERS
-- -------------------------
create table if not exists public.invoice_numbering_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_name text not null,
  prefix text not null default 'FV',
  reset_scope public.reset_scope not null default 'year',
  seq_padding int not null default 6,
  separator text not null default '-',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rules_company on public.invoice_numbering_rules(company_id);
create unique index if not exists uq_rule_default_per_company
on public.invoice_numbering_rules(company_id)
where is_default = true;

drop trigger if exists trg_rules_updated_at on public.invoice_numbering_rules;
create trigger trg_rules_updated_at
before update on public.invoice_numbering_rules
for each row execute function public.set_updated_at();

create table if not exists public.invoice_counters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_id uuid not null references public.invoice_numbering_rules(id) on delete cascade,
  scope_key text not null,
  last_number int not null default 0,
  updated_at timestamptz not null default now(),
  unique(company_id, rule_id, scope_key)
);

create index if not exists idx_counters_company on public.invoice_counters(company_id);
create index if not exists idx_counters_rule on public.invoice_counters(rule_id);

drop trigger if exists trg_counters_updated_at on public.invoice_counters;
create trigger trg_counters_updated_at
before update on public.invoice_counters
for each row execute function public.set_updated_at();

-- -------------------------
-- INVOICES + ITEMS
-- -------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'TND',
  invoice_number text,
  numbering_rule_id uuid references public.invoice_numbering_rules(id) on delete set null,
  notes text,

  subtotal_ht numeric not null default 0,
  total_vat numeric not null default 0,
  total_ttc numeric not null default 0,
  stamp_enabled boolean not null default false,
  stamp_amount numeric not null default 0,
  net_to_pay numeric not null default 0,

  require_accountant_validation boolean not null default false,
  accountant_validated_by uuid references public.app_users(id) on delete set null,
  accountant_validated_at timestamptz,

  status public.invoice_status not null default 'draft',
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_company on public.invoices(company_id);
create index if not exists idx_invoices_customer on public.invoices(customer_id);
create index if not exists idx_invoices_status on public.invoices(status);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_no int not null,
  description text not null,
  quantity numeric not null default 1,
  unit_price_ht numeric not null default 0,
  discount_pct numeric not null default 0,
  vat_pct numeric not null default 19.000,
  line_total_ht numeric not null default 0,
  line_vat_amount numeric not null default 0,
  line_total_ttc numeric not null default 0,
  unique(invoice_id, line_no)
);

create index if not exists idx_items_invoice on public.invoice_items(invoice_id);

-- -------------------------
-- TOTALS AUTO-CALC
-- -------------------------
create or replace function public.compute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric := 0;
  v_vat numeric := 0;
  v_ttc numeric := 0;
  v_stamp_enabled boolean;
  v_stamp_amount numeric;
begin
  update public.invoice_items i
  set
    line_total_ht = round((i.quantity * i.unit_price_ht) * (1 - (i.discount_pct/100)), 3),
    line_vat_amount = round(((i.quantity * i.unit_price_ht) * (1 - (i.discount_pct/100))) * (i.vat_pct/100), 3),
    line_total_ttc = round(
      ((i.quantity * i.unit_price_ht) * (1 - (i.discount_pct/100))) +
      (((i.quantity * i.unit_price_ht) * (1 - (i.discount_pct/100))) * (i.vat_pct/100)),
      3
    )
  where i.invoice_id = p_invoice_id;

  select
    coalesce(sum(line_total_ht),0),
    coalesce(sum(line_vat_amount),0),
    coalesce(sum(line_total_ttc),0)
  into v_subtotal, v_vat, v_ttc
  from public.invoice_items
  where invoice_id = p_invoice_id;

  select stamp_enabled, stamp_amount
  into v_stamp_enabled, v_stamp_amount
  from public.invoices
  where id = p_invoice_id;

  update public.invoices
  set
    subtotal_ht = v_subtotal,
    total_vat = v_vat,
    total_ttc = v_ttc,
    net_to_pay = round(v_ttc + (case when v_stamp_enabled then v_stamp_amount else 0 end), 3),
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

create or replace function public.trg_recalc_invoice_totals()
returns trigger
language plpgsql
as $$
begin
  perform public.compute_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_items_recalc on public.invoice_items;
create trigger trg_items_recalc
after insert or update or delete on public.invoice_items
for each row execute function public.trg_recalc_invoice_totals();

-- Guard: ready_to_send requires accountant validation when required
alter table public.invoices drop constraint if exists chk_accountant_validation_before_ready;
alter table public.invoices
add constraint chk_accountant_validation_before_ready
check (
  status <> 'ready_to_send'
  or require_accountant_validation = false
  or (accountant_validated_by is not null and accountant_validated_at is not null)
);

-- -------------------------
-- RLS HELPERS
-- -------------------------
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

-- -------------------------
-- RPC: Create company + settings + owner membership
-- -------------------------
create or replace function public.create_company_with_owner(
  p_company_name text,
  p_tax_id text default null,
  p_address text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.companies(company_name, tax_id, address, phone, email)
  values (p_company_name, p_tax_id, p_address, p_phone, p_email)
  returning id into v_company_id;

  insert into public.company_settings(company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  insert into public.memberships(
    company_id, user_id, role,
    can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn,
    is_active
  )
  values (
    v_company_id, auth.uid(), 'owner',
    true, true, true, true,
    true
  )
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    can_manage_customers = true,
    can_create_invoices = true,
    can_validate_invoices = true,
    can_submit_ttn = true,
    is_active = true,
    updated_at = now();

  return v_company_id;
end;
$$;

-- -------------------------
-- RLS POLICIES
-- -------------------------

-- app_users
alter table public.app_users enable row level security;

drop policy if exists "app_users_self_select" on public.app_users;
create policy "app_users_self_select"
on public.app_users for select
to authenticated
using (id = auth.uid());

drop policy if exists "app_users_self_update" on public.app_users;
create policy "app_users_self_update"
on public.app_users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- companies
alter table public.companies enable row level security;

drop policy if exists "companies_member_select" on public.companies;
create policy "companies_member_select"
on public.companies for select
to authenticated
using (public.is_company_member(id));

-- Disallow direct insert (use RPC)
drop policy if exists "companies_no_direct_insert" on public.companies;
create policy "companies_no_direct_insert"
on public.companies for insert
to authenticated
with check (false);

-- company_settings
alter table public.company_settings enable row level security;

drop policy if exists "company_settings_member_select" on public.company_settings;
create policy "company_settings_member_select"
on public.company_settings for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "company_settings_owner_update" on public.company_settings;
create policy "company_settings_owner_update"
on public.company_settings for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = company_id
      and m.user_id = auth.uid()
      and m.role in ('owner','accountant')
      and m.is_active = true
  )
)
with check (true);

-- memberships
alter table public.memberships enable row level security;

drop policy if exists "memberships_company_select" on public.memberships;
create policy "memberships_company_select"
on public.memberships for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "memberships_owner_manage_insert" on public.memberships;
create policy "memberships_owner_manage_insert"
on public.memberships for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.company_id = memberships.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner','accountant')
      and m.is_active = true
  )
);

drop policy if exists "memberships_owner_manage_update" on public.memberships;
create policy "memberships_owner_manage_update"
on public.memberships for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = memberships.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner','accountant')
      and m.is_active = true
  )
)
with check (true);

-- customers
alter table public.customers enable row level security;

drop policy if exists "customers_member_select" on public.customers;
create policy "customers_member_select"
on public.customers for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "customers_can_manage_insert" on public.customers;
create policy "customers_can_manage_insert"
on public.customers for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.company_id = customers.company_id
      and m.user_id = auth.uid()
      and m.can_manage_customers = true
      and m.is_active = true
  )
);

drop policy if exists "customers_can_manage_update" on public.customers;
create policy "customers_can_manage_update"
on public.customers for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = customers.company_id
      and m.user_id = auth.uid()
      and m.can_manage_customers = true
      and m.is_active = true
  )
)
with check (true);

-- invoices
alter table public.invoices enable row level security;

drop policy if exists "invoices_member_select" on public.invoices;
create policy "invoices_member_select"
on public.invoices for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "invoices_can_create_insert" on public.invoices;
create policy "invoices_can_create_insert"
on public.invoices for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.company_id = invoices.company_id
      and m.user_id = auth.uid()
      and m.can_create_invoices = true
      and m.is_active = true
  )
);

drop policy if exists "invoices_can_create_update" on public.invoices;
create policy "invoices_can_create_update"
on public.invoices for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = invoices.company_id
      and m.user_id = auth.uid()
      and m.can_create_invoices = true
      and m.is_active = true
  )
)
with check (true);

-- invoice_items
alter table public.invoice_items enable row level security;

drop policy if exists "items_invoice_member_select" on public.invoice_items;
create policy "items_invoice_member_select"
on public.invoice_items for select
to authenticated
using (
  exists (
    select 1 from public.invoices inv
    where inv.id = invoice_items.invoice_id
      and public.is_company_member(inv.company_id)
  )
);

drop policy if exists "items_can_write_insert" on public.invoice_items;
create policy "items_can_write_insert"
on public.invoice_items for insert
to authenticated
with check (
  exists (
    select 1 from public.invoices inv
    join public.memberships m on m.company_id = inv.company_id
    where inv.id = invoice_items.invoice_id
      and m.user_id = auth.uid()
      and m.can_create_invoices = true
      and m.is_active = true
  )
);

drop policy if exists "items_can_write_update" on public.invoice_items;
create policy "items_can_write_update"
on public.invoice_items for update
to authenticated
using (
  exists (
    select 1 from public.invoices inv
    join public.memberships m on m.company_id = inv.company_id
    where inv.id = invoice_items.invoice_id
      and m.user_id = auth.uid()
      and m.can_create_invoices = true
      and m.is_active = true
  )
)
with check (true);

drop policy if exists "items_can_delete" on public.invoice_items;
create policy "items_can_delete"
on public.invoice_items for delete
to authenticated
using (
  exists (
    select 1 from public.invoices inv
    join public.memberships m on m.company_id = inv.company_id
    where inv.id = invoice_items.invoice_id
      and m.user_id = auth.uid()
      and m.can_create_invoices = true
      and m.is_active = true
  )
);
