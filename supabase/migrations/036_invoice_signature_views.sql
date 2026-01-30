-- Invoice signature view proof (DSS/DigiGo requirement)
create table if not exists public.invoice_signature_views (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  viewed_by uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (invoice_id, viewed_by)
);

alter table public.invoice_signature_views enable row level security;

drop policy if exists "inv_sig_views_select" on public.invoice_signature_views;
create policy "inv_sig_views_select"
on public.invoice_signature_views for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "inv_sig_views_insert" on public.invoice_signature_views;
create policy "inv_sig_views_insert"
on public.invoice_signature_views for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.company_id = invoice_signature_views.company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and (m.can_submit_ttn = true or m.can_create_invoices = true or m.role = 'owner')
  )
);

-- Recommended grants (avoid "permission denied" when RLS allows)
grant select, insert on public.invoice_signature_views to authenticated;
