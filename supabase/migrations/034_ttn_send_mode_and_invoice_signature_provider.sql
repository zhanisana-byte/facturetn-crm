-- 034_ttn_send_mode_and_invoice_signature_provider.sql
-- Ajout d'un mode d'envoi simple (API ou manuel) + choix de signature par facture.

ALTER TABLE public.ttn_credentials
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'api'
    CHECK (send_mode IN ('api','manual'));

-- Choix de signature par facture (facultatif).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS signature_provider text NULL
    CHECK (signature_provider IN ('none','usb_agent','digigo','dss','hsm'));

CREATE INDEX IF NOT EXISTS idx_ttn_credentials_send_mode ON public.ttn_credentials(send_mode);
CREATE INDEX IF NOT EXISTS idx_invoices_signature_provider ON public.invoices(signature_provider);
