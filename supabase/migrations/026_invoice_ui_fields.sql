-- 026_invoice_ui_fields.sql
-- Ajouts pour répondre aux besoins UI (factures permanentes / filtrage / auteur)

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_mode text NOT NULL DEFAULT 'normal'
    CHECK (invoice_mode IN ('normal','permanente')),
  ADD COLUMN IF NOT EXISTS billing_period text NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS created_in_mode text NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_mode ON public.invoices(invoice_mode);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON public.invoices(billing_period);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by_user_id);

-- Backfill léger
UPDATE public.invoices
SET invoice_mode = 'permanente'
WHERE invoice_mode = 'normal'
  AND period_from IS NOT NULL
  AND period_to IS NOT NULL
  AND (unique_reference ILIKE '%PERM%' OR invoice_number ILIKE '%PERM%');
