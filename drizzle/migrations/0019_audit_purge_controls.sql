CREATE TABLE IF NOT EXISTS public.audit_purge_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_purge_grants TO authenticated;
GRANT ALL ON public.audit_purge_grants TO service_role;
ALTER TABLE public.audit_purge_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read purge grants" ON public.audit_purge_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_purge_audit()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.audit_purge_grants g WHERE g.user_id = auth.uid()
                 AND public.has_role(auth.uid(),'admin'));
$$;

-- Only admins may be granted; only Super Admins (admin role) may grant/revoke.
CREATE OR REPLACE FUNCTION public.set_audit_purge_grant(_user_id uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins can manage purge access' USING ERRCODE='42501'; END IF;
  IF _grant THEN
    INSERT INTO audit_purge_grants(user_id, granted_by) VALUES (_user_id, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM audit_purge_grants WHERE user_id = _user_id;
  END IF;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES (CASE WHEN _grant THEN 'grant_audit_purge' ELSE 'revoke_audit_purge' END, 'audit_purge_grant', _user_id, auth.uid(), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.purge_audit_records(_table text, _before timestamptz, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer; _allowed text[] := ARRAY[
  'system_audit_log','security_audit_log','staff_access_log','sensitive_table_access_log','front_desk_audit_log',
  'command_role_audit','compliance_upload_audit','enforcement_field_audit','hrm_export_audit','map_access_audit',
  'mfa_challenge_audit','request_approval_audit','session_action_audit','webauthn_audit','biodata_restricted_access_log',
  'staff_list_import_audit','guard_duty_import_audit','staff_bulk_upload_audit','status_change_audit',
  'announcement_file_audit','interlink_lists_audit','ip_block_audit','shift_window_override_audit',
  'rotation_change_proposal_audit','staff_appraisal_audit','processing_audit_log','account_unlock_audit'];
BEGIN
  IF NOT public.can_purge_audit() THEN RAISE EXCEPTION 'Not authorised to purge audit records' USING ERRCODE='42501'; END IF;
  IF NOT (_table = ANY(_allowed)) OR to_regclass('public.'||_table) IS NULL THEN RAISE EXCEPTION 'This audit trail cannot be purged'; END IF;
  IF length(coalesce(trim(_reason),'')) < 8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required'; END IF;
  IF _before > now() - interval '30 days' THEN RAISE EXCEPTION 'Only entries older than 30 days can be purged'; END IF;
  PERFORM set_config('app.audit_purge','on',true);
  EXECUTE format('DELETE FROM public.%I WHERE created_at < $1', _table) USING _before;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.audit_purge','off',true);
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES ('purge_audit_records', _table, NULL, auth.uid(),
          jsonb_build_object('before', _before, 'rows', _n, 'reason', trim(_reason)));
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.purge_audit_records(text,timestamptz,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_audit_purge_grant(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_purge_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_audit_records(text,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_purge_grant(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_purge_audit() TO authenticated;

-- Let immutability triggers allow deletes only inside the controlled purge.
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['block_security_audit_mutation','block_session_audit_mutation','block_webauthn_audit_mutation',
    'block_biodata_access_log_mutation','block_staff_access_log_mutation','block_staff_list_import_audit_mutation',
    'block_guard_import_audit_mutation','block_threshold_audit_mutation'] LOOP
    IF to_regproc('public.'||f) IS NOT NULL THEN
      d := pg_get_functiondef(('public.'||f)::regproc);
      IF position('app.audit_purge' in d) = 0 THEN
        d := regexp_replace(d, E'\nBEGIN', E'\nBEGIN\n  IF TG_OP = ''DELETE'' AND current_setting(''app.audit_purge'', true) = ''on'' THEN RETURN OLD; END IF;');
        EXECUTE d;
      END IF;
    END IF;
  END LOOP;
END $$;