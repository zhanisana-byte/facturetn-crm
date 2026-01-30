-- v13: Paramètres DSS (signature) par société

ALTER TABLE public.ttn_credentials
  ADD COLUMN IF NOT EXISTS dss_url text,
  ADD COLUMN IF NOT EXISTS dss_token text,
  ADD COLUMN IF NOT EXISTS dss_profile text,
  ADD COLUMN IF NOT EXISTS require_signature boolean DEFAULT false;
