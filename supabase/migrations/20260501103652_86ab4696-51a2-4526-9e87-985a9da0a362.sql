CREATE OR REPLACE FUNCTION public.security_audit_set_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prev text;
BEGIN
  SELECT row_hash INTO v_prev
  FROM public.security_audit_log
  ORDER BY seq DESC
  LIMIT 1;

  NEW.prev_hash := v_prev;
  NEW.row_hash := encode(extensions.digest(
    coalesce(v_prev,'') || '|' ||
    NEW.id::text || '|' ||
    NEW.category || '|' ||
    NEW.action || '|' ||
    NEW.severity || '|' ||
    coalesce(NEW.actor_id::text,'') || '|' ||
    coalesce(NEW.subject,'') || '|' ||
    coalesce(NEW.details::text,'{}') || '|' ||
    NEW.created_at::text,
    'sha256'), 'hex');
  RETURN NEW;
END;
$$;