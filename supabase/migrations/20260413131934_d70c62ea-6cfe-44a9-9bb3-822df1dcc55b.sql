
CREATE OR REPLACE FUNCTION public.notify_critical_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  BEGIN
    IF _entity = 'user_roles' THEN
      _is_critical := true;
      IF _action = 'created' THEN _title := 'Role Assigned'; _message := format('A new role "%s" was assigned.', _details->>'role');
      ELSIF _action = 'deleted' THEN _title := 'Role Removed'; _message := format('Role "%s" was removed.', _details->>'role');
      ELSIF _action = 'updated' THEN _title := 'Role Changed'; _message := format('Role updated (old: %s, new: %s).', _details->'old'->>'role', _details->'new'->>'role');
      END IF;
    END IF;

    IF _entity = 'profiles' AND _action = 'deleted' THEN
      _is_critical := true; _title := 'Account Deleted';
      _message := format('Profile "%s %s" deleted.', _details->>'first_name', _details->>'last_name');
    END IF;

    IF _entity = 'profiles' AND _action = 'updated' THEN
      IF (_details->'new'->>'account_locked')::boolean IS TRUE AND ((_details->'old'->>'account_locked')::boolean IS DISTINCT FROM TRUE) THEN
        _is_critical := true; _title := 'Account Locked'; _message := format('Account locked for "%s %s".', _details->'new'->>'first_name', _details->'new'->>'last_name');
      END IF;
      IF (_details->'new'->>'login_enabled')::boolean IS FALSE AND ((_details->'old'->>'login_enabled')::boolean IS DISTINCT FROM FALSE) THEN
        _is_critical := true; _title := 'Login Disabled'; _message := format('Login disabled for "%s %s".', _details->'new'->>'first_name', _details->'new'->>'last_name');
      END IF;
    END IF;

    IF _entity = 'security_incidents' AND _action = 'created' THEN
      _is_critical := true; _title := 'New Security Incident'; _message := format('Incident: "%s" (severity: %s).', _details->>'title', _details->>'severity');
    END IF;

    IF _is_critical THEN
      FOR _admin_user_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
      LOOP
        INSERT INTO public.notifications (user_id, title, message, type, reference_id)
        VALUES (_admin_user_id, _title, _message, 'general', NEW.entity_id);
      END LOOP;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_critical_audit_event failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
