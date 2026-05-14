CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _misd_id uuid;
  _is_admin boolean;
  _is_command boolean;
  _is_supervisor boolean;
  _is_misd_sup boolean;
BEGIN
  -- Service-role / internal calls (no JWT) bypass field restrictions
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  _is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  _is_command := public.has_role(auth.uid(), 'oic'::app_role)
              OR public.has_role(auth.uid(), '2ic'::app_role);
  _is_supervisor := public.has_role(auth.uid(), 'supervisor'::app_role);
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
$function$;