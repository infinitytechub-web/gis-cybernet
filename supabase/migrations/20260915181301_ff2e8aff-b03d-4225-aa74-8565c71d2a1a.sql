CREATE OR REPLACE FUNCTION public.signoff_state(_entity_type text, _entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_steps text[] := public.signoff_steps(_entity_type);
  v_allowed boolean := false;
  v_is_subject boolean := false;
  v_is_admin boolean := false;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF v_steps IS NULL THEN RAISE EXCEPTION 'Unknown document type'; END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::app_role);

  IF _entity_type = 'staff_biodata' THEN
    v_is_subject := EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = _entity_id AND p.user_id = v_uid
    );
    -- Default deny: the subject, an oversight role, or a command-tier officer
    -- with authority over this specific record. can_access_staff_profile alone
    -- is too wide (it grants ordinary officers a self-lookup exception).
    v_allowed := v_is_subject
      OR public.has_profile_oversight_role(v_uid)
      OR (public.can_manage_command_tier(v_uid)
          AND public.can_access_staff_profile(v_uid, _entity_id));
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
        'can_sign', CASE
          WHEN st.step = 'staff_declaration' THEN (v_is_subject OR v_is_admin)
          ELSE public.signoff_can_sign(v_uid, st.step)
        END
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
$function$;

REVOKE ALL ON FUNCTION public.signoff_state(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signoff_state(text, uuid) TO authenticated, service_role;