-- Ajouts V1: champs société nécessaires pour une configuration TTN "propre"

alter table if exists public.companies
  add column if not exists identifier_type text,
  add column if not exists vat_regime text,
  add column if not exists postal_code text;

-- Index utiles
create index if not exists idx_companies_tax_id on public.companies(tax_id);
