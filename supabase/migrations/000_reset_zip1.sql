-- RESET FactureTN ZIP1 (one-time)
drop table if exists public.invoice_items cascade;
drop table if exists public.invoices cascade;
drop table if exists public.invoice_counters cascade;
drop table if exists public.invoice_numbering_rules cascade;
drop table if exists public.customers cascade;
drop table if exists public.memberships cascade;
drop table if exists public.company_settings cascade;
drop table if exists public.companies cascade;
drop table if exists public.app_users cascade;

drop type if exists public.invoice_status cascade;
drop type if exists public.membership_role cascade;
drop type if exists public.reset_scope cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.ensure_app_user() cascade;
drop function if exists public.compute_invoice_totals(uuid) cascade;
drop function if exists public.trg_recalc_invoice_totals() cascade;
drop function if exists public.is_company_member(uuid) cascade;
drop function if exists public.create_company_with_owner(text,text,text,text,text) cascade;
-- v30 signature (with structured address)
drop function if exists public.create_company_with_owner(text,text,text,text,text,text,text,text,text) cascade;
