-- v29: Champs identité société structurés (TEIF / TTN)
-- Ajoute des colonnes pour éviter de stocker une adresse concaténée dans address.

ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'TN';

-- postal_code existe déjà dans v002, on sécurise au cas où
ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS postal_code text;
