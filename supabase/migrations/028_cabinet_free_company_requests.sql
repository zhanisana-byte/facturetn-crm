-- 028_cabinet_free_company_requests.sql
-- Demande : cabinet -> bénéficier d'une société gratuite (MF + ID société)

create table if not exists public.cabinet_free_company_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  mf text not null,
  company_id uuid not null references public.companies(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  admin_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cabinet_free_company_requests_user_idx on public.cabinet_free_company_requests(user_id);
create index if not exists cabinet_free_company_requests_group_idx on public.cabinet_free_company_requests(group_id);
create index if not exists cabinet_free_company_requests_company_idx on public.cabinet_free_company_requests(company_id);

alter table public.cabinet_free_company_requests enable row level security;

drop policy if exists "cfr_select_own" on public.cabinet_free_company_requests;
create policy "cfr_select_own"
on public.cabinet_free_company_requests
for select
using (auth.uid() = user_id);

drop policy if exists "cfr_insert_own" on public.cabinet_free_company_requests;
create policy "cfr_insert_own"
on public.cabinet_free_company_requests
for insert
with check (auth.uid() = user_id);

-- les utilisateurs ne peuvent pas modifier/supprimer (validation via PDG / service role)
