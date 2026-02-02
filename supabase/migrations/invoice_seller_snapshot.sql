-- Add seller snapshot fields to invoices for legal/history stability

alter table public.invoices
  add column if not exists seller_snapshot_at timestamptz,
  add column if not exists seller_name text,
  add column if not exists seller_tax_id text,
  add column if not exists seller_street text,
  add column if not exists seller_city text,
  add column if not exists seller_zip text;

create index if not exists idx_invoices_seller_tax_id on public.invoices(seller_tax_id);
