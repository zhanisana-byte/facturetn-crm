-- Fix TTN upsert conflict: allow one row per (company_id, environment)
-- Existing schema had UNIQUE(company_id) from initial init; later code upserts on (company_id, environment).

DO $$
BEGIN
  -- Ensure columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ttn_credentials' AND column_name='environment'
  ) THEN
    ALTER TABLE public.ttn_credentials
      ADD COLUMN environment text DEFAULT 'test' CHECK (environment IN ('test','production'));
  END IF;
END $$;

-- Drop old UNIQUE(company_id) constraint if present (name may vary)
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ttn_credentials'::regclass
      AND contype = 'u'
  LOOP
    -- If the unique constraint is exactly on (company_id), drop it.
    IF (
      SELECT array_agg(att.attname ORDER BY att.attname)
      FROM unnest(c.conkey) ck
      JOIN pg_attribute att ON att.attrelid='public.ttn_credentials'::regclass AND att.attnum=ck
    ) = ARRAY['company_id'] THEN
      EXECUTE format('ALTER TABLE public.ttn_credentials DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;
END $$;

-- Create UNIQUE(company_id, environment) as index (safe if already exists)
CREATE UNIQUE INDEX IF NOT EXISTS ttn_credentials_company_environment_uq
  ON public.ttn_credentials(company_id, environment);
