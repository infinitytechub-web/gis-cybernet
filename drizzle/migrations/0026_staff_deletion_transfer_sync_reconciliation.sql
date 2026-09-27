CREATE TABLE public.staff_record_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  event text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  cleanup jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_record_archive TO authenticated;
GRANT ALL ON public.staff_record_archive TO service_role;
ALTER TABLE public.staff_record_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read staff archive" ON public.staff_record_archive
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Remove a profile from active operational records; keep retained history.
CREATE OR REPLACE FUNCTION public.staff_detach_operational(_profile_id uuid, _scope_root uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := '{}'::jsonb; n int; _uid uuid; _in_scope uuid[];
BEGIN
  SELECT user_id INTO _uid FROM profiles WHERE id = _profile_id;
  IF _scope_root IS NOT NULL THEN
    SELECT array_agg(d) INTO _in_scope FROM org_unit_descendants(_scope_root) d;
  END IF;
  BEGIN
    UPDATE org_positions SET holder_profile_id = NULL, end_date = COALESCE(end_date, current_date), updated_at = now()
     WHERE holder_profile_id = _profile_id AND (_in_scope IS NULL OR org_unit_id = ANY(_in_scope));
    GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('positions_vacated', n);
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('positions_error', SQLERRM); END;
  BEGIN
    DELETE FROM guard_schedule_assignments WHERE profile_id = _profile_id AND duty_date >= current_date;
    GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('future_guard_duties_removed', n);
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('guard_error', SQLERRM); END;
  BEGIN
    UPDATE shift_assignments SET end_date = current_date
     WHERE profile_id = _profile_id AND (end_date IS NULL OR end_date > current_date);
    GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('shift_assignments_ended', n);
  EXCEPTION WHEN others THEN r := r || jsonb_build_object('shift_error', SQLERRM); END;
  IF _scope_root IS NULL THEN
    BEGIN
      DELETE FROM misd_unit_assignments WHERE profile_id = _profile_id;
      GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('misd_units_removed', n);
    EXCEPTION WHEN others THEN r := r || jsonb_build_object('misd_error', SQLERRM); END;
  END IF;
  IF _uid IS NOT NULL THEN
    BEGIN
      UPDATE org_unit_assignments SET revoked_at = now(), updated_at = now()
       WHERE user_id = _uid AND revoked_at IS NULL AND (_in_scope IS NULL OR org_unit_id = ANY(_in_scope));
      GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('command_rights_revoked', n);
    EXCEPTION WHEN others THEN r := r || jsonb_build_object('rights_error', SQLERRM); END;
    IF _scope_root IS NULL THEN
      BEGIN
        UPDATE command_tier_grants SET revoked_at = now(), updated_at = now() WHERE user_id = _uid AND revoked_at IS NULL;
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('module_grants_revoked', n);
      EXCEPTION WHEN others THEN r := r || jsonb_build_object('grants_error', SQLERRM); END;
      BEGIN
        DELETE FROM user_roles WHERE user_id = _uid AND role <> 'staff';
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('roles_removed', n);
      EXCEPTION WHEN others THEN r := r || jsonb_build_object('roles_error', SQLERRM); END;
    END IF;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.staff_detach_operational(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_profile_lifecycle_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    c := staff_detach_operational(NEW.id, NULL);
    INSERT INTO staff_record_archive(profile_id, event, snapshot, cleanup, performed_by)
    VALUES (NEW.id, 'deleted', to_jsonb(OLD) - 'photo_url', c, COALESCE(NEW.deleted_by, auth.uid()));
    INSERT INTO system_audit_log(entity_type, action, entity_id, performed_by, details)
    VALUES ('staff_account', 'deletion_cascade', NEW.id, COALESCE(NEW.deleted_by, auth.uid()), c);
  ELSIF NEW.deleted_at IS NULL AND OLD.org_unit_id IS DISTINCT FROM NEW.org_unit_id AND OLD.org_unit_id IS NOT NULL THEN
    c := staff_detach_operational(NEW.id, OLD.org_unit_id);
    INSERT INTO staff_record_archive(profile_id, event, snapshot, cleanup, performed_by)
    VALUES (NEW.id, 'transferred', jsonb_build_object('from_org_unit_id', OLD.org_unit_id, 'to_org_unit_id', NEW.org_unit_id), c, auth.uid());
    INSERT INTO system_audit_log(entity_type, action, entity_id, performed_by, details)
    VALUES ('staff_account', 'transfer_cascade', NEW.id, auth.uid(),
      c || jsonb_build_object('from_org_unit_id', OLD.org_unit_id, 'to_org_unit_id', NEW.org_unit_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profile_lifecycle_sync ON public.profiles;
CREATE TRIGGER profile_lifecycle_sync AFTER UPDATE OF deleted_at, org_unit_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_lifecycle_sync();

-- Reconciliation preview
CREATE OR REPLACE FUNCTION public.reconcile_staff_records_preview()
RETURNS TABLE(issue text, profile_id uuid, staff_id text, full_name text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Super Admin only'; END IF;
  RETURN QUERY
  SELECT 'duplicate_staff_id', p.id, p.staff_id, trim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), 'Staff ID used by '||cnt||' active records'
    FROM (SELECT *, count(*) OVER (PARTITION BY upper(staff_id)) cnt FROM profiles WHERE deleted_at IS NULL AND staff_id IS NOT NULL) p WHERE cnt > 1
  UNION ALL
  SELECT 'duplicate_ghana_card', p.id, p.staff_id, trim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), 'Ghana Card shared by '||cnt||' active records'
    FROM (SELECT *, count(*) OVER (PARTITION BY upper(replace(ghana_card_number,' ',''))) cnt FROM profiles WHERE deleted_at IS NULL AND coalesce(ghana_card_number,'') <> '') p WHERE cnt > 1
  UNION ALL
  SELECT 'duplicate_name_dob', p.id, p.staff_id, trim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), 'Same name and date of birth as '||(cnt-1)||' other record(s)'
    FROM (SELECT *, count(*) OVER (PARTITION BY lower(trim(last_name)), lower(trim(first_name)), date_of_birth) cnt FROM profiles WHERE deleted_at IS NULL AND date_of_birth IS NOT NULL) p WHERE cnt > 1
  UNION ALL
  SELECT 'stale_assignment', p.id, p.staff_id, trim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), 'Deleted officer still holds positions, rights, roles or future duties'
    FROM profiles p WHERE p.deleted_at IS NOT NULL AND (
      EXISTS (SELECT 1 FROM org_positions o WHERE o.holder_profile_id = p.id)
      OR EXISTS (SELECT 1 FROM guard_schedule_assignments g WHERE g.profile_id = p.id AND g.duty_date >= current_date)
      OR EXISTS (SELECT 1 FROM misd_unit_assignments m WHERE m.profile_id = p.id)
      OR (p.user_id IS NOT NULL AND (EXISTS (SELECT 1 FROM org_unit_assignments a WHERE a.user_id = p.user_id AND a.revoked_at IS NULL)
          OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role <> 'staff'))))
  UNION ALL
  SELECT 'orphan_org_unit', p.id, p.staff_id, trim(coalesce(p.last_name,'')||' '||coalesce(p.first_name,'')), 'Posted to a command that no longer exists'
    FROM profiles p WHERE p.deleted_at IS NULL AND p.org_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units u WHERE u.id = p.org_unit_id)
  UNION ALL
  SELECT 'orphan_position_holder', NULL::uuid, NULL::text, o.title, 'Position points to a missing staff record'
    FROM org_positions o WHERE o.holder_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = o.holder_profile_id);
