CREATE OR REPLACE FUNCTION public.notify_critical_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_critical boolean := false;
  _title text;
  _status text;
  _message text;
  _admin_user_id uuid;
  _details jsonb;
  _new jsonb;
  _old jsonb;
  _entity text;
  _action text;
  _role text;
  _old_role text;
  _target uuid;
  _target_name text;
BEGIN
  _entity := NEW.entity_type;
  _action := lower(COALESCE(NEW.action, ''));
  _details := COALESCE(NEW.details, '{}'::jsonb);

  -- normalise the two audit payload shapes: flat row, or {old:..,new:..}/{changes:..}
  _new := COALESCE(_details->'new', _details->'changes', _details);
  _old := COALESCE(_details->'old', '{}'::jsonb);

  IF _action IN ('insert', 'create') THEN _action := 'created';
  ELSIF _action IN ('delete') THEN _action := 'deleted';
  ELSIF _action IN ('update') THEN _action := 'updated';
  END IF;

  BEGIN
    IF _entity = 'user_roles' THEN
      _is_critical := true;
      _role := COALESCE(_new->>'role', _new->'role'->>'new', _details->>'role');
      _old_role := COALESCE(_old->>'role', _new->'role'->>'old');
      _target := NULLIF(COALESCE(_new->>'user_id', _old->>'user_id', _details->>'user_id'), '')::uuid;

      IF _target IS NOT NULL THEN
        SELECT NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
          INTO _target_name
        FROM public.profiles p
        WHERE p.user_id = _target
        LIMIT 1;
      END IF;

      IF _action = 'created' THEN
        _title := 'Role Assigned'; _status := 'assigned';
        _message := format('Role "%s" was assigned to %s.',
                           COALESCE(_role, 'unknown'), COALESCE(_target_name, 'a staff member'));
      ELSIF _action = 'deleted' THEN
        _title := 'Role Removed'; _status := 'removed';
        _message := format('Role "%s" was removed from %s.',
                           COALESCE(_role, 'unknown'), COALESCE(_target_name, 'a staff member'));
      ELSE
        _title := 'Role Changed'; _status := 'changed';
        _message := format('Role for %s updated (old: %s, new: %s).',
                           COALESCE(_target_name, 'a staff member'),
                           COALESCE(_old_role, 'n/a'), COALESCE(_role, 'n/a'));
      END IF;
    END IF;

    IF _entity = 'profiles' AND _action = 'deleted' THEN
      _is_critical := true; _title := 'Account Deleted'; _status := 'deleted';
      _message := format('Profile "%s %s" deleted.',
                         COALESCE(_old->>'first_name', _new->>'first_name', ''),
                         COALESCE(_old->>'last_name', _new->>'last_name', ''));
    END IF;

    IF _entity = 'profiles' AND _action = 'updated' THEN
      IF (_new->'account_locked'->>'new')::boolean IS TRUE
         OR ((_new->>'account_locked')::boolean IS TRUE AND (_old->>'account_locked')::boolean IS DISTINCT FROM TRUE) THEN
        _is_critical := true; _title := 'Account Locked'; _status := 'locked';
        _message := 'An account was locked.';
      END IF;
      IF (_new->'login_enabled'->>'new')::boolean IS FALSE
         OR ((_new->>'login_enabled')::boolean IS FALSE AND (_old->>'login_enabled')::boolean IS DISTINCT FROM FALSE) THEN
        _is_critical := true; _title := 'Login Disabled'; _status := 'disabled';
        _message := 'Login was disabled for an account.';
      END IF;
    END IF;

    IF _entity = 'security_incidents' AND _action = 'created' THEN
      _is_critical := true; _title := 'New Security Incident'; _status := 'open';
      _message := format('Incident: "%s" (severity: %s).',
                         COALESCE(_new->>'title', 'untitled'), COALESCE(_new->>'severity', 'unknown'));
    END IF;

    IF _is_critical THEN
      -- never let a NOT NULL violation swallow the alert
      _title := COALESCE(NULLIF(_title, ''), format('%s %s', _entity, _action));
      _status := COALESCE(NULLIF(_status, ''), _action);
      _message := COALESCE(NULLIF(_message, ''), format('%s record %s.', _entity, _action));
      _message := _message || format(' [status: %s]', _status);

      -- suppress the duplicate raised by the second audit trigger on the same row
      IF EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.title = _title
          AND n.message = _message
          AND n.reference_id IS NOT DISTINCT FROM NEW.entity_id
          AND n.created_at > now() - interval '30 seconds'
      ) THEN
        RETURN NEW;
      END IF;

      FOR _admin_user_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
      LOOP
        INSERT INTO public.notifications (user_id, title, message, type, reference_id)
        VALUES (_admin_user_id, _title, _message, 'general', NEW.entity_id);
      END LOOP;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_critical_audit_event failed: %', SQLERRM;
    BEGIN
      INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
      VALUES ('notify_failed', 'notifications', NEW.entity_id, NEW.performed_by,
              jsonb_build_object('source_entity', _entity, 'source_action', _action, 'error', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;