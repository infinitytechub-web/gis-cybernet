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
  VALUES (v_user, v_staff, v_name, _role, 'assign', v_uid, btrim(_reason));

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('command_appointment', 'profiles', _profile_id, v_uid,
          jsonb_build_object('role', _role, 'org_unit_id', _org_unit_id,
                             'from_org_unit_id', v_from, 'reason', btrim(_reason)));
END;
$function$;

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
  VALUES (v_user, v_staff, v_name, _role, 'remove', v_uid, btrim(_reason));

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('command_appointment_revoked', 'profiles', _profile_id, v_uid,
          jsonb_build_object('role', _role, 'reason', btrim(_reason)));
END;
$function$;