-- Administrators appoint or move a commander in one step: the posting, the
-- command-tier role and the audit trail are written together, so a commander can
-- never end up holding a command role without a command (or vice versa).
CREATE OR REPLACE FUNCTION public.admin_appoint_commander(
  _profile_id uuid,
  _org_unit_id uuid,
  _role app_role,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_user uuid;
  v_from uuid;
  v_name text;
  v_staff text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can appoint commanders';
  END IF;
  IF _role NOT IN ('oic','2ic','staff_officer','supervisor','command_officer') THEN
    RAISE EXCEPTION 'That role is not a command appointment';
  END IF;
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for a command appointment';
  END IF;

  SELECT p.user_id, p.org_unit_id,
         btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), p.staff_id
    INTO v_user, v_from, v_name, v_staff
  FROM public.profiles p WHERE p.id = _profile_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'That officer has no sign-in account yet';
  END IF;
  IF _org_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_units u WHERE u.id = _org_unit_id AND coalesce(u.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Choose an active command';
  END IF;

  UPDATE public.profiles SET org_unit_id = _org_unit_id, updated_at = now()
   WHERE id = _profile_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_from IS DISTINCT FROM _org_unit_id THEN
    INSERT INTO public.command_transfers (profile_id, from_org_unit_id, to_org_unit_id, reason, moved_by)
    VALUES (_profile_id, v_from, _org_unit_id, btrim(_reason), v_uid);
  END IF;

  INSERT INTO public.command_role_audit
    (target_user_id, target_staff_id, target_name, to_role, action, changed_by, notes)
  VALUES (v_user, v_staff, v_name, _role, 'appointed', v_uid, btrim(_reason));

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('command_appointment', 'profiles', _profile_id, v_uid,
          jsonb_build_object('role', _role, 'org_unit_id', _org_unit_id,
                             'from_org_unit_id', v_from, 'reason', btrim(_reason)));
END;
$function$;

-- Removes a command appointment (the role only; the posting is left alone).
CREATE OR REPLACE FUNCTION public.admin_revoke_command_role(
  _profile_id uuid,
  _role app_role,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_user uuid;
  v_name text;
  v_staff text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can remove a command appointment';
  END IF;
  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT p.user_id, btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), p.staff_id
    INTO v_user, v_name, v_staff
  FROM public.profiles p WHERE p.id = _profile_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'That officer has no sign-in account'; END IF;
  IF _role = 'admin'::app_role THEN RAISE EXCEPTION 'Use the role administration screen for the admin role'; END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user AND role = _role;

  INSERT INTO public.command_role_audit
    (target_user_id, target_staff_id, target_name, from_role, action, changed_by, notes)
  VALUES (v_user, v_staff, v_name, _role, 'revoked', v_uid, btrim(_reason));

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('command_appointment_revoked', 'profiles', _profile_id, v_uid,
          jsonb_build_object('role', _role, 'reason', btrim(_reason)));
END;
$function$;

-- Admin overview: every command with its authorised strength, officers posted
-- and the commanders appointed to it.
CREATE OR REPLACE FUNCTION public.admin_command_overview()
RETURNS TABLE(
  org_unit_id uuid,
  unit_name text,
  unit_type text,
  parent_name text,
  authorised_strength integer,
  posted integer,
  commanders jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.type::text, pu.name, u.authorised_strength,
    (SELECT count(*)::int FROM public.profiles p
       WHERE p.org_unit_id = u.id AND p.status::text IN ('active','partially_active')),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'profile_id', p2.id,
               'staff_id', p2.staff_id,
               'name', btrim(coalesce(p2.first_name,'') || ' ' || coalesce(p2.last_name,'')),
               'role', r.role::text,
               'status', p2.status::text)
             ORDER BY r.role::text)
        FROM public.profiles p2
        JOIN public.user_roles r ON r.user_id = p2.user_id
       WHERE p2.org_unit_id = u.id
         AND r.role::text IN ('oic','2ic','staff_officer','supervisor','command_officer')
    ), '[]'::jsonb)
  FROM public.org_units u
  LEFT JOIN public.org_units pu ON pu.id = u.parent_id
  WHERE coalesce(u.is_active, true)
  ORDER BY u.name;
END;
$function$;

-- Admin view of what commanders have done in the Command Admin Panel.
CREATE OR REPLACE FUNCTION public.admin_command_panel_activity(_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  action text,
  created_at timestamptz,
  actor_name text,
  subject_name text,
  subject_staff_id text,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Administrators only';
  END IF;

  RETURN QUERY
  SELECT a.id, a.action, a.created_at,
         btrim(coalesce(ap.first_name,'') || ' ' || coalesce(ap.last_name,'')),
         btrim(coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')),
         sp.staff_id,
         a.details
  FROM public.system_audit_log a
  LEFT JOIN public.profiles ap ON ap.user_id = a.performed_by
  LEFT JOIN public.profiles sp ON sp.id = a.entity_id
  WHERE a.action IN ('command_admin_officer','command_appointment','command_appointment_revoked')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_appoint_commander(uuid, uuid, app_role, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_command_role(uuid, app_role, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_command_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_command_panel_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_appoint_commander(uuid, uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_command_role(uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_command_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_command_panel_activity(integer) TO authenticated;