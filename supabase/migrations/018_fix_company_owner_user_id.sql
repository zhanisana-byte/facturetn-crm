-- Ensure companies.owner_user_id is set when creating a company via RPC
-- and backfill owner_user_id for existing companies based on memberships(role='owner').

DO $$
BEGIN
  -- 1) Backfill owner_user_id for existing companies
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'owner_user_id'
  ) THEN
    UPDATE public.companies c
    SET owner_user_id = m.user_id
    FROM public.memberships m
    WHERE m.company_id = c.id
      AND m.role = 'owner'
      AND m.is_active = true
      AND c.owner_user_id IS NULL;
  END IF;
END $$;

-- 2) Update the RPC to also set owner_user_id when the column exists
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name text,
  p_tax_id text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.companies(company_name, tax_id, address, phone, email)
  VALUES (p_company_name, p_tax_id, p_address, p_phone, p_email)
  RETURNING id INTO v_company_id;

  -- If companies.owner_user_id exists, fill it
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'companies'
      AND column_name = 'owner_user_id'
  ) THEN
    UPDATE public.companies
    SET owner_user_id = auth.uid()
    WHERE id = v_company_id;
  END IF;

  INSERT INTO public.company_settings(company_id)
  VALUES (v_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.memberships(
    company_id, user_id, role,
    can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn,
    is_active
  )
  VALUES (
    v_company_id, auth.uid(), 'owner',
    true, true, true, true,
    true
  )
  ON CONFLICT (company_id, user_id) DO UPDATE SET
    role = excluded.role,
    can_manage_customers = true,
    can_create_invoices = true,
    can_validate_invoices = true,
    can_submit_ttn = true,
    is_active = true,
    updated_at = now();

  RETURN v_company_id;
END;
$$;
