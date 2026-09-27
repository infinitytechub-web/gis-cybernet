CREATE OR REPLACE FUNCTION public.can_purge_audit()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.audit_purge_grants g WHERE g.user_id = auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.set_audit_purge_grant(_user_id uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Super Admin only' USING ERRCODE='42501'; END IF;
  IF _grant THEN
    INSERT INTO audit_purge_grants(user_id, granted_by) VALUES (_user_id, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM audit_purge_grants WHERE user_id = _user_id;
  END IF;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES (CASE WHEN _grant THEN 'audit_purge_granted' ELSE 'audit_purge_revoked' END, 'audit_purge_grant', NULL, auth.uid(),
          jsonb_build_object('user_id', _user_id));
END $$;
GRANT EXECUTE ON FUNCTION public.set_audit_purge_grant(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_audit_purge_grants()
RETURNS TABLE(user_id uuid, name text, staff_id text, granted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Super Admin only'; END IF;
  RETURN QUERY SELECT g.user_id, btrim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), p.staff_id, g.granted_at
    FROM audit_purge_grants g LEFT JOIN profiles p ON p.user_id = g.user_id ORDER BY g.granted_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.list_audit_purge_grants() TO authenticated;

CREATE OR REPLACE FUNCTION public.block_guard_import_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Audit rows are immutable';
END $$;

CREATE OR REPLACE FUNCTION public.purge_audit_records(_table text, _before timestamp with time zone, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer; _col text; _allowed text[] := ARRAY[
  'system_audit_log','security_audit_log','staff_access_log','sensitive_table_access_log','front_desk_audit_log',
  'command_role_audit','compliance_upload_audit','enforcement_field_audit','hrm_export_audit','map_access_audit',
  'mfa_challenge_audit','request_approval_audit','session_action_audit','webauthn_audit','biodata_restricted_access_log',
  'staff_list_import_audit','guard_duty_import_audit','staff_bulk_upload_audit','status_change_audit',
  'announcement_file_audit','interlink_lists_audit','ip_block_audit','shift_window_override_audit',
  'rotation_change_proposal_audit','staff_appraisal_audit','account_unlock_audit','command_vault_file_audit'];
BEGIN
  IF NOT public.can_purge_audit() THEN RAISE EXCEPTION 'Not authorised to purge audit records' USING ERRCODE='42501'; END IF;
  IF NOT (_table = ANY(_allowed)) OR to_regclass('public.'||_table) IS NULL THEN RAISE EXCEPTION 'This audit trail cannot be purged'; END IF;
  IF length(coalesce(trim(_reason),'')) < 8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required'; END IF;
  IF _before > now() - interval '30 days' THEN RAISE EXCEPTION 'Only entries older than 30 days can be purged'; END IF;
  SELECT column_name INTO _col FROM information_schema.columns
   WHERE table_schema='public' AND table_name=_table AND data_type LIKE 'timestamp%'
   ORDER BY (column_name='created_at') DESC, ordinal_position LIMIT 1;
  IF _col IS NULL THEN RAISE EXCEPTION 'Audit trail has no timestamp column'; END IF;
  PERFORM set_config('app.audit_purge','on',true);
  EXECUTE format('DELETE FROM public.%I WHERE %I < $1', _table, _col) USING _before;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.audit_purge','off',true);
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES ('purge_audit_records', _table, NULL, auth.uid(),
          jsonb_build_object('before', _before, 'rows', _n, 'reason', trim(_reason)));
  RETURN _n;
END $$;