CREATE TABLE public.status_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  record_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_change_audit_record ON public.status_change_audit (entity_table, record_id, created_at DESC);

GRANT SELECT ON public.status_change_audit TO authenticated;
GRANT ALL ON public.status_change_audit TO service_role;

ALTER TABLE public.status_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier reads all status history"
ON public.status_change_audit FOR SELECT TO authenticated
USING (public.is_command_tier(auth.uid()) OR changed_by = auth.uid());

CREATE OR REPLACE FUNCTION public.status_workflow_options(_entity text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _entity
    WHEN 'operations' THEN ARRAY['open','in_progress','resolved','closed']
    WHEN 'enforcement_operations' THEN ARRAY['open','in_progress','resolved','closed']
    WHEN 'detention_records' THEN ARRAY['in_custody','released','transferred','bail','repatriated','court','escaped']
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.set_record_status(
  _entity text,
  _id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _allowed text[];
  _from text;
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
             released_by = auth.uid(),
             release_reason = _reason_clean
       WHERE id = _id;
    END IF;
  ELSE
    EXECUTE format('UPDATE public.%I SET status = $1 WHERE id = $2', _entity)
      USING _status, _id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not permitted to change the status of this record';
  END IF;

  INSERT INTO public.status_change_audit (entity_table, record_id, from_status, to_status, reason, changed_by)
  VALUES (_entity, _id, _from, _status, _reason_clean, auth.uid());

  RETURN jsonb_build_object('from_status', _from, 'to_status', _status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_record_status(text, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_record_status(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.status_workflow_options(text) TO authenticated;