-- Diagnostic delete test wrapped in a function (we won't keep the result).
-- Just to detect FK or trigger failures during delete of the stub profile.
DO $$
DECLARE
  v_msg text;
BEGIN
  BEGIN
    DELETE FROM public.profiles WHERE id='d5366d0b-2016-4f10-8b6c-14938b14f6f4';
    -- Always roll back via exception so we don't actually delete:
    RAISE EXCEPTION 'diag_ok_rollback';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RAISE NOTICE 'delete_result: %', v_msg;
  END;
END$$;