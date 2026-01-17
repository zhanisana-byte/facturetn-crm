-- 007_app_users_upgrade_account_types.sql
-- V27: Aligner la table public.app_users avec le code (plan_code, max_companies, subscription_status)
--      + élargir la contrainte account_type pour supporter: entreprise, profil, comptable/cabinet, multi/groupe.

begin;

-- 1) Colonnes manquantes (ajouts idempotents)
alter table public.app_users
  add column if not exists plan_code text,
  add column if not exists max_companies int,
  add column if not exists subscription_status text,
  add column if not exists accountant_mf text,
  add column if not exists accountant_patente text,
  add column if not exists accountant_status text,
  add column if not exists accountant_verified_at timestamptz,
  add column if not exists accountant_pending_until timestamptz,
  add column if not exists accountant_free_access boolean;

-- 2) Defaults sûrs (sans casser l’existant)
update public.app_users
set
  plan_code = coalesce(plan_code, case when account_type = 'profil' then 'pro_free' else 'client_50' end),
  max_companies = coalesce(max_companies, case when account_type = 'profil' then 0 else 1 end),
  subscription_status = coalesce(subscription_status, case when account_type = 'profil' then 'free_admin' else 'trial' end),
  accountant_free_access = coalesce(accountant_free_access, false)
where
  plan_code is null
  or max_companies is null
  or subscription_status is null
  or accountant_free_access is null;

-- 3) (Re)Créer la contrainte account_type (CHECK)
--    On supporte aussi les alias legacy utilisés par l'app: client/cabinet/groupe
alter table public.app_users
  drop constraint if exists app_users_account_type_check;

alter table public.app_users
  add constraint app_users_account_type_check
  check (
    account_type in (
      'entreprise',
      'profil',
      'comptable',
      'multi_societe',
      -- legacy / compat
      'client',
      'cabinet',
      'groupe'
    )
  );

commit;
