CREATE OR REPLACE FUNCTION public.admin_quick_search(_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term text;
  v_staff jsonb;
  v_passports jsonb;
  v_visas jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin_quick_search: admin role required' USING ERRCODE = '42501';
  END IF;

  v_term := '%' || COALESCE(NULLIF(trim(_q), ''), '___never_match___') || '%';

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_staff
  FROM (
    SELECT id, first_name, last_name, staff_id, rank, department, email
    FROM public.profiles
    WHERE first_name ILIKE v_term
       OR last_name  ILIKE v_term
       OR staff_id   ILIKE v_term
       OR email      ILIKE v_term
    ORDER BY last_name NULLS LAST, first_name NULLS LAST
    LIMIT 6
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_passports
  FROM (
    SELECT id, application_reference AS ref, applicant_name AS name, 'Passport'::text AS kind
    FROM public.passport_applications
    WHERE application_reference ILIKE v_term
       OR applicant_name        ILIKE v_term
    ORDER BY created_at DESC
    LIMIT 4
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_visas
  FROM (
    SELECT id, NULL::text AS ref, applicant_name AS name, 'Visa'::text AS kind
    FROM public.visa_applications
    WHERE applicant_name   ILIKE v_term
       OR passport_number  ILIKE v_term
    ORDER BY created_at DESC
    LIMIT 4
  ) t;

  RETURN jsonb_build_object(
    'staff', v_staff,
    'applications', v_passports || v_visas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_quick_search(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_quick_search(text) TO authenticated;