ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE OR REPLACE FUNCTION public.can_delete_staff_record(_profile_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin')
    OR public.can_directory_action('delete', _profile_id, _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_staff(_ids uuid[], _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _n int := 0; _p record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
  IF length(coalesce(trim(_reason),'')) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  FOREACH _id IN ARRAY _ids LOOP
    SELECT id, user_id, staff_id, first_name, last_name, deleted_at INTO _p FROM profiles WHERE id = _id;
    IF NOT FOUND OR _p.deleted_at IS NOT NULL THEN CONTINUE; END IF;
    IF NOT public.can_delete_staff_record(_id, _uid) THEN
      RAISE EXCEPTION 'You are not authorised to delete staff record %', coalesce(_p.staff_id,_id::text) USING ERRCODE='42501';
    END IF;
    IF _p.user_id = _uid THEN RAISE EXCEPTION 'You cannot delete your own record'; END IF;
    IF _p.staff_id IN ('ADMIN-001','DEPUTY-001') THEN RAISE EXCEPTION '% is a protected system account', _p.staff_id; END IF;
    UPDATE profiles SET deleted_at = now(), deleted_by = _uid, deletion_reason = trim(_reason), status = 'inactive' WHERE id = _id;
    INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
      VALUES ('soft_deleted_staff','staff_account',_id,_uid,
        jsonb_build_object('staff_id',_p.staff_id,'name',trim(coalesce(_p.last_name,'')||' '||coalesce(_p.first_name,'')),'reason',trim(_reason)));
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.restore_deleted_staff(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NOT public.can_delete_staff_record(_id, _uid) THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
  UPDATE profiles SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL WHERE id = _id AND deleted_at IS NOT NULL;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
    VALUES ('restored_staff','staff_account',_id,_uid,'{}'::jsonb);
END $$;

-- Controlled purge: admin only, only after soft deletion, refuses when protected history exists.
CREATE OR REPLACE FUNCTION public.purge_deleted_staff(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p record; _blocking text[] := '{}'; _r record; _hit boolean;
BEGIN
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Only Super Admins can purge staff records' USING ERRCODE='42501'; END IF;
  IF length(coalesce(trim(_reason),'')) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  SELECT * INTO _p FROM profiles WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _p.deleted_at IS NULL THEN RAISE EXCEPTION 'Record must be deleted (moved to deleted records) before it can be purged'; END IF;
  FOR _r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
     WHERE c.confrelid='public.profiles'::regclass AND c.contype='f'
       AND EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
                    WHERE tg.tgrelid=c.conrelid AND NOT tg.tgisinternal AND pr.proname LIKE 'block\_%')
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I = $1)', _r.tbl, _r.col) INTO _hit USING _id;
    IF _hit THEN _blocking := array_append(_blocking, _r.tbl); END IF;
  END LOOP;
  IF array_length(_blocking,1) > 0 THEN
    RAISE EXCEPTION 'This record is linked to protected audit history (%) and is kept permanently as deleted; it cannot be purged.', array_to_string(_blocking, ', ');
  END IF;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
    VALUES ('purged_staff','staff_account',_id,_uid,
      jsonb_build_object('staff_id',_p.staff_id,'name',trim(coalesce(_p.last_name,'')||' '||coalesce(_p.first_name,'')),'reason',trim(_reason)));
  DELETE FROM profiles WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.soft_delete_staff(uuid[], text), public.restore_deleted_staff(uuid), public.purge_deleted_staff(uuid, text), public.can_delete_staff_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_staff(uuid[], text), public.restore_deleted_staff(uuid), public.purge_deleted_staff(uuid, text), public.can_delete_staff_record(uuid, uuid) TO authenticated;