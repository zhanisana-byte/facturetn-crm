-- v33: Tokens de signature de facture (Deep Link Agent)

create table if not exists public.signature_sign_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  environment text not null default 'production' check (environment in ('test','production')),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_signature_sign_tokens_invoice
  on public.signature_sign_tokens(invoice_id, created_at desc);

alter table public.signature_sign_tokens enable row level security;

-- RLS: l'utilisateur peut créer/lire ses tokens (agent utilisera service role)
drop policy if exists sig_sign_tokens_select_own on public.signature_sign_tokens;
create policy sig_sign_tokens_select_own
  on public.signature_sign_tokens
  for select
  using (created_by = auth.uid());

drop policy if exists sig_sign_tokens_insert_own on public.signature_sign_tokens;
create policy sig_sign_tokens_insert_own
  on public.signature_sign_tokens
  for insert
  with check (created_by = auth.uid());

drop policy if exists sig_sign_tokens_update_own on public.signature_sign_tokens;
create policy sig_sign_tokens_update_own
  on public.signature_sign_tokens
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
