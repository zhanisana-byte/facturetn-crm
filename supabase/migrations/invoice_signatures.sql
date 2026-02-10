-- v32: Stockage XML TEIF signé (multi-providers)
--
-- Objectif: permettre le téléchargement du XML TEIF signé et
-- bloquer l'envoi TTN tant que la signature n'existe pas (si requis).
--
-- IMPORTANT: aucune clé privée / PIN / secret matériel n'est stocké.

create table if not exists public.invoice_signatures (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  environment text not null default 'production' check (environment in ('production','test')),
  provider text not null default 'none',
  signed_xml text not null,
  signed_at timestamptz not null default now(),
  cert_serial text,
  cert_subject text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_invoice_signatures_company
  on public.invoice_signatures(company_id, signed_at desc);

alter table public.invoice_signatures enable row level security;

-- RLS: lecture/écriture uniquement si l'utilisateur a accès à la société via memberships
create policy if not exists invoice_signatures_select
  on public.invoice_signatures for select
  using (
    exists (
      select 1 from public.memberships m
      where m.company_id = invoice_signatures.company_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
    or exists (
      select 1 from public.companies c
      where c.id = invoice_signatures.company_id
        and c.owner_user_id = auth.uid()
    )
  );

create policy if not exists invoice_signatures_upsert
  on public.invoice_signatures for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.company_id = invoice_signatures.company_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
    or exists (
      select 1 from public.companies c
      where c.id = invoice_signatures.company_id
        and c.owner_user_id = auth.uid()
    )
  );

create policy if not exists invoice_signatures_update
  on public.invoice_signatures for update
  using (
    exists (
      select 1 from public.memberships m
      where m.company_id = invoice_signatures.company_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
    or exists (
      select 1 from public.companies c
      where c.id = invoice_signatures.company_id
        and c.owner_user_id = auth.uid()
    )
  );
