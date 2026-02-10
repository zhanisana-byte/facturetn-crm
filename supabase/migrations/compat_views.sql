-- 024_compat_views.sql
-- Views / compat layer to keep code stable while using canonical tables.
-- Safe to run multiple times.

-- 1) company_ttn_settings -> based on ttn_credentials (one row per company)
DROP VIEW IF EXISTS public.company_ttn_settings;
CREATE VIEW public.company_ttn_settings AS
SELECT DISTINCT ON (tc.company_id)
  tc.id,
  tc.company_id,
  tc.environment,
  tc.ws_url,
  tc.ws_login,
  tc.ws_password,
  tc.ws_matricule AS ttn_matricule,
  tc.created_at,
  tc.updated_at
FROM public.ttn_credentials tc
ORDER BY tc.company_id, tc.updated_at DESC NULLS LAST, tc.created_at DESC NULLS LAST;

-- 2) company_subscriptions -> based on platform_subscriptions (scope_type='company')
DROP VIEW IF EXISTS public.company_subscriptions;
CREATE VIEW public.company_subscriptions AS
SELECT
  ps.id,
  ps.scope_id AS company_id,
  ps.status,
  ps.plan_code,
  ps.current_period_start,
  ps.current_period_end,
  ps.trial_ends_at,
  ps.created_at,
  ps.updated_at
FROM public.platform_subscriptions ps
WHERE ps.scope_type = 'company';

