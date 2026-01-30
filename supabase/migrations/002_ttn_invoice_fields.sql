-- ZIP4 READY: Champs facture "TTN-like" (période, référence unique, QR, type doc)

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'facture'
    CHECK (document_type IN ('facture','devis','avoir')),
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date,
  ADD COLUMN IF NOT EXISTS unique_reference text,
  ADD COLUMN IF NOT EXISTS qr_payload text,
  ADD COLUMN IF NOT EXISTS amount_in_words text;

CREATE INDEX IF NOT EXISTS idx_invoices_company_period
  ON public.invoices(company_id, period_from DESC, period_to DESC);
