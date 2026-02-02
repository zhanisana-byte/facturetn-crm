-- v11: Ajout champs Webservice classiques (login/password/matricule) selon "Spécifications web services v5.pdf"
ALTER TABLE public.ttn_credentials
  ADD COLUMN IF NOT EXISTS ws_url text,
  ADD COLUMN IF NOT EXISTS ws_login text,
  ADD COLUMN IF NOT EXISTS ws_password text,
  ADD COLUMN IF NOT EXISTS ws_matricule text;

-- Valeur par défaut (peut être écrasée par société)
UPDATE public.ttn_credentials
SET ws_url = COALESCE(ws_url, 'https://elfatoora.tn/ElfatouraServices/EfactService')
WHERE ws_url IS NULL;
