-- 015_platform_billing.sql
-- Platform billing: subscriptions + payments tracked by CRM owner (PDG).

-- Basic account suspension flag (platform-managed)
ALTER TABLE IF EXISTS public.app_users
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_reason text NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL;

-- Billing scopes
-- scope_type:
--   company (societe 50)
--   group (29 * internal + 50 * external)
--   external_company (societe externe invitee)
--   cabinet_workspace (gratuit)
CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('company','group','external_company','cabinet_workspace')),
  scope_id uuid NULL,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','paused','overdue','free','canceled')),
  price_ht numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,
  next_billing_at timestamptz NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_subscriptions_owner_idx ON public.platform_subscriptions(owner_user_id);
CREATE INDEX IF NOT EXISTS platform_subscriptions_scope_idx ON public.platform_subscriptions(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS platform_subscriptions_status_idx ON public.platform_subscriptions(status);

-- Payments recorded by PDG
-- method: cash | virement | versement | free
CREATE TABLE IF NOT EXISTS public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NULL REFERENCES public.platform_subscriptions(id) ON DELETE SET NULL,
  payer_user_id uuid NOT NULL,
  amount_ht numeric NOT NULL DEFAULT 0,
  method text NOT NULL CHECK (method IN ('cash','virement','versement','free')),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending','canceled')),
  reference text NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_payments_payer_idx ON public.platform_payments(payer_user_id);
CREATE INDEX IF NOT EXISTS platform_payments_subscription_idx ON public.platform_payments(subscription_id);
CREATE INDEX IF NOT EXISTS platform_payments_paid_at_idx ON public.platform_payments(paid_at);
