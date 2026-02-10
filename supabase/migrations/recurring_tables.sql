-- 025_recurring_tables.sql
-- Minimal recurring module tables used by /recurring and invoice creation.
-- RLS is intentionally NOT enabled here to avoid breaking existing setups.
-- You can enable RLS later once access rules are finalized.

CREATE TABLE IF NOT EXISTS public.recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  currency text NOT NULL DEFAULT 'TND',
  cadence text NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('weekly','monthly','quarterly','yearly')),
  day_of_month int NULL,
  next_run_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_templates_company_idx ON public.recurring_templates(company_id);
CREATE INDEX IF NOT EXISTS recurring_templates_next_run_idx ON public.recurring_templates(next_run_at);

CREATE TABLE IF NOT EXISTS public.recurring_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.recurring_templates(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  vat numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_template_items_template_idx ON public.recurring_template_items(template_id);
