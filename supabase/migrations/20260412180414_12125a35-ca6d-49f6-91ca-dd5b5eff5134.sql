
CREATE OR REPLACE FUNCTION public.notify_critical_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_critical boolean := false;
  _title text;
  _message text;
  _admin_user_id uuid;
  _details jsonb;
  _entity text;
  _action text;
BEGIN
  _entity := NEW.entity_type;
  _action := NEW.action;
  _details := COALESCE(NEW.details, '{}'::jsonb);

  -- Role changes
  IF _entity = 'user_roles' THEN
    _is_critical := true;
    IF _action = 'created' THEN
      _title := 'Role Assigned';
      _message := format('A new role "%s" was assigned to a user.', _details->>'role');
    ELSIF _action = 'deleted' THEN
      _title := 'Role Removed';
      _message := format('Role "%s" was removed from a user.', _details->>'role');
    ELSIF _action = 'updated' THEN
      _title := 'Role Changed';
      _message := format('A user role was updated (old: %s, new: %s).', _details->'old'->>'role', _details->'new'->>'role');
    END IF;
  END IF;

  -- Account deletion
  IF _entity = 'profiles' AND _action = 'deleted' THEN
    _is_critical := true;
    _title := 'Account Deleted';
    _message := format('Staff profile "%s %s" (ID: %s) was deleted.',
      _details->>'first_name', _details->>'last_name', _details->>'staff_id');
  END IF;

  -- Account locked or login disabled
  IF _entity = 'profiles' AND _action = 'updated' THEN
    -- Check account_locked changed to true
    IF (_details->'new'->>'account_locked')::boolean IS TRUE
       AND ((_details->'old'->>'account_locked')::boolean IS DISTINCT FROM TRUE) THEN
      _is_critical := true;
      _title := 'Account Locked';
      _message := format('Account for "%s %s" was locked.',
        _details->'new'->>'first_name', _details->'new'->>'last_name');
    END IF;
    -- Check login_enabled changed to false
    IF (_details->'new'->>'login_enabled')::boolean IS FALSE
       AND ((_details->'old'->>'login_enabled')::boolean IS DISTINCT FROM FALSE) THEN
      _is_critical := true;
      _title := 'Login Disabled';
      _message := format('Login was disabled for "%s %s".',
        _details->'new'->>'first_name', _details->'new'->>'last_name');
    END IF;
  END IF;

  -- Security incidents created
  IF _entity = 'security_incidents' AND _action = 'created' THEN
    _is_critical := true;
    _title := 'New Security Incident';
    _message := format('Security incident reported: "%s" (severity: %s).',
      _details->>'title', _details->>'severity');
  END IF;

  -- If critical, notify all admins
  IF _is_critical THEN
    FOR _admin_user_id IN
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (_admin_user_id, _title, _message, 'general', NEW.entity_id::text);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_critical_audit_notify
  AFTER INSERT ON public.system_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_critical_audit_event();
