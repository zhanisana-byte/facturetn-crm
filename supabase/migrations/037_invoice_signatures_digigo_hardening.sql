alter table public.invoice_signatures
  alter column signed_xml drop not null;

alter table public.invoice_signatures
  add column if not exists unsigned_xml text,
  add column if not exists unsigned_hash text,
  add column if not exists signed_hash text,
  add column if not exists state text not null default 'none',
  add column if not exists provider_tx_id text,
  add column if not exists session_id text,
  add column if not exists otp_id text,
  add column if not exists signer_user_id uuid;

create index if not exists idx_invoice_signatures_state
  on public.invoice_signatures(company_id, state, signed_at desc);
