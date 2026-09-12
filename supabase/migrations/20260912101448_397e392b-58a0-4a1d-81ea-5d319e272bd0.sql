CREATE OR REPLACE FUNCTION public.staff_list_import_delete(_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_imp public.staff_list_imports;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only System Administrators can delete an uploaded staff list';
  END IF;

  SELECT * INTO v_imp FROM public.staff_list_imports WHERE id = _import_id;
  IF v_imp.id IS NULL THEN
    RAISE EXCEPTION 'That uploaded file no longer exists';
  END IF;
  IF v_imp.status = 'committed' THEN
    RAISE EXCEPTION 'This file has already been applied to staff records and cannot be deleted';
  END IF;

  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('staff_list_import_deleted', 'staff_list_imports', _import_id, auth.uid(),
          jsonb_build_object('file_name', v_imp.file_name,
                             'total_rows', v_imp.total_rows,
                             'status', v_imp.status,
                             'approval_status', v_imp.approval_status));

  DELETE FROM public.staff_list_import_rows WHERE import_id = _import_id;
  -- Audit entries for this file are immutable, so drop them with the parent in
  -- one privileged step after the deletion itself has been recorded above.
  ALTER TABLE public.staff_list_import_audit DISABLE TRIGGER block_staff_list_import_audit_upd;
  DELETE FROM public.staff_list_import_audit WHERE import_id = _import_id;
  ALTER TABLE public.staff_list_import_audit ENABLE TRIGGER block_staff_list_import_audit_upd;
  DELETE FROM public.staff_list_imports WHERE id = _import_id;

  RETURN jsonb_build_object('deleted', true, 'file_name', v_imp.file_name);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_list_import_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_list_import_delete(uuid) TO authenticated;