END $$;
GRANT EXECUTE ON FUNCTION public.reconcile_staff_records_preview() TO authenticated;

-- Apply only safe, approved fixes. Duplicates are never auto-merged.
CREATE OR REPLACE FUNCTION public.reconcile_staff_records_apply(_profile_ids uuid[], _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; c jsonb; done int := 0; unit_fix int := 0; pos_fix int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Super Admin only'; END IF;
  IF length(trim(coalesce(_reason,''))) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  FOREACH pid IN ARRAY coalesce(_profile_ids, '{}') LOOP
    IF EXISTS (SELECT 1 FROM profiles WHERE id = pid AND deleted_at IS NOT NULL) THEN
      c := staff_detach_operational(pid, NULL);
      INSERT INTO staff_record_archive(profile_id, event, cleanup, performed_by) VALUES (pid, 'reconciled', c, auth.uid());
      done := done + 1;
    ELSIF EXISTS (SELECT 1 FROM profiles p WHERE p.id = pid AND p.org_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units u WHERE u.id = p.org_unit_id)) THEN
      UPDATE profiles SET org_unit_id = NULL WHERE id = pid; unit_fix := unit_fix + 1;
    END IF;
  END LOOP;
  UPDATE org_positions o SET holder_profile_id = NULL WHERE o.holder_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = o.holder_profile_id);
  GET DIAGNOSTICS pos_fix = ROW_COUNT;
  INSERT INTO system_audit_log(entity_type, action, performed_by, details)
  VALUES ('staff_reconciliation', 'applied', auth.uid(), jsonb_build_object('reason', _reason, 'stale_cleared', done, 'orphan_units_cleared', unit_fix, 'orphan_positions_cleared', pos_fix, 'profile_ids', _profile_ids));
  RETURN jsonb_build_object('stale_cleared', done, 'orphan_units_cleared', unit_fix, 'orphan_positions_cleared', pos_fix);
END $$;
GRANT EXECUTE ON FUNCTION public.reconcile_staff_records_apply(uuid[], text) TO authenticated;

-- Integrity check
CREATE OR REPLACE FUNCTION public.staff_integrity_check()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Super Admin only'; END IF;
  RETURN jsonb_build_object(
    'active_staff', (SELECT count(*) FROM profiles WHERE deleted_at IS NULL),
    'deleted_staff', (SELECT count(*) FROM profiles WHERE deleted_at IS NOT NULL),
    'deleted_still_active_status', (SELECT count(*) FROM profiles WHERE deleted_at IS NOT NULL AND status = 'active'),
    'deleted_holding_positions', (SELECT count(*) FROM org_positions o JOIN profiles p ON p.id = o.holder_profile_id WHERE p.deleted_at IS NOT NULL),
    'deleted_future_duties', (SELECT count(*) FROM guard_schedule_assignments g JOIN profiles p ON p.id = g.profile_id WHERE p.deleted_at IS NOT NULL AND g.duty_date >= current_date),
    'deleted_with_rights', (SELECT count(*) FROM org_unit_assignments a JOIN profiles p ON p.user_id = a.user_id WHERE p.deleted_at IS NOT NULL AND a.revoked_at IS NULL),
    'orphan_postings', (SELECT count(*) FROM profiles p WHERE p.deleted_at IS NULL AND p.org_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_units u WHERE u.id = p.org_unit_id)),
    'archived_records', (SELECT count(*) FROM staff_record_archive),
    'checked_at', now());
END $$;
GRANT EXECUTE ON FUNCTION public.staff_integrity_check() TO authenticated;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.org_positions; EXCEPTION WHEN others THEN NULL; END;
END $$;