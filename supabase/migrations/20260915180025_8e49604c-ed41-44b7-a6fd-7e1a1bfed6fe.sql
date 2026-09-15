-- ============ Sign-off chain for staff / command documents ============

CREATE OR REPLACE FUNCTION public.signoff_steps(_entity_type text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _entity_type
    WHEN 'staff_biodata' THEN ARRAY['staff_declaration','checked_by','recommended_by','approved_by']
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.signoff_can_sign(_user uuid, _step text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _step
    WHEN 'staff_declaration' THEN true
    WHEN 'checked_by' THEN
      public.has_role(_user,'admin'::app_role)
      OR public.has_role(_user,'supervisor'::app_role)
      OR public.has_role(_user,'shift_supervisor'::app_role)
      OR public.has_role(_user,'staff_officer'::app_role)
      OR public.can_manage_command_tier(_user)
    WHEN 'recommended_by' THEN
      public.has_role(_user,'admin'::app_role)
      OR public.has_role(_user,'oic'::app_role)
      OR public.has_role(_user,'2ic'::app_role)
      OR public.has_role(_user,'staff_officer'::app_role)
      OR public.has_role(_user,'command_officer'::app_role)
    WHEN 'approved_by' THEN public.has_role(_user,'admin'::app_role)
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.signoff_can_sign(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signoff_can_sign(uuid, text) TO authenticated, service_role;

-- Record one sign-off step. Fails closed on entitlement, ordering and duplicates.
CREATE OR REPLACE FUNCTION public.record_signoff(
  _entity_type text,
  _entity_id uuid,
  _step text,
  _note text DEFAULT NULL,
  _signature_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_steps text[] := public.signoff_steps(_entity_type);
  v_idx int;
  v_prev text;
  v_from text;
  v_is_owner boolean;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF v_steps IS NULL THEN RAISE EXCEPTION 'Unknown document type'; END IF;

  v_idx := array_position(v_steps, _step);
  IF v_idx IS NULL THEN RAISE EXCEPTION 'Unknown sign-off step'; END IF;

  IF _entity_type = 'staff_biodata' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _entity_id AND p.user_id = v_uid)
      INTO v_is_owner;
    IF NOT (v_is_owner
            OR public.has_profile_oversight_role(v_uid)
            OR public.can_access_staff_profile(v_uid, _entity_id)) THEN
      RAISE EXCEPTION 'You are not permitted to act on this record';
    END IF;
    -- The declaration belongs to the officer themself (an admin may sign for them).
    IF _step = 'staff_declaration'
       AND NOT (v_is_owner OR public.has_role(v_uid,'admin'::app_role)) THEN
      RAISE EXCEPTION 'Only the officer can sign their own declaration';
    END IF;
  END IF;

  IF NOT public.signoff_can_sign(v_uid, _step) THEN
    RAISE EXCEPTION 'Your role cannot sign this step';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workflow_transitions t
    WHERE t.entity_type = _entity_type AND t.entity_id = _entity_id AND t.to_status = _step
  ) THEN
    RAISE EXCEPTION 'That step has already been signed';
  END IF;

  IF v_idx > 1 THEN
    v_prev := v_steps[v_idx - 1];
    IF NOT EXISTS (
      SELECT 1 FROM public.workflow_transitions t
      WHERE t.entity_type = _entity_type AND t.entity_id = _entity_id AND t.to_status = v_prev
    ) THEN
      RAISE EXCEPTION 'The previous step has not been signed yet';
    END IF;
  END IF;

  IF _signature_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_signatures s
    WHERE s.id = _signature_id AND s.signer_user_id = v_uid AND s.invalidated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The signature does not belong to you';
  END IF;

  SELECT t.to_status INTO v_from
  FROM public.workflow_transitions t
  WHERE t.entity_type = _entity_type AND t.entity_id = _entity_id
  ORDER BY t.created_at DESC LIMIT 1;

  INSERT INTO public.workflow_transitions
    (entity_type, entity_id, from_status, to_status, note, signature_id, performed_by)
  VALUES (_entity_type, _entity_id, v_from, _step, NULLIF(btrim(coalesce(_note,'')),''), _signature_id, v_uid)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_signoff(text, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_signoff(text, uuid, text, text, uuid) TO authenticated, service_role;

-- Read the sign-off state of one document, including the signature images.
CREATE OR REPLACE FUNCTION public.signoff_state(_entity_type text, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_steps text[] := public.signoff_steps(_entity_type);
  v_allowed boolean := false;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF v_steps IS NULL THEN RAISE EXCEPTION 'Unknown document type'; END IF;

  IF _entity_type = 'staff_biodata' THEN
    v_allowed := EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _entity_id AND p.user_id = v_uid)
      OR public.has_profile_oversight_role(v_uid)
      OR public.can_access_staff_profile(v_uid, _entity_id);
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'You are not permitted to view this record'; END IF;

  SELECT jsonb_build_object(
    'entity_type', _entity_type,
    'entity_id', _entity_id,
    'steps', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'step', st.step,
        'position', st.ord,
        'signed', t.id IS NOT NULL,
        'note', t.note,
        'signed_at', coalesce(s.signed_at, t.created_at),
        'signer_name', s.signer_name,
        'signer_role', s.signer_role,
        'signature_data', s.signature_data,
        'signature_hash', s.signature_hash,
        'record_fingerprint', s.record_fingerprint,
        'can_sign', public.signoff_can_sign(v_uid, st.step)
      ) ORDER BY st.ord), '[]'::jsonb)
      FROM unnest(v_steps) WITH ORDINALITY AS st(step, ord)
      LEFT JOIN LATERAL (
        SELECT w.id, w.note, w.created_at, w.signature_id
        FROM public.workflow_transitions w
        WHERE w.entity_type = _entity_type AND w.entity_id = _entity_id AND w.to_status = st.step
        ORDER BY w.created_at LIMIT 1
      ) t ON true
      LEFT JOIN public.staff_signatures s ON s.id = t.signature_id
    ),
    'history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'from_status', w.from_status,
        'to_status', w.to_status,
        'note', w.note,
        'created_at', w.created_at,
        'actor', pr.first_name || ' ' || pr.last_name
      ) ORDER BY w.created_at DESC), '[]'::jsonb)
      FROM public.workflow_transitions w
      LEFT JOIN public.profiles pr ON pr.user_id = w.performed_by
      WHERE w.entity_type = _entity_type AND w.entity_id = _entity_id
    ),
    'stage', (
      SELECT w.to_status FROM public.workflow_transitions w
      WHERE w.entity_type = _entity_type AND w.entity_id = _entity_id
      ORDER BY w.created_at DESC LIMIT 1
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.signoff_state(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signoff_state(text, uuid) TO authenticated, service_role;

-- Staff records waiting for the signed-in officer's own sign-off.
CREATE OR REPLACE FUNCTION public.signoff_my_queue()
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  staff_name text,
  staff_id text,
  unit_name text,
  next_step text,
  last_action_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_steps text[] := public.signoff_steps('staff_biodata');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT p.id, p.first_name, p.last_name, p.staff_id, p.org_unit_id
    FROM public.profiles p
    WHERE p.status IN ('active','partially_active','study_leave','interdicted')
      AND (p.user_id = v_uid
           OR public.has_profile_oversight_role(v_uid)
           OR public.can_access_staff_profile(v_uid, p.id))
    LIMIT 1000
  ), progress AS (
    SELECT s.*,
      (SELECT count(*) FROM unnest(v_steps) AS st(step)
         WHERE EXISTS (
           SELECT 1 FROM public.workflow_transitions w
           WHERE w.entity_type = 'staff_biodata' AND w.entity_id = s.id AND w.to_status = st.step
         ))::int AS done
    FROM scoped s
  )
  SELECT 'staff_biodata'::text,
         pr.id,
         btrim(coalesce(pr.first_name,'') || ' ' || coalesce(pr.last_name,'')),
         pr.staff_id,
         ou.name,
         v_steps[pr.done + 1],
         (SELECT max(w.created_at) FROM public.workflow_transitions w
            WHERE w.entity_type = 'staff_biodata' AND w.entity_id = pr.id)
  FROM progress pr
  LEFT JOIN public.org_units ou ON ou.id = pr.org_unit_id
  WHERE pr.done < array_length(v_steps, 1)
    AND public.signoff_can_sign(v_uid, v_steps[pr.done + 1])
    AND (
      v_steps[pr.done + 1] <> 'staff_declaration'
      OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = pr.id AND me.user_id = v_uid)
      OR public.has_role(v_uid,'admin'::app_role)
    )
  ORDER BY pr.done DESC, pr.last_name
  LIMIT 300;
END;
$$;
REVOKE ALL ON FUNCTION public.signoff_my_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signoff_my_queue() TO authenticated, service_role;