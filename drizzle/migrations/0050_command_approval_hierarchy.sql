CREATE OR REPLACE FUNCTION public.is_command_head_for(_uid uuid, _unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _uid IS NOT NULL AND _unit IS NOT NULL
    AND (public.has_role(_uid,'oic') OR public.has_role(_uid,'2ic'))
    AND _unit IN (SELECT public.user_org_scope(_uid));
$$;
REVOKE EXECUTE ON FUNCTION public.is_command_head_for(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_command_head_for(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recommend_staff_transfer(_id uuid, _recommend boolean, _note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.staff_transfer_requests; _from uuid;
BEGIN
  SELECT * INTO r FROM public.staff_transfer_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Request is not awaiting recommendation'; END IF;
  SELECT COALESCE(r.from_org_unit_id, p.org_unit_id) INTO _from FROM public.profiles p WHERE p.id=r.profile_id;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(), _from)) THEN
    RAISE EXCEPTION 'Only the releasing command OIC/2IC can recommend this transfer'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=r.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot recommend your own request'; END IF;
  UPDATE public.staff_transfer_requests SET status=CASE WHEN _recommend THEN 'recommended' ELSE 'rejected' END,
    recommended_by=auth.uid(), recommended_at=now(), recommend_note=_note, updated_at=now() WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_staff_transfer(_id uuid, _approve boolean, _note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.staff_transfer_requests;
BEGIN
  SELECT * INTO r FROM public.staff_transfer_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'recommended' THEN RAISE EXCEPTION 'Request must be recommended first'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(), r.to_org_unit_id)) THEN
    RAISE EXCEPTION 'Only the receiving command OIC/2IC can approve this transfer'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=r.profile_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot approve your own request'; END IF;
  IF r.recommended_by = auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'The recommending officer cannot also give final approval'; END IF;
  UPDATE public.staff_transfer_requests SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    decided_by=auth.uid(), decided_at=now(), decision_note=_note, updated_at=now() WHERE id=_id;
  IF _approve THEN
    PERFORM public.command_move_officers(ARRAY[r.profile_id], r.to_org_unit_id, NULL, 'Transfer request: '||r.reason, COALESCE(r.preferred_date, current_date));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decide_staff_promotion(_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.staff_promotions; _unit uuid; _owner uuid;
BEGIN
  SELECT * INTO r FROM public.staff_promotions WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' THEN RAISE EXCEPTION 'Promotion is not pending'; END IF;
  SELECT org_unit_id, user_id INTO _unit, _owner FROM public.profiles WHERE id=r.profile_id;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(), _unit)) THEN
    RAISE EXCEPTION 'Only the officer''s command OIC/2IC can approve this promotion'; END IF;
  IF _owner = auth.uid() THEN RAISE EXCEPTION 'You cannot approve your own promotion'; END IF;
  IF r.created_by = auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'The officer who recorded this promotion cannot approve it'; END IF;
  UPDATE public.staff_promotions SET status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by=auth.uid(), decided_at=now() WHERE id=_id;
  IF _approve THEN UPDATE public.profiles SET rank_id=r.to_rank_id WHERE id=r.profile_id; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.command_approval_queue()
RETURNS TABLE(kind text, id uuid, profile_id uuid, staff_name text, status text, stage text, from_unit text, to_unit text, detail text, created_at timestamptz, can_act boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH me AS (SELECT auth.uid() uid, public.has_role(auth.uid(),'admin') adm)
  SELECT 'transfer', t.id, t.profile_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), t.status,
    CASE t.status WHEN 'pending' THEN 'Releasing command OIC/2IC' ELSE 'Receiving command OIC/2IC' END,
    fu.name, tu.name, t.reason, t.created_at,
    (p.user_id IS DISTINCT FROM me.uid) AND CASE t.status
      WHEN 'pending' THEN me.adm OR public.is_command_head_for(me.uid, coalesce(t.from_org_unit_id,p.org_unit_id))
      ELSE (me.adm OR public.is_command_head_for(me.uid, t.to_org_unit_id)) AND (me.adm OR t.recommended_by IS DISTINCT FROM me.uid) END
  FROM public.staff_transfer_requests t CROSS JOIN me
  JOIN public.profiles p ON p.id=t.profile_id
  LEFT JOIN public.org_units fu ON fu.id=coalesce(t.from_org_unit_id,p.org_unit_id)
  LEFT JOIN public.org_units tu ON tu.id=t.to_org_unit_id
  WHERE t.status IN ('pending','recommended') AND me.uid IS NOT NULL
    AND (me.adm OR public.is_command_head_for(me.uid, coalesce(t.from_org_unit_id,p.org_unit_id)) OR public.is_command_head_for(me.uid, t.to_org_unit_id))
  UNION ALL
  SELECT 'promotion', s.id, s.profile_id, trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')), s.status,
    'Command OIC/2IC', u.name, NULL, coalesce(rk.name,'New rank'), s.created_at,
    (p.user_id IS DISTINCT FROM me.uid) AND (me.adm OR s.created_by IS DISTINCT FROM me.uid)
  FROM public.staff_promotions s CROSS JOIN me
  JOIN public.profiles p ON p.id=s.profile_id
  LEFT JOIN public.org_units u ON u.id=p.org_unit_id
  LEFT JOIN public.ranks rk ON rk.id=s.to_rank_id
  WHERE s.status='pending' AND me.uid IS NOT NULL AND (me.adm OR public.is_command_head_for(me.uid, p.org_unit_id))
  ORDER BY 10 DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.command_approval_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_approval_queue() TO authenticated, service_role;