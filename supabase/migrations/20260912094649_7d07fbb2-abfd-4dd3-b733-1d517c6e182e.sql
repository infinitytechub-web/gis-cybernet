ALTER TABLE public.staff_list_imports
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE TABLE IF NOT EXISTS public.staff_list_import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.staff_list_imports(id) ON DELETE CASCADE,
  row_id uuid,
  action text NOT NULL,
  performed_by uuid NOT NULL DEFAULT auth.uid(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_list_import_audit_import
  ON public.staff_list_import_audit(import_id, created_at DESC);

GRANT SELECT, INSERT ON public.staff_list_import_audit TO authenticated;
GRANT ALL ON public.staff_list_import_audit TO service_role;

ALTER TABLE public.staff_list_import_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read staff list import audit" ON public.staff_list_import_audit;
CREATE POLICY "Admins read staff list import audit"
  ON public.staff_list_import_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins write staff list import audit" ON public.staff_list_import_audit;
CREATE POLICY "Admins write staff list import audit"
  ON public.staff_list_import_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND performed_by = auth.uid());

CREATE OR REPLACE FUNCTION public.block_staff_list_import_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Staff list import audit entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS block_staff_list_import_audit_upd ON public.staff_list_import_audit;
CREATE TRIGGER block_staff_list_import_audit_upd
  BEFORE UPDATE OR DELETE ON public.staff_list_import_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_staff_list_import_audit_mutation();

-- Rows of a committed import may no longer be edited.
CREATE OR REPLACE FUNCTION public.guard_staff_list_import_row_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.staff_list_imports WHERE id = NEW.import_id;
  IF v_status = 'committed' AND OLD.outcome = 'committed' THEN
    RAISE EXCEPTION 'This file has already been committed and can no longer be edited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_staff_list_import_row_edit_trg ON public.staff_list_import_rows;
CREATE TRIGGER guard_staff_list_import_row_edit_trg
  BEFORE UPDATE ON public.staff_list_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_list_import_row_edit();

-- Correct a single uploaded row before approval.
CREATE OR REPLACE FUNCTION public.staff_list_import_edit_row(
  _row_id uuid,
  _payload jsonb,
  _outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.staff_list_import_rows;
  v_imp public.staff_list_imports;
  v_outcome text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only System Administrators can edit an uploaded staff list';
  END IF;

  SELECT * INTO v_row FROM public.staff_list_import_rows WHERE id = _row_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Uploaded row not found';
  END IF;

  SELECT * INTO v_imp FROM public.staff_list_imports WHERE id = v_row.import_id;
  IF v_imp.status = 'committed' THEN
    RAISE EXCEPTION 'This file has already been committed and can no longer be edited';
  END IF;
  IF v_imp.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'This file was rejected — upload a corrected file instead';
  END IF;

  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'Row details are missing';
  END IF;
  IF btrim(coalesce(_payload->>'first_name','')) = ''
     OR btrim(coalesce(_payload->>'last_name','')) = '' THEN
    RAISE EXCEPTION 'First name and surname are both required';
  END IF;

  v_outcome := coalesce(nullif(btrim(coalesce(_outcome,'')),''), v_row.outcome);
  IF v_outcome NOT IN ('ready','skipped') THEN
    RAISE EXCEPTION 'Row status must be either ready or skipped';
  END IF;

  UPDATE public.staff_list_import_rows
    SET payload = _payload,
        outcome = v_outcome,
        reason = CASE WHEN v_outcome = 'ready' THEN NULL ELSE reason END
  WHERE id = _row_id;

  UPDATE public.staff_list_imports
    SET skipped_count = (
          SELECT count(*) FROM public.staff_list_import_rows
          WHERE import_id = v_row.import_id AND outcome = 'skipped'
        ),
        updated_at = now()
  WHERE id = v_row.import_id;

  INSERT INTO public.staff_list_import_audit (import_id, row_id, action, details)
  VALUES (v_row.import_id, _row_id, 'row_edited',
          jsonb_build_object('before', v_row.payload, 'after', _payload, 'outcome', v_outcome));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_list_import_edit_row(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_import_edit_row(uuid, jsonb, text) TO authenticated;

-- Approve (and commit) or reject an uploaded staff list.
CREATE OR REPLACE FUNCTION public.staff_list_import_review(
  _import_id uuid,
  _decision text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imp public.staff_list_imports;
  v_res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only System Administrators can approve or reject an uploaded staff list';
  END IF;
  IF _decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject';
  END IF;

  SELECT * INTO v_imp FROM public.staff_list_imports WHERE id = _import_id;
  IF v_imp.id IS NULL THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;
  IF v_imp.status = 'committed' THEN
    RAISE EXCEPTION 'This file has already been committed';
  END IF;

  IF _decision = 'reject' THEN
    IF btrim(coalesce(_notes,'')) = '' THEN
      RAISE EXCEPTION 'A reason is required when rejecting an uploaded file';
    END IF;
    UPDATE public.staff_list_imports
      SET approval_status = 'rejected', status = 'rejected',
          reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes,
          updated_at = now()
    WHERE id = _import_id;
    INSERT INTO public.staff_list_import_audit (import_id, action, details)
    VALUES (_import_id, 'rejected', jsonb_build_object('notes', _notes));
    RETURN jsonb_build_object('approval_status', 'rejected');
  END IF;

  IF v_imp.target_org_unit_id IS NULL THEN
    RAISE EXCEPTION 'Choose the command to import into before approving';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_list_import_rows
    WHERE import_id = _import_id AND outcome = 'ready'
  ) THEN
    RAISE EXCEPTION 'There are no usable rows in this file';
  END IF;

  UPDATE public.staff_list_imports
    SET approval_status = 'approved', status = 'approved',
        reviewed_by = auth.uid(), reviewed_at = now(),
        review_notes = nullif(btrim(coalesce(_notes,'')),''),
        updated_at = now()
  WHERE id = _import_id;

  INSERT INTO public.staff_list_import_audit (import_id, action, details)
  VALUES (_import_id, 'approved', jsonb_build_object('notes', _notes));

  v_res := public.commit_staff_list_import(_import_id);

  INSERT INTO public.staff_list_import_audit (import_id, action, details)
  VALUES (_import_id, 'committed', v_res - 'created_profile_ids');

  RETURN v_res || jsonb_build_object('approval_status', 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.staff_list_import_review(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_import_review(uuid, text, text) TO authenticated;