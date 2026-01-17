-- ZIP7 PATCH: TTN queue (scheduled send) + email logs + notifications + invoice TTN columns

-- 1) Invoices: TTN fields (safe)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ttn_status text NOT NULL DEFAULT 'not_sent'
    CHECK (ttn_status IN ('not_sent','scheduled','submitted','accepted','rejected','canceled')),
  ADD COLUMN IF NOT EXISTS ttn_reference text,
  ADD COLUMN IF NOT EXISTS ttn_last_error text,
  ADD COLUMN IF NOT EXISTS ttn_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttn_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ttn_validated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_ttn_status
  ON public.invoices(ttn_status);

-- 2) TTN Queue (programmer envoi)
CREATE TABLE IF NOT EXISTS public.ttn_invoice_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','queued','sent','canceled','failed')),
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ttn_queue_company_status
  ON public.ttn_invoice_queue(company_id, status, scheduled_at);

DROP TRIGGER IF EXISTS trg_ttn_queue_updated_at ON public.ttn_invoice_queue;
CREATE TRIGGER trg_ttn_queue_updated_at
BEFORE UPDATE ON public.ttn_invoice_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ttn_invoice_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "ttn_queue_select_own" ON public.ttn_invoice_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_invoice_queue.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "ttn_queue_insert_own" ON public.ttn_invoice_queue
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_invoice_queue.company_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "ttn_queue_update_own" ON public.ttn_invoice_queue
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.company_id = ttn_invoice_queue.company_id
        AND m.user_id = auth.uid()
    )
  );

-- 3) Email logs
CREATE TABLE IF NOT EXISTS public.invoice_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sent_by uuid,
  to_email text NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}'::text[],
  bcc_emails text[] NOT NULL DEFAULT '{}'::text[],
  subject text,
  message text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed')),
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_email_logs_invoice
  ON public.invoice_email_logs(invoice_id, created_at DESC);

ALTER TABLE public.invoice_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "invoice_email_logs_select_own" ON public.invoice_email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.memberships m ON m.company_id = i.company_id
      WHERE i.id = invoice_email_logs.invoice_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "invoice_email_logs_insert_own" ON public.invoice_email_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      JOIN public.memberships m ON m.company_id = i.company_id
      WHERE i.id = invoice_email_logs.invoice_id
        AND m.user_id = auth.uid()
    )
  );

-- 4) Notifications (simple)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "notifications_select_own" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "notifications_insert_own" ON public.notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
