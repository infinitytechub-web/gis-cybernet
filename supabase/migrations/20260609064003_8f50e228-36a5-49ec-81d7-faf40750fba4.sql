CREATE TEMP TABLE IF NOT EXISTS _diag(msg text) ON COMMIT DROP;
-- can't use temp across statements via migration runner, use real table
DROP TABLE IF EXISTS public._delete_diag;
CREATE TABLE public._delete_diag(msg text);
GRANT ALL ON public._delete_diag TO service_role;

DO $$
DECLARE
  v_msg text;
BEGIN
  BEGIN
    DELETE FROM public.profiles WHERE id='d5366d0b-2016-4f10-8b6c-14938b14f6f4';
    INSERT INTO public._delete_diag(msg) VALUES ('DELETE OK');
    RAISE EXCEPTION 'diag_rollback';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      IF v_msg <> 'diag_rollback' THEN
        INSERT INTO public._delete_diag(msg) VALUES ('DELETE FAILED: ' || v_msg);
      ELSE
        INSERT INTO public._delete_diag(msg) VALUES ('DELETE OK (rolled back)');
      END IF;
  END;
END$$;