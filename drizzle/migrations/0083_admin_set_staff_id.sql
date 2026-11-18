CREATE OR REPLACE FUNCTION public.admin_set_staff_id(_profile_id uuid, _staff_id text, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _old text; _new text := upper(trim(_staff_id));
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Only Super Admins can change staff IDs' USING ERRCODE='42501'; END IF;
  IF _new IS NULL OR _new !~ '^[A-Z0-9][A-Z0-9/-]{2,39}$' THEN RAISE EXCEPTION 'Staff ID must be 3-40 letters, digits, "-" or "/"'; END IF;
  IF length(coalesce(trim(_reason),'')) < 4 THEN RAISE EXCEPTION 'A reason of at least 4 characters is required'; END IF;
  SELECT staff_id INTO _old FROM profiles WHERE id = _profile_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Officer not found'; END IF;
  IF _old = _new THEN RETURN _new; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE upper(staff_id) = _new AND id <> _profile_id) THEN RAISE EXCEPTION 'Staff ID % is already in use', _new; END IF;
  UPDATE profiles SET staff_id = _new, updated_at = now() WHERE id = _profile_id;
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES ('staff_id_changed', 'profile', _profile_id, _uid, jsonb_build_object('from', _old, 'to', _new, 'reason', trim(_reason)));
  RETURN _new;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_staff_id(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_id(uuid, text, text) TO authenticated;