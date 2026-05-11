-- 1. soft_delete_record: enforce can_use_recycle_bin guard
CREATE OR REPLACE FUNCTION public.soft_delete_record(
  _table TEXT,
  _record_id UUID,
  _display_label TEXT DEFAULT NULL,
  _display_context TEXT DEFAULT NULL,
  _storage_paths JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
  _bin_id UUID;
  _user_name TEXT;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Privilege guard: only admin / OIC / 2IC roles can move records to the bin.
  IF NOT public.can_use_recycle_bin(_uid) THEN
    RAISE EXCEPTION 'Insufficient privilege to delete records';
  END IF;

  IF NOT public.is_recyclable_table(_table) THEN
    RAISE EXCEPTION 'Table % is not recyclable', _table;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', _table)
    INTO _snapshot
    USING _record_id;

  IF _snapshot IS NULL THEN
    RAISE EXCEPTION 'Record % not found in %', _record_id, _table;
  END IF;

  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _user_name
  FROM public.profiles
  WHERE user_id = _uid
  LIMIT 1;

  INSERT INTO public.recycle_bin (
    table_name, record_id, snapshot, storage_paths,
    display_label, display_context, deleted_by, deleted_by_name
  ) VALUES (
    _table, _record_id, _snapshot, COALESCE(_storage_paths, '[]'::jsonb),
    _display_label, _display_context, _uid, NULLIF(trim(_user_name), '')
  )
  RETURNING id INTO _bin_id;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table)
    USING _record_id;

  RETURN _bin_id;
END;
$$;

-- 2. Revoke anonymous access to the staff-id email lookup. Authenticated
-- callers can still use it; unauthenticated login flows must go through the
-- new resolve-staff-email edge function which adds rate limiting + auditing.
REVOKE EXECUTE ON FUNCTION public.get_email_by_staff_id(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_email_by_staff_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_staff_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_staff_id(text) TO service_role;