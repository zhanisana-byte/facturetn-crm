-- 014_group_access_policies.sql
-- Allow group Owner/Admin to READ companies/invoices/TTN of linked companies (internal/external)

-- =========================
-- Companies: select via group link
-- =========================
create policy if not exists "companies_select_via_group" on public.companies
for select to authenticated
using (
  exists (
    select 1
    from public.group_companies gc
    join public.groups g on g.id = gc.group_id
    left join public.group_members gm
      on gm.group_id = gc.group_id
      and gm.user_id = auth.uid()
      and gm.is_active = true
    where gc.company_id = companies.id
      and (
        g.owner_user_id = auth.uid()
        or gm.role = 'admin'
        or gm.role = 'owner'
      )
  )
);

-- =========================
-- Invoices: select via memberships
-- =========================
create policy if not exists "invoices_select_via_memberships" on public.invoices
for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = invoices.company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  )
);

-- Invoices: select via group link (owner/admin)
create policy if not exists "invoices_select_via_group" on public.invoices
for select to authenticated
using (
  exists (
    select 1
    from public.group_companies gc
    join public.groups g on g.id = gc.group_id
    left join public.group_members gm
      on gm.group_id = gc.group_id
      and gm.user_id = auth.uid()
      and gm.is_active = true
    where gc.company_id = invoices.company_id
      and (
        g.owner_user_id = auth.uid()
        or gm.role = 'admin'
        or gm.role = 'owner'
      )
  )
);

-- =========================
-- TTN credentials: select via memberships أو group
-- =========================
create policy if not exists "ttn_select_via_memberships" on public.ttn_credentials
for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.company_id = ttn_credentials.company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  )
);

create policy if not exists "ttn_select_via_group" on public.ttn_credentials
for select to authenticated
using (
  exists (
    select 1
    from public.group_companies gc
    join public.groups g on g.id = gc.group_id
    left join public.group_members gm
      on gm.group_id = gc.group_id
      and gm.user_id = auth.uid()
      and gm.is_active = true
    where gc.company_id = ttn_credentials.company_id
      and (
        g.owner_user_id = auth.uid()
        or gm.role = 'admin'
        or gm.role = 'owner'
      )
  )
);
