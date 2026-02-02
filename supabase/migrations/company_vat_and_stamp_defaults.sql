-- ZIP20: TVA par défaut + timbre fiscal (paramètres société)
-- Objectif: éviter la saisie répétée et fournir des valeurs par défaut lors de la création de facture.

-- Ajout TVA par défaut au niveau société
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_vat_pct numeric NOT NULL DEFAULT 19.00;

-- Garde-fous (tolérant sur les upgrades)
DO $$
BEGIN
  -- Contraintes simples: 0..100
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_default_vat_pct_range'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_default_vat_pct_range
      CHECK (default_vat_pct >= 0 AND default_vat_pct <= 100);
  END IF;
END $$;
