-- v13: Tracing TTN Webservice identifiers
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ttn_save_id text,
  ADD COLUMN IF NOT EXISTS ttn_generated_ref text,
  ADD COLUMN IF NOT EXISTS ttn_signed boolean DEFAULT false;
