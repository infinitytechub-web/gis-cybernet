-- Command admin panel: commanders manage officers inside their own command only.

CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _misd_id uuid;
  _is_admin boolean;
  _is_command boolean;
  _is_supervisor boolean;
  _is_misd_sup boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Set only by public.command_admin_update_officer, which performs its own
  -- command-scope and directory-permission checks and writes an audit trail.
  IF coalesce(current_setting('app.command_admin_action', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  _is_command := public.has_role(auth.uid(), 'oic'::app_role)
              OR public.has_role(auth.uid(), '2ic'::app_role);
  _is_supervisor := public.has_role(auth.uid(), 'supervisor'::app_role)
              OR public.has_role(auth.uid(), 'staff_officer'::app_role);
  _is_misd_sup := public.is_misd_supervisor(auth.uid());
  _misd_id := public.get_misd_department_id();

  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    IF NOT (_is_command OR _is_supervisor) THEN
      RAISE EXCEPTION 'Only admins, OIC, 2IC or supervisors can change department';
    END IF;
    IF _misd_id IS NOT NULL
       AND (NEW.department_id = _misd_id OR OLD.department_id = _misd_id)
       AND NOT _is_misd_sup THEN
      RAISE EXCEPTION 'Only admins or MISD/CYBER supervisors can assign staff to or from the MISD/CYBER department';
    END IF;
  END IF;

  IF NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id THEN
    IF NOT (_is_command OR _is_supervisor) THEN
      RAISE EXCEPTION 'Only admins, OIC, 2IC, staff officers or supervisors can change the command posting';
    END IF;
  END IF;

  IF NEW.staff_category IS DISTINCT FROM OLD.staff_category THEN
    RAISE EXCEPTION 'Only admins can change staff category';
  END IF;
  IF NEW.retirement_age IS DISTINCT FROM OLD.retirement_age THEN
    RAISE EXCEPTION 'Only admins can change retirement age';
  END IF;
  IF NEW.rank_id IS DISTINCT FROM OLD.rank_id THEN
    RAISE EXCEPTION 'Only admins can change rank';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only admins can change status';
  END IF;
  IF NEW.account_locked IS DISTINCT FROM OLD.account_locked THEN
    RAISE EXCEPTION 'Only admins can change account_locked';
  END IF;
  IF NEW.login_enabled IS DISTINCT FROM OLD.login_enabled THEN
    RAISE EXCEPTION 'Only admins can change login_enabled';
  END IF;
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Only admins can change staff_id';
  END IF;
  IF NEW.shift_group IS DISTINCT FROM OLD.shift_group THEN
    RAISE EXCEPTION 'Only admins can change shift_group';
  END IF;
  IF NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'Only admins can change unit';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Units the signed-in commander may post officers to: their own command and
-- everything below it (plus assigned branches). Never upward or sideways.
CREATE OR REPLACE FUNCTION public.command_admin_units()
RETURNS TABLE(id uuid, name text, code text, unit_type text, level text, parent_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT u.id, u.name, u.code, u.type::text,
         public.directory_level_of_unit(u.id), u.parent_id
  FROM public.org_units u
  WHERE auth.uid() IS NOT NULL
    AND coalesce(u.is_active, true)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR u.id IN (SELECT public.user_org_scope(auth.uid()))
    )
  ORDER BY u.name
$fn$;

REVOKE ALL ON FUNCTION public.command_admin_units() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_admin_units() FROM anon;
GRANT EXECUTE ON FUNCTION public.command_admin_units() TO authenticated, service_role;

-- The single write path for the command admin panel.
CREATE OR REPLACE FUNCTION public.command_admin_update_officer(
  _profile_id uuid,
  _org_unit_id uuid DEFAULT NULL,
  _shift_group text DEFAULT NULL,
  _status text DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _is_admin boolean;
  _old record;
  _new_unit uuid;
  _new_shift text;
  _new_status staff_status;
  _reason_txt text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);

  IF NOT (_is_admin OR public.is_command_tier(auth.uid())) THEN
    RAISE EXCEPTION 'Only administrators or the command tier can manage officers';
  END IF;

  SELECT p.id, p.org_unit_id, p.shift_group, p.status
    INTO _old
    FROM public.profiles p
   WHERE p.id = _profile_id;

  IF _old.id IS NULL THEN
    RAISE EXCEPTION 'Unknown officer';
  END IF;

  IF NOT _is_admin THEN
    IF _old.org_unit_id IS NULL
       OR _old.org_unit_id NOT IN (SELECT public.user_org_scope(auth.uid())) THEN
      RAISE EXCEPTION 'This officer is not posted inside your command';
    END IF;
    IF NOT public.can_directory_action('edit', _profile_id, auth.uid()) THEN
      RAISE EXCEPTION 'Your role is not permitted to edit officer records at this level';
    END IF;
  END IF;

  _new_unit  := COALESCE(_org_unit_id, _old.org_unit_id);
  _new_shift := COALESCE(NULLIF(btrim(COALESCE(_shift_group, '')), ''), _old.shift_group);

  IF _org_unit_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.org_units u WHERE u.id = _org_unit_id) THEN
      RAISE EXCEPTION 'Unknown command';
    END IF;
    IF NOT _is_admin
       AND _org_unit_id NOT IN (SELECT public.user_org_scope(auth.uid())) THEN
      RAISE EXCEPTION 'You can only post officers inside your own command';
    END IF;
  END IF;

  IF _status IS NOT NULL AND btrim(_status) <> '' THEN
    BEGIN
      _new_status := _status::staff_status;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Unknown status';
    END;
    IF NOT _is_admin AND _new_status IN ('retired', 'interdicted') THEN
      RAISE EXCEPTION 'Only administrators can retire or interdict an officer';
    END IF;
    IF _reason_txt IS NULL AND _new_status IS DISTINCT FROM _old.status THEN
      RAISE EXCEPTION 'A reason is required when changing an officer''s status';
    END IF;
  ELSE
    _new_status := _old.status;
  END IF;

  IF _new_unit IS NOT DISTINCT FROM _old.org_unit_id
     AND _new_shift IS NOT DISTINCT FROM _old.shift_group
     AND _new_status IS NOT DISTINCT FROM _old.status THEN
    RETURN;
  END IF;

  PERFORM set_config('app.command_admin_action', '1', true);

  UPDATE public.profiles
     SET org_unit_id = _new_unit,
         shift_group = _new_shift,
         status = _new_status,
         updated_at = now()
   WHERE id = _profile_id;

  PERFORM set_config('app.command_admin_action', '', true);

  IF _new_unit IS DISTINCT FROM _old.org_unit_id
     OR _new_shift IS DISTINCT FROM _old.shift_group THEN
    INSERT INTO public.command_transfers (
      profile_id, from_org_unit_id, to_org_unit_id, from_level, to_level,
      from_shift_group, to_shift_group, reason, effective_date, moved_by
    ) VALUES (
      _profile_id, _old.org_unit_id, _new_unit,
      public.directory_level_of_unit(_old.org_unit_id),
      public.directory_level_of_unit(_new_unit),
      _old.shift_group, _new_shift, _reason_txt, CURRENT_DATE, auth.uid()
    );
  END IF;

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('UPDATE', 'command_admin_officer', _profile_id, auth.uid(),
    jsonb_build_object(
      'from_org_unit_id', _old.org_unit_id, 'to_org_unit_id', _new_unit,
      'from_shift_group', _old.shift_group, 'to_shift_group', _new_shift,
      'from_status', _old.status, 'to_status', _new_status,
      'reason', _reason_txt));
END;
$fn$;

REVOKE ALL ON FUNCTION public.command_admin_update_officer(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.command_admin_update_officer(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.command_admin_update_officer(uuid, uuid, text, text, text) TO authenticated, service_role;