# FactureTN • ZIP6 PRO • SQL à ajouter (manuel)

> Objectif: rendre chaque **Société** “TTN-ready” avec un **champ obligatoire** (signature / connexion / mode), et activer l’**historique TTN**.

## 1) Migration SQL (copier/coller dans Supabase)

```sql
-- Paramètres TTN obligatoires par société

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

CREATE INDEX IF NOT EXISTS idx_ttn_credentials_company
  ON public.ttn_credentials(company_id);

-- Journal TTN (/ttn)
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
```

## 2) Où voir / modifier les champs TTN ?

- Dans l'app: **Société → Paramètres TTN**
- Route: `/companies/[id]/ttn`

## 3) Champs “obligatoires” côté UX (avant signature/envoi)

- `ttn_mode`
- `connection_type`
- `environment`
- `cert_serial_number`
- `cert_email`

> Tu peux rendre ces champs *NOT NULL* plus tard, une fois que tes anciennes sociétés ont été remplies.
