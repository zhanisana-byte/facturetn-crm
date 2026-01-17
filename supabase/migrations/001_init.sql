-- FactureTN.com MVP schema (Postgres / Supabase)
-- NOTE: Exécute ceci dans Supabase SQL Editor

-- USERS PROFILE TABLE (linked to auth.users by id)
create table if not exists app_users (
  id uuid primary key,
  email text unique not null,
  full_name text,
  phone text,
  account_type text not null check (account_type in ('entreprise','multi_societe')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  plan_name text not null default 'trial',
  status text not null check (status in ('active','inactive','past_due','canceled')) default 'active',
  start_date date,
  end_date date,
  price_monthly numeric(12,3) default 0,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  pro_user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app_users(id) on delete cascade,
  client_id uuid null references clients(id) on delete set null,
  company_name text not null,
  legal_form text,
  tax_id text,
  rc text,
  address text,
  city text,
  governorate text,
  country text default 'TN',
  phone text,
  email text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ttn_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  ttn_key_name text,
  ttn_public_key text,
  ttn_secret text,
  ttn_extra jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  client_id uuid null references clients(id) on delete set null,
  invoice_type text not null check (invoice_type in ('invoice','credit_note')) default 'invoice',
  invoice_number text not null,
  issue_date date not null,
  due_date date,
  currency text not null default 'TND',
  reference text,
  notes text,
  customer_name text not null,
  customer_tax_id text,
  customer_address text,
  customer_email text,
  customer_phone text,

  subtotal_ht numeric(12,3) not null default 0,
  total_discount numeric(12,3) not null default 0,
  total_vat numeric(12,3) not null default 0,
  stamp_duty numeric(12,3) not null default 0,
  total_ttc numeric(12,3) not null default 0,
  net_to_pay numeric(12,3) not null default 0,

  status text not null default 'draft' check (status in ('draft','final','sent_ttn','accepted_ttn','rejected_ttn','canceled')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, invoice_number)
);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  line_no int not null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit text,
  unit_price_ht numeric(12,3) not null default 0,
  discount_pct numeric(6,3) not null default 0,
  vat_pct numeric(6,3) not null default 19,
  line_total_ht numeric(12,3) not null default 0,
  line_vat_amount numeric(12,3) not null default 0,
  line_total_ttc numeric(12,3) not null default 0
);

create table if not exists ttn_submissions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  status text not null check (status in ('pending','accepted','rejected','error')),
  ttn_reference text,
  error_code text,
  error_message text,
  payload_xml text,
  response_json jsonb
);

create table if not exists invoice_exports (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  export_type text not null check (export_type in ('docx','pdf','xml')),
  file_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- Dashboard views
create or replace view dashboard_monthly_global as
select
  c.owner_user_id as user_id,
  date_trunc('month', i.issue_date)::date as month,
  count(*) as invoices_count,
  sum(i.subtotal_ht) as sum_ht,
  sum(i.total_vat) as sum_vat,
  sum(i.total_ttc) as sum_ttc
from invoices i
join companies c on c.id = i.company_id
where i.status <> 'canceled'
group by c.owner_user_id, date_trunc('month', i.issue_date);

-- Minimal RLS (recommended): enable & add policies
alter table app_users enable row level security;
alter table companies enable row level security;
alter table ttn_credentials enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table clients enable row level security;

-- app_users: user can read/write own profile
create policy if not exists "app_users_select_own" on app_users for select
to authenticated using (id = auth.uid());
create policy if not exists "app_users_upsert_own" on app_users for insert
to authenticated with check (id = auth.uid());
create policy if not exists "app_users_update_own" on app_users for update
to authenticated using (id = auth.uid());

-- companies: owner can manage
create policy if not exists "companies_select_own" on companies for select
to authenticated using (owner_user_id = auth.uid());
create policy if not exists "companies_insert_own" on companies for insert
to authenticated with check (owner_user_id = auth.uid());
create policy if not exists "companies_update_own" on companies for update
to authenticated using (owner_user_id = auth.uid());
create policy if not exists "companies_delete_own" on companies for delete
to authenticated using (owner_user_id = auth.uid());

-- ttn_credentials: via company ownership
create policy if not exists "ttn_select_own" on ttn_credentials for select
to authenticated using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);
create policy if not exists "ttn_upsert_own" on ttn_credentials for insert
to authenticated with check (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);
create policy if not exists "ttn_update_own" on ttn_credentials for update
to authenticated using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);

-- invoices: via company ownership
create policy if not exists "invoices_select_own" on invoices for select
to authenticated using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);
create policy if not exists "invoices_insert_own" on invoices for insert
to authenticated with check (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);
create policy if not exists "invoices_update_own" on invoices for update
to authenticated using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);
create policy if not exists "invoices_delete_own" on invoices for delete
to authenticated using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
);

-- invoice_items: via invoice ownership
create policy if not exists "items_select_own" on invoice_items for select
to authenticated using (
  exists(
    select 1 from invoices i
    join companies c on c.id = i.company_id
    where i.id = invoice_id and c.owner_user_id = auth.uid()
  )
);
create policy if not exists "items_insert_own" on invoice_items for insert
to authenticated with check (
  exists(
    select 1 from invoices i
    join companies c on c.id = i.company_id
    where i.id = invoice_id and c.owner_user_id = auth.uid()
  )
);

-- clients: only for multi_societe users
create policy if not exists "clients_select_pro" on clients for select
to authenticated using (pro_user_id = auth.uid());
create policy if not exists "clients_insert_pro" on clients for insert
to authenticated with check (pro_user_id = auth.uid());
create policy if not exists "clients_update_pro" on clients for update
to authenticated using (pro_user_id = auth.uid());
create policy if not exists "clients_delete_pro" on clients for delete
to authenticated using (pro_user_id = auth.uid());
