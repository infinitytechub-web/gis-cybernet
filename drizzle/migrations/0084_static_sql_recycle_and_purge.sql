CREATE OR REPLACE FUNCTION public.soft_delete_record(_table text, _record_id uuid, _display_label text DEFAULT NULL::text, _display_context text DEFAULT NULL::text, _storage_paths jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _snapshot jsonb; _bin_id uuid; _user_name text; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_use_recycle_bin(_uid) THEN RAISE EXCEPTION 'Insufficient privilege to delete records'; END IF;
  IF NOT public.is_recyclable_table(_table) THEN RAISE EXCEPTION 'Table % is not recyclable', _table; END IF;
  CASE _table
    WHEN 'announcements' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.announcements t WHERE t.id = _record_id;
    WHEN 'announcement_files' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.announcement_files t WHERE t.id = _record_id;
    WHEN 'holidays' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.holidays t WHERE t.id = _record_id;
    WHEN 'departments' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.departments t WHERE t.id = _record_id;
    WHEN 'staff_documents' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.staff_documents t WHERE t.id = _record_id;
    WHEN 'command_vault_files' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.command_vault_files t WHERE t.id = _record_id;
    WHEN 'report_uploads' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.report_uploads t WHERE t.id = _record_id;
    WHEN 'report_schedules' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.report_schedules t WHERE t.id = _record_id;
    WHEN 'procurement_documents' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.procurement_documents t WHERE t.id = _record_id;
    WHEN 'shift_assignments' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.shift_assignments t WHERE t.id = _record_id;
    WHEN 'misd_unit_assignments' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.misd_unit_assignments t WHERE t.id = _record_id;
    WHEN 'certifications' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.certifications t WHERE t.id = _record_id;
    WHEN 'equipment_issuance' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.equipment_issuance t WHERE t.id = _record_id;
    WHEN 'inventory_items' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.inventory_items t WHERE t.id = _record_id;
    WHEN 'inventory_categories' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.inventory_categories t WHERE t.id = _record_id;
    WHEN 'inventory_suppliers' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.inventory_suppliers t WHERE t.id = _record_id;
    WHEN 'detention_records' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.detention_records t WHERE t.id = _record_id;
    WHEN 'enforcement_operations' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.enforcement_operations t WHERE t.id = _record_id;
    WHEN 'operations' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.operations t WHERE t.id = _record_id;
    WHEN 'cyber_incidents' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.cyber_incidents t WHERE t.id = _record_id;
    WHEN 'cyber_investigations' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.cyber_investigations t WHERE t.id = _record_id;
    WHEN 'cyber_threat_intel' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.cyber_threat_intel t WHERE t.id = _record_id;
    WHEN 'leave_requests' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.leave_requests t WHERE t.id = _record_id;
    WHEN 'postings_transfers' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.postings_transfers t WHERE t.id = _record_id;
    WHEN 'visa_applications' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.visa_applications t WHERE t.id = _record_id;
    WHEN 'visa_extensions' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.visa_extensions t WHERE t.id = _record_id;
    WHEN 'permits' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.permits t WHERE t.id = _record_id;
    WHEN 'passport_applications' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.passport_applications t WHERE t.id = _record_id;
    WHEN 'official_applications' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.official_applications t WHERE t.id = _record_id;
    WHEN 'enquiry_applications' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.enquiry_applications t WHERE t.id = _record_id;
    WHEN 'front_desk_audit_log' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.front_desk_audit_log t WHERE t.id = _record_id;
    WHEN 'night_guard_activity_log' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.night_guard_activity_log t WHERE t.id = _record_id;
    WHEN 'platform_sync_history' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.platform_sync_history t WHERE t.id = _record_id;
    WHEN 'staff_appraisals' THEN SELECT to_jsonb(t) INTO _snapshot FROM public.staff_appraisals t WHERE t.id = _record_id;
    ELSE RAISE EXCEPTION 'Table % is not recyclable', _table;
  END CASE;
  IF _snapshot IS NULL THEN RAISE EXCEPTION 'Record % not found in %', _record_id, _table; END IF;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) INTO _user_name FROM public.profiles WHERE user_id = _uid LIMIT 1;
  INSERT INTO public.recycle_bin (table_name, record_id, snapshot, storage_paths, display_label, display_context, deleted_by, deleted_by_name)
  VALUES (_table, _record_id, _snapshot, COALESCE(_storage_paths, '[]'::jsonb), _display_label, _display_context, _uid, NULLIF(trim(_user_name), ''))
  RETURNING id INTO _bin_id;
  CASE _table
    WHEN 'announcements' THEN DELETE FROM public.announcements WHERE id = _record_id;
    WHEN 'announcement_files' THEN DELETE FROM public.announcement_files WHERE id = _record_id;
    WHEN 'holidays' THEN DELETE FROM public.holidays WHERE id = _record_id;
    WHEN 'departments' THEN DELETE FROM public.departments WHERE id = _record_id;
    WHEN 'staff_documents' THEN DELETE FROM public.staff_documents WHERE id = _record_id;
    WHEN 'command_vault_files' THEN DELETE FROM public.command_vault_files WHERE id = _record_id;
    WHEN 'report_uploads' THEN DELETE FROM public.report_uploads WHERE id = _record_id;
    WHEN 'report_schedules' THEN DELETE FROM public.report_schedules WHERE id = _record_id;
    WHEN 'procurement_documents' THEN DELETE FROM public.procurement_documents WHERE id = _record_id;
    WHEN 'shift_assignments' THEN DELETE FROM public.shift_assignments WHERE id = _record_id;
    WHEN 'misd_unit_assignments' THEN DELETE FROM public.misd_unit_assignments WHERE id = _record_id;
    WHEN 'certifications' THEN DELETE FROM public.certifications WHERE id = _record_id;
    WHEN 'equipment_issuance' THEN DELETE FROM public.equipment_issuance WHERE id = _record_id;
    WHEN 'inventory_items' THEN DELETE FROM public.inventory_items WHERE id = _record_id;
    WHEN 'inventory_categories' THEN DELETE FROM public.inventory_categories WHERE id = _record_id;
    WHEN 'inventory_suppliers' THEN DELETE FROM public.inventory_suppliers WHERE id = _record_id;
    WHEN 'detention_records' THEN DELETE FROM public.detention_records WHERE id = _record_id;
    WHEN 'enforcement_operations' THEN DELETE FROM public.enforcement_operations WHERE id = _record_id;
    WHEN 'operations' THEN DELETE FROM public.operations WHERE id = _record_id;
    WHEN 'cyber_incidents' THEN DELETE FROM public.cyber_incidents WHERE id = _record_id;
    WHEN 'cyber_investigations' THEN DELETE FROM public.cyber_investigations WHERE id = _record_id;
    WHEN 'cyber_threat_intel' THEN DELETE FROM public.cyber_threat_intel WHERE id = _record_id;
    WHEN 'leave_requests' THEN DELETE FROM public.leave_requests WHERE id = _record_id;
    WHEN 'postings_transfers' THEN DELETE FROM public.postings_transfers WHERE id = _record_id;
    WHEN 'visa_applications' THEN DELETE FROM public.visa_applications WHERE id = _record_id;
    WHEN 'visa_extensions' THEN DELETE FROM public.visa_extensions WHERE id = _record_id;
    WHEN 'permits' THEN DELETE FROM public.permits WHERE id = _record_id;
    WHEN 'passport_applications' THEN DELETE FROM public.passport_applications WHERE id = _record_id;
    WHEN 'official_applications' THEN DELETE FROM public.official_applications WHERE id = _record_id;
    WHEN 'enquiry_applications' THEN DELETE FROM public.enquiry_applications WHERE id = _record_id;
    WHEN 'front_desk_audit_log' THEN DELETE FROM public.front_desk_audit_log WHERE id = _record_id;
    WHEN 'night_guard_activity_log' THEN DELETE FROM public.night_guard_activity_log WHERE id = _record_id;
    WHEN 'platform_sync_history' THEN DELETE FROM public.platform_sync_history WHERE id = _record_id;
    WHEN 'staff_appraisals' THEN DELETE FROM public.staff_appraisals WHERE id = _record_id;
  END CASE;
  RETURN _bin_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_deleted_staff(_id uuid, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _p record; _blocking text[] := '{}';
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Only Super Admins can purge staff records' USING ERRCODE='42501'; END IF;
  IF length(coalesce(trim(_reason),'')) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  SELECT * INTO _p FROM profiles WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _p.deleted_at IS NULL THEN RAISE EXCEPTION 'Record must be deleted (moved to deleted records) before it can be purged'; END IF;
  IF EXISTS (SELECT 1 FROM public.biodata_restricted_access_log WHERE profile_id = _id) THEN _blocking := array_append(_blocking, 'biodata_restricted_access_log'); END IF;
  IF EXISTS (SELECT 1 FROM public.command_rank_changes WHERE profile_id = _id) THEN _blocking := array_append(_blocking, 'command_rank_changes'); END IF;
  IF EXISTS (SELECT 1 FROM public.command_transfers WHERE profile_id = _id) THEN _blocking := array_append(_blocking, 'command_transfers'); END IF;
  IF EXISTS (SELECT 1 FROM public.detention_records WHERE arresting_officer_id = _id OR officer_in_charge_id = _id OR released_by = _id OR statement_approved_by = _id) THEN _blocking := array_append(_blocking, 'detention_records'); END IF;
  IF EXISTS (SELECT 1 FROM public.shift_assignment_overrides WHERE performed_by = _id OR profile_id = _id) THEN _blocking := array_append(_blocking, 'shift_assignment_overrides'); END IF;
  IF EXISTS (SELECT 1 FROM public.staff_access_log WHERE actor_profile_id = _id OR target_profile_id = _id) THEN _blocking := array_append(_blocking, 'staff_access_log'); END IF;
  IF EXISTS (SELECT 1 FROM public.staff_deactivations WHERE profile_id = _id) THEN _blocking := array_append(_blocking, 'staff_deactivations'); END IF;
  IF EXISTS (SELECT 1 FROM public.staff_signatures WHERE profile_id = _id) THEN _blocking := array_append(_blocking, 'staff_signatures'); END IF;
  IF array_length(_blocking,1) > 0 THEN
    RAISE EXCEPTION 'This record is linked to protected audit history (%) and is kept permanently as deleted; it cannot be purged.', array_to_string(_blocking, ', ');
  END IF;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
    VALUES ('purged_staff','staff_account',_id,_uid,
      jsonb_build_object('staff_id',_p.staff_id,'name',trim(coalesce(_p.last_name,'')||' '||coalesce(_p.first_name,'')),'reason',trim(_reason)));
  DELETE FROM profiles WHERE id = _id;
END $function$;