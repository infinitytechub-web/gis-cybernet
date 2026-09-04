CREATE OR REPLACE FUNCTION public.org_position_roster()
RETURNS TABLE (
  id uuid,
  title text,
  position_level public.org_position_level,
  org_unit_id uuid,
  org_unit_name text,
  org_unit_type public.org_unit_type,
  command_path text,
  holder_profile_id uuid,
  holder_name text,
  holder_rank text,
  holder_staff_id text,
  start_date date,
  end_date date,
  notes text,
  is_active boolean,
  is_vacant boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT u.id AS root, u.id AS node, u.parent_id, u.name, 0 AS depth
    FROM public.org_units u
    UNION ALL
    SELECT c.root, p.id, p.parent_id, p.name, c.depth + 1
    FROM chain c
    JOIN public.org_units p ON p.id = c.parent_id
  ),
  paths AS (
    SELECT root, string_agg(name, ' > ' ORDER BY depth DESC) AS path
    FROM chain GROUP BY root
  )
  SELECT
    op.id,
    op.title,
    op.position_level,
    op.org_unit_id,
    u.name,
    u.type,
    pa.path,
    op.holder_profile_id,
    NULLIF(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
    r.name,
    pr.staff_id,
    op.start_date,
    op.end_date,
    op.notes,
    op.is_active,
    op.holder_profile_id IS NULL
  FROM public.org_positions op
  LEFT JOIN public.org_units u ON u.id = op.org_unit_id
  LEFT JOIN paths pa ON pa.root = op.org_unit_id
  LEFT JOIN public.profiles pr ON pr.id = op.holder_profile_id
  LEFT JOIN public.ranks r ON r.id = pr.rank_id
  WHERE op.org_unit_id IS NULL OR public.can_see_org_unit(auth.uid(), op.org_unit_id)
  ORDER BY op.sort_order, op.position_level, op.title;
$$;

REVOKE EXECUTE ON FUNCTION public.org_position_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_position_roster() TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_biodata_completeness()
RETURNS TABLE (
  profile_id uuid,
  staff_id text,
  full_name text,
  rank_name text,
  department_name text,
  org_unit_id uuid,
  org_unit_name text,
  status text,
  has_identity boolean,
  has_contact boolean,
  has_family boolean,
  has_education boolean,
  has_employment boolean,
  has_medical boolean,
  has_bank boolean,
  has_verification boolean,
  modules_complete integer,
  completeness_pct integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT p.*
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
       OR public.has_role(auth.uid(), 'admin')
       OR public.has_role(auth.uid(), 'oic')
       OR public.has_role(auth.uid(), '2ic')
       OR public.has_role(auth.uid(), 'staff_officer')
       OR public.has_role(auth.uid(), 'supervisor')
       OR public.has_role(auth.uid(), 'head_of_administration')
  ),
  flags AS (
    SELECT
      v.id,
      v.staff_id,
      NULLIF(btrim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), '') AS full_name,
      r.name AS rank_name,
      d.name AS department_name,
      v.org_unit_id,
      u.name AS org_unit_name,
      v.status::text AS status,
      (v.first_name IS NOT NULL AND v.last_name IS NOT NULL AND v.date_of_birth IS NOT NULL) AS has_identity,
      (v.phone IS NOT NULL AND btrim(v.phone) <> '') AS has_contact,
      EXISTS (SELECT 1 FROM public.staff_family_details f WHERE f.profile_id = v.id) AS has_family,
      EXISTS (SELECT 1 FROM public.staff_education e WHERE e.profile_id = v.id) AS has_education,
      EXISTS (SELECT 1 FROM public.staff_employment_history eh WHERE eh.profile_id = v.id) AS has_employment,
      EXISTS (SELECT 1 FROM public.staff_medical_welfare m WHERE m.profile_id = v.id) AS has_medical,
      EXISTS (SELECT 1 FROM public.staff_bank_details b WHERE b.profile_id = v.id) AS has_bank,
      EXISTS (SELECT 1 FROM public.staff_biodata_verifications bv WHERE bv.profile_id = v.id) AS has_verification
    FROM visible v
    LEFT JOIN public.ranks r ON r.id = v.rank_id
    LEFT JOIN public.departments d ON d.id = v.department_id
    LEFT JOIN public.org_units u ON u.id = v.org_unit_id
  )
  SELECT
    f.id, f.staff_id, f.full_name, f.rank_name, f.department_name, f.org_unit_id, f.org_unit_name, f.status,
    f.has_identity, f.has_contact, f.has_family, f.has_education, f.has_employment,
    f.has_medical, f.has_bank, f.has_verification,
    (f.has_identity::int + f.has_contact::int + f.has_family::int + f.has_education::int
      + f.has_employment::int + f.has_medical::int + f.has_bank::int + f.has_verification::int) AS modules_complete,
    round(
      (f.has_identity::int + f.has_contact::int + f.has_family::int + f.has_education::int
        + f.has_employment::int + f.has_medical::int + f.has_bank::int + f.has_verification::int) * 100.0 / 8.0
    )::int AS completeness_pct
  FROM flags f
  ORDER BY f.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_biodata_completeness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_biodata_completeness() TO authenticated;
