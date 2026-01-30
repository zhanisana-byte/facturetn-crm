-- ZIP v10: email logs include attachments + company_id + xml size
ALTER TABLE public.invoice_email_logs
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS xml_size_bytes integer;

-- backfill company_id for existing rows if possible
UPDATE public.invoice_email_logs l
SET company_id = i.company_id
FROM public.invoices i
WHERE l.company_id IS NULL AND l.invoice_id = i.id;

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_company_id
  ON public.invoice_email_logs(company_id);
