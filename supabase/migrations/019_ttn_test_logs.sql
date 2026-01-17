-- 019 - TTN test logs (fields/api) per company

create table if not exists ttn_test_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  test_type text not null check (test_type in ('fields','api')),
  environment text not null check (environment in ('test','production')),
  success boolean not null default false,
  status_code integer,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists ttn_test_logs_company_id_idx on ttn_test_logs(company_id);
create index if not exists ttn_test_logs_created_at_idx on ttn_test_logs(created_at);

alter table ttn_test_logs enable row level security;

-- select logs if owner/admin of the company
create policy if not exists "ttn_test_logs_select" on ttn_test_logs
for select to authenticated
using (
  exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
  or exists(
    select 1 from memberships m
    where m.company_id = company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role in ('owner','admin')
  )
);

-- insert logs if owner/admin of the company
create policy if not exists "ttn_test_logs_insert" on ttn_test_logs
for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    exists(select 1 from companies c where c.id = company_id and c.owner_user_id = auth.uid())
    or exists(
      select 1 from memberships m
      where m.company_id = company_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('owner','admin')
    )
  )
);
