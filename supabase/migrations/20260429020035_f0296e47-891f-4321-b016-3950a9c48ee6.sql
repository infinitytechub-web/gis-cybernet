-- 1) Tighten the SELECT policy
DROP POLICY IF EXISTS "Authenticated can view office history" ON public.profile_office_history;

CREATE POLICY "Restricted office history visibility"
ON public.profile_office_history
FOR SELECT
TO authenticated
USING (
  -- Command tier (sees everything)
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  -- Supervisors: only history for staff in their department (or their own)
  OR public.is_supervisor_for_profile(auth.uid(), profile_id)
  -- The owning staff member can see their own history
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = profile_office_history.profile_id
      AND p.user_id = auth.uid()
  )
);

-- 2) Automated security test (pure-SQL, runnable any time by an admin)
CREATE OR REPLACE FUNCTION public.test_profile_office_history_access()
RETURNS TABLE(scenario text, expected_visible bigint, actual_visible bigint, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid;
  _oic uuid;
  _supervisor uuid;
  _supervisor_dept uuid;
  _other_staff uuid;
  _owner_user uuid;
  _owner_profile uuid;
  _expected bigint;
  _actual bigint;
  _total bigint;

  -- Helper: count rows visible to a given user via a SET LOCAL role switch
  -- We use plpgsql + set_config to swap the auth.uid() the policy sees.
  _saved_role text;
BEGIN
  -- Only admins may execute this test
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins may run profile_office_history access tests';
  END IF;

  -- Pick representative users for each tier (first match wins)
  SELECT ur.user_id INTO _admin       FROM public.user_roles ur WHERE ur.role = 'admin'         LIMIT 1;
  SELECT ur.user_id INTO _oic         FROM public.user_roles ur WHERE ur.role = 'oic'           LIMIT 1;
  SELECT ur.user_id INTO _supervisor  FROM public.user_roles ur WHERE ur.role = 'supervisor'    LIMIT 1;
  SELECT ur.user_id INTO _other_staff FROM public.user_roles ur WHERE ur.role = 'staff'         LIMIT 1;

  SELECT department_id INTO _supervisor_dept FROM public.profiles WHERE user_id = _supervisor LIMIT 1;

  -- Pick a profile that has at least one office-history row, and remember its owner
  SELECT poh.profile_id, p.user_id
    INTO _owner_profile, _owner_user
  FROM public.profile_office_history poh
  JOIN public.profiles p ON p.id = poh.profile_id
  LIMIT 1;

  SELECT count(*) INTO _total FROM public.profile_office_history;

  -- Helper inline: temporarily set request.jwt.claim.sub so auth.uid() returns it,
  -- then run a count under RLS by querying as the 'authenticated' role.
  -- Note: `set local role` requires the current role to be a member; we rely on
  -- the SECURITY DEFINER owner being postgres which can switch.

  -- Scenario: ADMIN should see all rows
  IF _admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.profile_office_history' INTO _actual;
    RESET ROLE;
    _expected := _total;
    scenario := 'admin sees everything';
    expected_visible := _expected;
    actual_visible := _actual;
    status := CASE WHEN _actual = _expected THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END IF;

  -- Scenario: OIC should see all rows
  IF _oic IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', _oic::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.profile_office_history' INTO _actual;
    RESET ROLE;
    _expected := _total;
    scenario := 'oic sees everything';
    expected_visible := _expected;
    actual_visible := _actual;
    status := CASE WHEN _actual = _expected THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END IF;

  -- Scenario: SUPERVISOR should see only their department's history (+ their own)
  IF _supervisor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', _supervisor::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.profile_office_history' INTO _actual;
    RESET ROLE;
    SELECT count(*) INTO _expected
      FROM public.profile_office_history poh
      JOIN public.profiles p ON p.id = poh.profile_id
     WHERE p.department_id = _supervisor_dept
        OR p.user_id = _supervisor;
    scenario := 'supervisor sees only own department';
    expected_visible := _expected;
    actual_visible := _actual;
    status := CASE WHEN _actual = _expected THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END IF;

  -- Scenario: STAFF (unrelated) should see only their OWN history rows
  IF _other_staff IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', _other_staff::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.profile_office_history' INTO _actual;
    RESET ROLE;
    SELECT count(*) INTO _expected
      FROM public.profile_office_history poh
      JOIN public.profiles p ON p.id = poh.profile_id
     WHERE p.user_id = _other_staff;
    scenario := 'unrelated staff sees only their own rows';
    expected_visible := _expected;
    actual_visible := _actual;
    status := CASE WHEN _actual = _expected THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END IF;

  -- Scenario: OWNER should see at least their own row(s)
  IF _owner_user IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', _owner_user::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.profile_office_history WHERE profile_id = $1'
      INTO _actual USING _owner_profile;
    RESET ROLE;
    SELECT count(*) INTO _expected
      FROM public.profile_office_history WHERE profile_id = _owner_profile;
    scenario := 'profile owner sees own history';
    expected_visible := _expected;
    actual_visible := _actual;
    status := CASE WHEN _actual = _expected THEN 'PASS' ELSE 'FAIL' END;
    RETURN NEXT;
  END IF;

  -- Reset for safety
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.test_profile_office_history_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.test_profile_office_history_access() TO authenticated;