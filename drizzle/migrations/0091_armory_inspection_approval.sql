CREATE OR REPLACE FUNCTION public.armory_transition(_id uuid,_action text,_reason text,_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.armory_records; saved public.armory_records; asset public.armory_records; next_status text; actor text; origin_allowed boolean; BEGIN
 SELECT * INTO r FROM public.armory_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Record access denied' USING ERRCODE='42501'; END IF;
 origin_allowed:=public.armory_can_access(r.org_unit_id);
 IF NOT origin_allowed AND NOT (r.kind='transfer' AND _action='receive' AND public.armory_can_access(r.destination_unit_id)) THEN RAISE EXCEPTION 'Command access denied' USING ERRCODE='42501'; END IF;
 IF r.version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Record changed; refresh before deciding'; END IF;
 IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF r.status IN ('closed','archived','returned','received','rejected','cancelled') THEN RAISE EXCEPTION 'Record is final'; END IF;
 IF _action IN ('approve','reject','verify','authorize','close','suspend') AND (NOT public.armory_can_approve(r.org_unit_id) OR r.created_by=auth.uid() OR r.updated_by=auth.uid()) THEN RAISE EXCEPTION 'An independent Command Head or Super Admin must decide' USING ERRCODE='42501'; END IF;
 IF r.kind IN ('custody','transfer') THEN
  SELECT * INTO asset FROM public.armory_records WHERE id=r.asset_id FOR UPDATE;
  IF _action='submit' AND r.status='draft' THEN next_status:='pending';
  ELSIF _action='approve' AND r.status='pending' AND asset.status='in_store' THEN
   IF r.kind='custody' AND (NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=r.profile_id AND p.org_unit_id=r.org_unit_id AND p.deleted_at IS NULL AND p.status='active') OR NOT EXISTS(SELECT 1 FROM public.armory_records p WHERE p.kind='personnel' AND p.profile_id=r.profile_id AND p.org_unit_id=r.org_unit_id AND p.status='authorized' AND (p.details->>'expiry')::date>=current_date)) THEN RAISE EXCEPTION 'Recipient authorization is no longer current'; END IF;
   IF asset.org_unit_id<>r.org_unit_id THEN RAISE EXCEPTION 'Weapon command changed'; END IF;
   next_status:='approved'; UPDATE public.armory_records SET status=CASE r.kind WHEN 'custody' THEN 'issued' ELSE 'reserved' END,version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=asset.id;
  ELSIF _action='reject' AND r.status='pending' THEN next_status:='rejected';
  ELSIF _action='cancel' AND r.status='draft' AND (r.created_by=auth.uid() OR public.armory_can_approve(r.org_unit_id)) THEN next_status:='cancelled';
  ELSIF _action='acknowledge' AND r.kind='custody' AND r.status='approved' THEN
   IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=r.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL) THEN RAISE EXCEPTION 'Only the recipient can acknowledge custody' USING ERRCODE='42501'; END IF; next_status:='acknowledged';
  ELSIF _action='return' AND r.kind='custody' AND r.status IN ('approved','acknowledged','discrepancy') THEN next_status:='returned'; UPDATE public.armory_records SET status='in_store',version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=asset.id;
  ELSIF _action='discrepancy' AND r.kind='custody' AND r.status IN ('approved','acknowledged') THEN next_status:='discrepancy';
  ELSIF _action='handover' AND r.kind='transfer' AND r.status='approved' THEN next_status:='handed_over';
  ELSIF _action='receive' AND r.kind='transfer' AND r.status='handed_over' AND public.armory_can_approve(r.destination_unit_id) THEN next_status:='received'; UPDATE public.armory_records SET org_unit_id=r.destination_unit_id,status='in_store',details=details-'facility',version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=asset.id;
  END IF;
 ELSIF r.kind='audit' THEN
  IF _action='submit' AND r.status='scheduled' THEN next_status:='pending'; ELSIF _action='approve' AND r.status='pending' THEN next_status:='approved'; ELSIF _action='reject' AND r.status='pending' THEN next_status:='rejected'; ELSIF _action='close' AND r.status='approved' THEN
   IF EXISTS(SELECT 1 FROM public.armory_records f WHERE f.parent_id=r.id AND f.status NOT IN ('resolved','archived')) THEN RAISE EXCEPTION 'Resolve audit findings before closing'; END IF; next_status:='closed'; END IF;
 ELSIF r.kind IN ('ammunition','certification','personnel') THEN
  IF _action IN ('verify','authorize') AND r.status='pending' THEN next_status:=CASE WHEN r.kind='personnel' THEN 'authorized' ELSE 'verified' END;
  ELSIF _action='suspend' AND r.kind='personnel' AND r.status='authorized' THEN next_status:='suspended';
  ELSIF _action='reject' AND r.status='pending' THEN next_status:='rejected'; END IF;
 ELSIF r.kind='finding' AND _action='resolve' AND r.status='open' THEN
  IF EXISTS(SELECT 1 FROM public.armory_records c WHERE c.parent_id=r.id AND c.kind='corrective' AND c.status<>'completed') THEN RAISE EXCEPTION 'Complete corrective actions first'; END IF; next_status:='resolved';
 ELSIF r.kind='corrective' THEN IF _action='start' AND r.status='open' THEN next_status:='in_progress'; ELSIF _action='complete' AND r.status IN ('open','in_progress') THEN next_status:='completed'; END IF;
 ELSIF r.kind='maintenance' AND _action IN ('approve','reject') THEN
  IF r.status IN ('active','pending') THEN next_status:=CASE _action WHEN 'approve' THEN 'approved' ELSE 'rejected' END; END IF;
 ELSIF r.kind='weapon' THEN IF _action='verify' THEN next_status:=r.status; ELSIF _action='maintenance' AND r.status='in_store' THEN next_status:='maintenance'; ELSIF _action='release' AND r.status='maintenance' THEN next_status:='in_store'; END IF;
 END IF;
 IF _action='archive' AND r.kind IN ('weapon','facility','maintenance','certification','personnel') AND public.armory_can_approve(r.org_unit_id) AND r.status NOT IN ('issued','reserved') THEN
  IF EXISTS(SELECT 1 FROM public.armory_records c WHERE c.asset_id=r.id AND c.status NOT IN ('returned','received','rejected','cancelled','archived') AND c.kind IN ('custody','transfer')) THEN RAISE EXCEPTION 'Resolve open custody/transfer first'; END IF; next_status:='archived'; END IF;
 IF next_status IS NULL THEN RAISE EXCEPTION 'Invalid workflow transition'; END IF;
 UPDATE public.armory_records SET status=next_status,version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=r.id RETURNING * INTO saved;
 SELECT COALESCE(NULLIF(trim(p.first_name||' '||p.last_name),''),'Authorized user') INTO actor FROM public.profiles p WHERE p.user_id=auth.uid() LIMIT 1;
 INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record) VALUES(r.id,r.org_unit_id,COALESCE(actor,'Authorized user'),_action,trim(_reason),to_jsonb(r),to_jsonb(saved));
 IF asset.id IS NOT NULL AND _action IN ('approve','return','receive') THEN INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record) SELECT asset.id,asset.org_unit_id,COALESCE(actor,'Authorized user'),_action,trim(_reason),to_jsonb(asset),to_jsonb(a) FROM public.armory_records a WHERE a.id=asset.id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.armory_transition(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.armory_transition(uuid,text,text,integer) TO authenticated;