-- A "scoped staff officer" holds staff_officer without a service-wide or command-leadership role.
CREATE OR REPLACE FUNCTION public.is_scoped_staff_officer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'staff_officer')
     AND NOT public.has_role(_uid,'admin') AND NOT public.has_role(_uid,'oic') AND NOT public.has_role(_uid,'2ic');
$$;

CREATE OR REPLACE FUNCTION public.so_can_see_profile(_uid uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_scoped_staff_officer(_uid)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _profile_id
                 AND (p.user_id = _uid OR p.org_unit_id IN (SELECT public.user_org_scope(_uid))));
$$;

CREATE OR REPLACE FUNCTION public.so_can_see_user(_uid uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_scoped_staff_officer(_uid) OR _user_id = _uid
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = _user_id
                 AND p.org_unit_id IN (SELECT public.user_org_scope(_uid)));
$$;

CREATE OR REPLACE FUNCTION public.so_can_see_unit(_uid uuid, _unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_scoped_staff_officer(_uid) OR _unit IS NULL
      OR _unit IN (SELECT public.user_org_scope(_uid))
      OR _unit IN (SELECT public.org_unit_ancestors(p.org_unit_id) FROM public.profiles p WHERE p.user_id = _uid);
$$;

GRANT EXECUTE ON FUNCTION public.is_scoped_staff_officer(uuid), public.so_can_see_profile(uuid,uuid),
  public.so_can_see_user(uuid,uuid), public.so_can_see_unit(uuid,uuid) TO authenticated;

-- Staff officers no longer get the command-tier "see every unit" bypass.
CREATE OR REPLACE FUNCTION public.can_view_org_unit(_user_id uuid, _org_unit_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE home uuid;
BEGIN
  IF _user_id IS NULL OR _org_unit_id IS NULL THEN RETURN false; END IF;
  IF public.is_command_tier(_user_id) AND NOT public.is_scoped_staff_officer(_user_id) THEN RETURN true; END IF;
  SELECT org_unit_id INTO home FROM public.profiles WHERE user_id = _user_id;
  IF home IS NOT NULL AND EXISTS (SELECT 1 FROM public.org_unit_descendants(home) d WHERE d = _org_unit_id) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.org_unit_assignments a WHERE a.user_id = _user_id AND a.revoked_at IS NULL
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND EXISTS (SELECT 1 FROM public.org_unit_descendants(a.org_unit_id) d WHERE d = _org_unit_id));
END $$;

-- Restrictive command-scope policies on personnel/HR tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('profiles','id','profile'),
    ('attendances','profile_id','profile'),('certifications','profile_id','profile'),
    ('command_transfers','profile_id','profile'),('equipment_issuance','profile_id','profile'),
    ('leave_requests','profile_id','profile'),('postings_transfers','profile_id','profile'),
    ('profile_change_requests','profile_id','profile'),('profile_contacts','profile_id','profile'),
    ('profile_departments','profile_id','profile'),('profile_office_history','profile_id','profile'),
    ('shift_change_requests','profile_id','profile'),('staff_documents','profile_id','profile'),
    ('excuse_duty_forms','staff_profile_id','profile'),('medical_appointments','staff_profile_id','profile'),
    ('medical_records','staff_profile_id','profile'),
    ('route_tracking_history','user_id','user'),('user_sessions','user_id','user'),
    ('org_positions','org_unit_id','unit'),('org_units','id','unit')
  ) v(tbl,col,kind) LOOP
    IF to_regclass('public.'||r.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Staff officers limited to own command" ON public.%I', r.tbl);
    EXECUTE format('CREATE POLICY "Staff officers limited to own command" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      r.tbl,
      CASE r.kind WHEN 'profile' THEN format('public.so_can_see_profile(auth.uid(), %I)', r.col)
                  WHEN 'user' THEN format('public.so_can_see_user(auth.uid(), %I)', r.col)
                  ELSE format('public.so_can_see_unit(auth.uid(), %I)', r.col) END,
      CASE r.kind WHEN 'profile' THEN format('public.so_can_see_profile(auth.uid(), %I)', r.col)
                  WHEN 'user' THEN format('public.so_can_see_user(auth.uid(), %I)', r.col)
                  ELSE format('public.so_can_see_unit(auth.uid(), %I)', r.col) END);
  END LOOP;
END $$;

-- Only Super Admins may grant modules to staff officers.
DROP POLICY IF EXISTS "Only super admins grant staff officer modules" ON public.command_tier_grants;
CREATE POLICY "Only super admins grant staff officer modules" ON public.command_tier_grants
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR NOT public.has_role(user_id,'staff_officer'));