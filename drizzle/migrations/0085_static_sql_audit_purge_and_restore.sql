CREATE OR REPLACE FUNCTION public.purge_audit_records(_table text, _before timestamp with time zone, _reason text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  IF NOT public.can_purge_audit() THEN RAISE EXCEPTION 'Not authorised to purge audit records' USING ERRCODE='42501'; END IF;
  IF length(coalesce(trim(_reason),'')) < 8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required'; END IF;
  IF _before IS NULL OR _before > now() - interval '30 days' THEN RAISE EXCEPTION 'Only entries older than 30 days can be purged'; END IF;
  PERFORM set_config('app.audit_purge','on',true);
  CASE _table
    WHEN 'system_audit_log' THEN DELETE FROM public.system_audit_log WHERE created_at < _before;
    WHEN 'security_audit_log' THEN DELETE FROM public.security_audit_log WHERE created_at < _before;
    WHEN 'staff_access_log' THEN DELETE FROM public.staff_access_log WHERE created_at < _before;
    WHEN 'sensitive_table_access_log' THEN DELETE FROM public.sensitive_table_access_log WHERE created_at < _before;
    WHEN 'front_desk_audit_log' THEN DELETE FROM public.front_desk_audit_log WHERE created_at < _before;
    WHEN 'command_role_audit' THEN DELETE FROM public.command_role_audit WHERE created_at < _before;
    WHEN 'compliance_upload_audit' THEN DELETE FROM public.compliance_upload_audit WHERE created_at < _before;
    WHEN 'enforcement_field_audit' THEN DELETE FROM public.enforcement_field_audit WHERE created_at < _before;
    WHEN 'hrm_export_audit' THEN DELETE FROM public.hrm_export_audit WHERE created_at < _before;
    WHEN 'map_access_audit' THEN DELETE FROM public.map_access_audit WHERE occurred_at < _before;
    WHEN 'mfa_challenge_audit' THEN DELETE FROM public.mfa_challenge_audit WHERE created_at < _before;
    WHEN 'request_approval_audit' THEN DELETE FROM public.request_approval_audit WHERE created_at < _before;
    WHEN 'session_action_audit' THEN DELETE FROM public.session_action_audit WHERE created_at < _before;
    WHEN 'webauthn_audit' THEN DELETE FROM public.webauthn_audit WHERE created_at < _before;
    WHEN 'biodata_restricted_access_log' THEN DELETE FROM public.biodata_restricted_access_log WHERE created_at < _before;
    WHEN 'staff_list_import_audit' THEN DELETE FROM public.staff_list_import_audit WHERE created_at < _before;
    WHEN 'guard_duty_import_audit' THEN DELETE FROM public.guard_duty_import_audit WHERE created_at < _before;
    WHEN 'staff_bulk_upload_audit' THEN DELETE FROM public.staff_bulk_upload_audit WHERE uploaded_at < _before;
    WHEN 'status_change_audit' THEN DELETE FROM public.status_change_audit WHERE created_at < _before;
    WHEN 'announcement_file_audit' THEN DELETE FROM public.announcement_file_audit WHERE created_at < _before;
    WHEN 'interlink_lists_audit' THEN DELETE FROM public.interlink_lists_audit WHERE created_at < _before;
    WHEN 'ip_block_audit' THEN DELETE FROM public.ip_block_audit WHERE created_at < _before;
    WHEN 'shift_window_override_audit' THEN DELETE FROM public.shift_window_override_audit WHERE created_at < _before;
    WHEN 'rotation_change_proposal_audit' THEN DELETE FROM public.rotation_change_proposal_audit WHERE created_at < _before;
    WHEN 'staff_appraisal_audit' THEN DELETE FROM public.staff_appraisal_audit WHERE created_at < _before;
    WHEN 'account_unlock_audit' THEN DELETE FROM public.account_unlock_audit WHERE created_at < _before;
    WHEN 'command_vault_file_audit' THEN DELETE FROM public.command_vault_file_audit WHERE created_at < _before;
    WHEN 'me_message_audit' THEN DELETE FROM public.me_message_audit WHERE created_at < _before;
    ELSE RAISE EXCEPTION 'This audit trail cannot be purged';
  END CASE;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.audit_purge','off',true);
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES ('purge_audit_records', _table, NULL, auth.uid(), jsonb_build_object('before', _before, 'rows', _n, 'reason', trim(_reason)));
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.restore_recycle_bin_entry(_bin_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _row RECORD; _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.can_use_recycle_bin(_uid) THEN RAISE EXCEPTION 'Not authorised to restore items'; END IF;
  SELECT * INTO _row FROM public.recycle_bin WHERE id = _bin_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recycle bin entry % not found', _bin_id; END IF;
  IF _row.restored_at IS NOT NULL THEN RAISE EXCEPTION 'Item already restored'; END IF;
  IF _row.purged_at IS NOT NULL THEN RAISE EXCEPTION 'Item already permanently deleted'; END IF;
  CASE _row.table_name
    WHEN 'announcements' THEN INSERT INTO public.announcements SELECT * FROM jsonb_populate_record(NULL::public.announcements, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'announcement_files' THEN INSERT INTO public.announcement_files SELECT * FROM jsonb_populate_record(NULL::public.announcement_files, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'holidays' THEN INSERT INTO public.holidays SELECT * FROM jsonb_populate_record(NULL::public.holidays, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'departments' THEN INSERT INTO public.departments SELECT * FROM jsonb_populate_record(NULL::public.departments, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'staff_documents' THEN INSERT INTO public.staff_documents SELECT * FROM jsonb_populate_record(NULL::public.staff_documents, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'command_vault_files' THEN INSERT INTO public.command_vault_files SELECT * FROM jsonb_populate_record(NULL::public.command_vault_files, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'report_uploads' THEN INSERT INTO public.report_uploads SELECT * FROM jsonb_populate_record(NULL::public.report_uploads, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'report_schedules' THEN INSERT INTO public.report_schedules SELECT * FROM jsonb_populate_record(NULL::public.report_schedules, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'procurement_documents' THEN INSERT INTO public.procurement_documents SELECT * FROM jsonb_populate_record(NULL::public.procurement_documents, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'shift_assignments' THEN INSERT INTO public.shift_assignments SELECT * FROM jsonb_populate_record(NULL::public.shift_assignments, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'misd_unit_assignments' THEN INSERT INTO public.misd_unit_assignments SELECT * FROM jsonb_populate_record(NULL::public.misd_unit_assignments, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'certifications' THEN INSERT INTO public.certifications SELECT * FROM jsonb_populate_record(NULL::public.certifications, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'equipment_issuance' THEN INSERT INTO public.equipment_issuance SELECT * FROM jsonb_populate_record(NULL::public.equipment_issuance, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'inventory_items' THEN INSERT INTO public.inventory_items SELECT * FROM jsonb_populate_record(NULL::public.inventory_items, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'inventory_categories' THEN INSERT INTO public.inventory_categories SELECT * FROM jsonb_populate_record(NULL::public.inventory_categories, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'inventory_suppliers' THEN INSERT INTO public.inventory_suppliers SELECT * FROM jsonb_populate_record(NULL::public.inventory_suppliers, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'detention_records' THEN INSERT INTO public.detention_records SELECT * FROM jsonb_populate_record(NULL::public.detention_records, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'enforcement_operations' THEN INSERT INTO public.enforcement_operations SELECT * FROM jsonb_populate_record(NULL::public.enforcement_operations, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'operations' THEN INSERT INTO public.operations SELECT * FROM jsonb_populate_record(NULL::public.operations, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'cyber_incidents' THEN INSERT INTO public.cyber_incidents SELECT * FROM jsonb_populate_record(NULL::public.cyber_incidents, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'cyber_investigations' THEN INSERT INTO public.cyber_investigations SELECT * FROM jsonb_populate_record(NULL::public.cyber_investigations, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'cyber_threat_intel' THEN INSERT INTO public.cyber_threat_intel SELECT * FROM jsonb_populate_record(NULL::public.cyber_threat_intel, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'leave_requests' THEN INSERT INTO public.leave_requests SELECT * FROM jsonb_populate_record(NULL::public.leave_requests, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'postings_transfers' THEN INSERT INTO public.postings_transfers SELECT * FROM jsonb_populate_record(NULL::public.postings_transfers, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'visa_applications' THEN INSERT INTO public.visa_applications SELECT * FROM jsonb_populate_record(NULL::public.visa_applications, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'visa_extensions' THEN INSERT INTO public.visa_extensions SELECT * FROM jsonb_populate_record(NULL::public.visa_extensions, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'permits' THEN INSERT INTO public.permits SELECT * FROM jsonb_populate_record(NULL::public.permits, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'passport_applications' THEN INSERT INTO public.passport_applications SELECT * FROM jsonb_populate_record(NULL::public.passport_applications, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'official_applications' THEN INSERT INTO public.official_applications SELECT * FROM jsonb_populate_record(NULL::public.official_applications, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'enquiry_applications' THEN INSERT INTO public.enquiry_applications SELECT * FROM jsonb_populate_record(NULL::public.enquiry_applications, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'front_desk_audit_log' THEN INSERT INTO public.front_desk_audit_log SELECT * FROM jsonb_populate_record(NULL::public.front_desk_audit_log, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'night_guard_activity_log' THEN INSERT INTO public.night_guard_activity_log SELECT * FROM jsonb_populate_record(NULL::public.night_guard_activity_log, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'platform_sync_history' THEN INSERT INTO public.platform_sync_history SELECT * FROM jsonb_populate_record(NULL::public.platform_sync_history, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    WHEN 'staff_appraisals' THEN INSERT INTO public.staff_appraisals SELECT * FROM jsonb_populate_record(NULL::public.staff_appraisals, _row.snapshot) ON CONFLICT (id) DO NOTHING;
    ELSE RAISE EXCEPTION 'Table % cannot be restored', _row.table_name;
  END CASE;
  UPDATE public.recycle_bin SET restored_at = now(), restored_by = _uid WHERE id = _bin_id;
END;
$function$;