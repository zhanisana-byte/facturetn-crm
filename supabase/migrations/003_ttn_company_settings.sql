-- ZIP6 PRO: Paramètres TTN obligatoires par société (signature + connexion + mode)

-- 1) Étendre ttn_credentials (sans casser l'existant)
ALTER TABLE public.ttn_credentials
  ADD COLUMN IF NOT EXISTS ttn_mode text DEFAULT 'provider_facturetn'
    CHECK (ttn_mode IN ('provider_facturetn','direct_ttn_tokens')),
  ADD COLUMN IF NOT EXISTS connection_type text DEFAULT 'webservice'
    CHECK (connection_type IN ('webservice','sftp')),
  ADD COLUMN IF NOT EXISTS environment text DEFAULT 'test'
    CHECK (environment IN ('test','production')),
  ADD COLUMN IF NOT EXISTS public_ip text,
  ADD COLUMN IF NOT EXISTS cert_serial_number text,
  ADD COLUMN IF NOT EXISTS cert_email text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS token_pack_ref text,
  ADD COLUMN IF NOT EXISTS signer_full_name text,
  ADD COLUMN IF NOT EXISTS signer_email text;

-- (Optionnel) Index utile
CREATE INDEX IF NOT EXISTS idx_ttn_credentials_company
  ON public.ttn_credentials(company_id);

-- 2) Historique / journal TTN (utilisé par /ttn)
CREATE TABLE IF NOT EXISTS public.ttn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text DEFAULT 'pending',
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ttn_events ENABLE ROW LEVEL SECURITY;

-- RLS: lire/écrire si membre owner/admin de la company (même logique que ttn_credentials)
CREATE POLICY IF NOT EXISTS "ttn_events_select_own" ON public.ttn_events
  FOR SELECT
  USING (
    company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_events.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "ttn_events_insert_own" ON public.ttn_events
  FOR INSERT
  WITH CHECK (
    company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_events.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "ttn_events_update_own" ON public.ttn_events
  FOR UPDATE
  USING (
    company_id IS NULL OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_events.company_id
        AND m.user_id = auth.uid()
    )
  );
