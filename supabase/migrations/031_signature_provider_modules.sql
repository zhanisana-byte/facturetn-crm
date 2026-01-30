-- v31: Modules de signature (USB Agent / DigiGO / HSM / DSS)
-- Objectif: rendre la signature extensible sans casser l'existant.

ALTER TABLE public.ttn_credentials
  ADD COLUMN IF NOT EXISTS signature_provider text DEFAULT 'none'
    CHECK (signature_provider IN ('none','usb_agent','digigo','dss','hsm')),
  ADD COLUMN IF NOT EXISTS signature_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signature_status text DEFAULT 'unconfigured'
    CHECK (signature_status IN ('unconfigured','pairing','paired','error'));

-- Tokens d'appairage pour Agent local (Deep Link)
CREATE TABLE IF NOT EXISTS public.signature_pair_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'production'
    CHECK (environment IN ('test','production')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

ALTER TABLE public.signature_pair_tokens ENABLE ROW LEVEL SECURITY;

-- RLS basique: l'utilisateur connecté peut créer/lire ses tokens.
-- (Les routes agent utilisent le service role, donc RLS n'est pas bloquant.)
DROP POLICY IF EXISTS "sig_tokens_select_own" ON public.signature_pair_tokens;
CREATE POLICY "sig_tokens_select_own"
  ON public.signature_pair_tokens
  FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "sig_tokens_insert_own" ON public.signature_pair_tokens;
CREATE POLICY "sig_tokens_insert_own"
  ON public.signature_pair_tokens
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "sig_tokens_update_own" ON public.signature_pair_tokens;
CREATE POLICY "sig_tokens_update_own"
  ON public.signature_pair_tokens
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
