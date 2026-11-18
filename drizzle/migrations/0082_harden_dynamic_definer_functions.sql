CREATE OR REPLACE FUNCTION public.restore_recycle_bin_entry(_bin_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row RECORD; _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.can_use_recycle_bin(_uid) THEN
    RAISE EXCEPTION 'Not authorised to restore items';
  END IF;
  SELECT * INTO _row FROM public.recycle_bin WHERE id = _bin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recycle bin entry % not found', _bin_id; END IF;
  IF _row.restored_at IS NOT NULL THEN RAISE EXCEPTION 'Item already restored'; END IF;
  IF _row.purged_at IS NOT NULL THEN RAISE EXCEPTION 'Item already permanently deleted'; END IF;
  IF NOT public.is_recyclable_table(_row.table_name) OR to_regclass('public.' || quote_ident(_row.table_name)) IS NULL THEN
    RAISE EXCEPTION 'Table % cannot be restored', _row.table_name;
  END IF;
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO NOTHING',
    _row.table_name, _row.table_name) USING _row.snapshot;
  UPDATE public.recycle_bin SET restored_at = now(), restored_by = _uid WHERE id = _bin_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_deleted_staff(_id uuid, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _p record; _blocking text[] := '{}'; _r record; _hit boolean;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Only Super Admins can purge staff records' USING ERRCODE='42501'; END IF;
  IF length(coalesce(trim(_reason),'')) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  SELECT * INTO _p FROM profiles WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _p.deleted_at IS NULL THEN RAISE EXCEPTION 'Record must be deleted (moved to deleted records) before it can be purged'; END IF;
  FOR _r IN
    SELECT n.nspname AS sch, cl.relname AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
     WHERE c.confrelid='public.profiles'::regclass AND c.contype='f' AND n.nspname = 'public'
       AND EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
                    WHERE tg.tgrelid=c.conrelid AND NOT tg.tgisinternal AND pr.proname LIKE 'block\_%')
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1)', _r.sch, _r.tbl, _r.col) INTO _hit USING _id;
    IF _hit THEN _blocking := array_append(_blocking, _r.tbl::text); END IF;
  END LOOP;
  IF array_length(_blocking,1) > 0 THEN
    RAISE EXCEPTION 'This record is linked to protected audit history (%) and is kept permanently as deleted; it cannot be purged.', array_to_string(_blocking, ', ');
  END IF;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
    VALUES ('purged_staff','staff_account',_id,_uid,
      jsonb_build_object('staff_id',_p.staff_id,'name',trim(coalesce(_p.last_name,'')||' '||coalesce(_p.first_name,'')),'reason',trim(_reason)));
  DELETE FROM profiles WHERE id = _id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_record(text, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_recycle_bin_entry(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purge_audit_records(text, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_staff(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_record(text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_recycle_bin_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_records(text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_staff(uuid, text) TO authenticated;