CREATE OR REPLACE FUNCTION public.set_record_status(_entity text, _id uuid, _status text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _allowed text[];
  _from text;
  _rows int := 0;
  _actor_profile uuid;
  _reason_clean text := nullif(btrim(coalesce(_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _allowed := public.status_workflow_options(_entity);
  IF _allowed IS NULL THEN
    RAISE EXCEPTION 'Status workflow is not available for this record type';
  END IF;
  IF NOT (_status = ANY (_allowed)) THEN
    RAISE EXCEPTION 'Invalid status "%" for this record type', _status;
  END IF;

  EXECUTE format('SELECT status FROM public.%I WHERE id = $1', _entity)
    INTO _from USING _id;
  IF _from IS NULL THEN
    RAISE EXCEPTION 'Record not found or not accessible';
  END IF;
  IF _from = _status THEN
    RAISE EXCEPTION 'Record is already marked as "%"', _status;
  END IF;

  IF _entity = 'detention_records' THEN
    IF _from <> 'in_custody' AND _status <> 'in_custody' THEN
      RAISE EXCEPTION 'This record has already left custody — reopen it as Detained first';
    END IF;
    IF _status <> 'in_custody' AND _reason_clean IS NULL THEN
      RAISE EXCEPTION 'A reason is required when a detainee leaves custody';
    END IF;

    -- detention_records.released_by references public.profiles(id), not auth.users
    SELECT id INTO _actor_profile FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF _status = 'in_custody' THEN
      UPDATE public.detention_records
         SET status = _status,
             released_at = NULL,
             released_by = NULL,
             release_reason = _reason_clean
       WHERE id = _id;
    ELSE
      UPDATE public.detention_records
         SET status = _status,
             released_at = now(),
             released_by = _actor_profile,
             release_reason = _reason_clean
       WHERE id = _id;
    END IF;
    GET DIAGNOSTICS _rows = ROW_COUNT;
  ELSE
    EXECUTE format('UPDATE public.%I SET status = $1 WHERE id = $2', _entity)
      USING _status, _id;
    GET DIAGNOSTICS _rows = ROW_COUNT;
  END IF;

  IF _rows = 0 THEN
    RAISE EXCEPTION 'You are not permitted to change the status of this record';
  END IF;

  INSERT INTO public.status_change_audit (entity_table, record_id, from_status, to_status, reason, changed_by)
  VALUES (_entity, _id, _from, _status, _reason_clean, auth.uid());

  RETURN jsonb_build_object('from_status', _from, 'to_status', _status);
END;
$function$;