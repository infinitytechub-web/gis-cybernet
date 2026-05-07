
-- Generic write-audit trigger
CREATE OR REPLACE FUNCTION public.audit_record_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_entity_id uuid;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_entity_id := (v_new->>'id')::uuid;
    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES ('INSERT', TG_TABLE_NAME, v_entity_id, auth.uid(),
            jsonb_build_object('new', v_new));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_entity_id := (v_new->>'id')::uuid;
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_old->k IS DISTINCT FROM v_new->k THEN
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      END IF;
    END LOOP;
    IF v_diff <> '{}'::jsonb THEN
      INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
      VALUES ('UPDATE', TG_TABLE_NAME, v_entity_id, auth.uid(),
              jsonb_build_object('changes', v_diff));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_entity_id := (v_old->>'id')::uuid;
    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES ('DELETE', TG_TABLE_NAME, v_entity_id, auth.uid(),
            jsonb_build_object('old', v_old));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach to staff-sensitive tables (idempotent)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','leave_requests','postings_transfers',
    'excuse_duty_forms','staff_appraisals'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I;', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_record_changes();',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- RPC to log a sensitive read action
CREATE OR REPLACE FUNCTION public.log_sensitive_read(
  _entity_type text,
  _entity_id uuid,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
  VALUES ('READ', _entity_type, _entity_id, auth.uid(), _context);
END;
$$;

REVOKE ALL ON FUNCTION public.log_sensitive_read(text, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_sensitive_read(text, uuid, jsonb) TO authenticated;
