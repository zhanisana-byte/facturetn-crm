-- 022_invoice_declaration_fields.sql
-- Suivi des déclarations (manuel / auto) sans dépendre de TTN.

alter table public.invoices
  add column if not exists declaration_status text not null default 'none'
  check (declaration_status in ('none','manual','auto')),
  add column if not exists declared_at timestamptz,
  add column if not exists declaration_ref text,
  add column if not exists declaration_note text;

create index if not exists idx_invoices_declaration_status on public.invoices(declaration_status);