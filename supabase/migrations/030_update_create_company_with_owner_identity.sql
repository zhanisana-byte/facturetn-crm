-- v30: RPC create_company_with_owner — enregistre aussi l'identité structurée si les colonnes existent
-- Compatible avec les anciens schémas (si certaines colonnes n'existent pas, on insère seulement les champs de base).

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name text,
  p_tax_id text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_governorate text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_country text DEFAULT NULL,
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
  v_has_city boolean;
  v_has_gov boolean;
  v_has_postal boolean;
  v_has_country boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='city'
  ) INTO v_has_city;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='governorate'
  ) INTO v_has_gov;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='postal_code'
  ) INTO v_has_postal;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='companies' AND column_name='country'
  ) INTO v_has_country;

  IF v_has_city AND v_has_gov AND v_has_postal AND v_has_country THEN
    INSERT INTO public.companies(company_name, tax_id, address, city, governorate, postal_code, country, phone, email)
    VALUES (p_company_name, p_tax_id, p_address, p_city, p_governorate, p_postal_code, COALESCE(NULLIF(p_country,''), 'TN'), p_phone, p_email)
    RETURNING id INTO v_company_id;
  ELSE
    INSERT INTO public.companies(company_name, tax_id, address, phone, email)
    VALUES (p_company_name, p_tax_id, p_address, p_phone, p_email)
    RETURNING id INTO v_company_id;
  END IF;

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
