-- 005_platform_pdg.sql
-- Adds platform-level "PDG" role + subscription controls + accountant free access + API keys.

-- Platform owner (PDG) role flag
ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS is_platform_pdg boolean NOT NULL DEFAULT false;

-- Subscription fields (platform-managed)
ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NULL;

-- Accountant validation + free lifetime access
ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS accountant_free_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accountant_verified_at timestamptz NULL;

-- Basic API keys table (optional feature)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  user_id uuid NULL,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS api_keys_company_id_idx ON public.api_keys(company_id);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON public.api_keys(user_id);

-- NOTE: Access to platform features is implemented server-side using SUPABASE_SERVICE_ROLE_KEY.
-- If you want pure RLS-based access, add policies allowing only is_platform_pdg.
