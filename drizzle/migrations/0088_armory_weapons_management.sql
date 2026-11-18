CREATE FUNCTION public.armory_can_access(_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR (_unit IN (SELECT public.user_org_scope(auth.uid())) AND (public.is_command_head_for(auth.uid(),_unit) OR (public.has_role(auth.uid(),'chief_staff_officer') AND NOT public.is_scoped_staff_officer(auth.uid())) OR EXISTS (SELECT 1 FROM public.command_tier_grants g WHERE g.user_id=auth.uid() AND g.capability='armory-weapons' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())))));
$$;
REVOKE ALL ON FUNCTION public.armory_can_access(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_can_access(uuid) TO authenticated,service_role;
CREATE FUNCTION public.armory_can_approve(_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.armory_can_access(_unit) AND (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),_unit)); $$;
REVOKE ALL ON FUNCTION public.armory_can_approve(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_can_approve(uuid) TO authenticated,service_role;
CREATE TABLE public.armory_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('weapon','ammunition','personnel','custody','facility','transfer','maintenance','certification','audit','finding','corrective')),
 org_unit_id uuid NOT NULL REFERENCES public.org_units(id), reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 profile_id uuid REFERENCES public.profiles(id), asset_id uuid REFERENCES public.armory_records(id), parent_id uuid REFERENCES public.armory_records(id), destination_unit_id uuid REFERENCES public.org_units(id),
 status text NOT NULL DEFAULT 'active', details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=20000),
 created_by uuid NOT NULL DEFAULT auth.uid(), updated_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 UNIQUE(kind,reference)
);
GRANT SELECT ON public.armory_records TO authenticated; GRANT ALL ON public.armory_records TO service_role;
ALTER TABLE public.armory_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY armory_scoped_read ON public.armory_records FOR SELECT TO authenticated USING(public.armory_can_access(org_unit_id) OR (kind='transfer' AND public.armory_can_access(destination_unit_id)));
CREATE UNIQUE INDEX armory_unique_weapon_serial ON public.armory_records(upper(trim(details->>'serial'))) WHERE kind='weapon';
CREATE UNIQUE INDEX armory_unique_weapon_registration ON public.armory_records(upper(trim(details->>'registration'))) WHERE kind='weapon';
CREATE UNIQUE INDEX armory_unique_personnel ON public.armory_records(profile_id,org_unit_id) WHERE kind='personnel' AND status<>'archived';
CREATE UNIQUE INDEX armory_one_open_custody ON public.armory_records(asset_id) WHERE kind IN ('custody','transfer') AND status NOT IN ('returned','rejected','cancelled','received','archived');
CREATE INDEX armory_command_kind ON public.armory_records(org_unit_id,kind,created_at DESC);
CREATE TABLE public.armory_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.armory_records(id), org_unit_id uuid NOT NULL REFERENCES public.org_units(id), actor_id uuid NOT NULL DEFAULT auth.uid(), actor_name text NOT NULL,
 action text NOT NULL, reason text NOT NULL, before_record jsonb, after_record jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.armory_events TO authenticated; GRANT ALL ON public.armory_events TO service_role;
ALTER TABLE public.armory_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY armory_events_scoped_read ON public.armory_events FOR SELECT TO authenticated USING(public.armory_can_access(org_unit_id) OR EXISTS(SELECT 1 FROM public.armory_records r WHERE r.id=record_id AND r.kind='transfer' AND public.armory_can_access(r.destination_unit_id)));
CREATE FUNCTION public.armory_block_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Armory activity is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER armory_immutable_activity BEFORE UPDATE OR DELETE ON public.armory_events FOR EACH ROW EXECUTE FUNCTION public.armory_block_event_mutation();
REVOKE ALL ON FUNCTION public.armory_block_event_mutation() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.armory_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('commands',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'can_approve',public.armory_can_approve(u.id)) ORDER BY u.name) FROM public.org_units u WHERE public.armory_can_access(u.id)),'[]'::jsonb),'staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'first_name',p.first_name,'last_name',p.last_name,'staff_id',p.staff_id,'org_unit_id',p.org_unit_id) ORDER BY p.last_name,p.first_name) FROM public.profiles p WHERE p.deleted_at IS NULL AND p.status='active' AND public.armory_can_access(p.org_unit_id)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.armory_context() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_context() TO authenticated;
CREATE FUNCTION public.armory_save(_id uuid,_kind text,_unit uuid,_reference text,_title text,_profile uuid,_asset uuid,_parent uuid,_destination uuid,_details jsonb,_reason text,_version integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oldrow public.armory_records; saved public.armory_records; related public.armory_records; initial text; actor text; BEGIN
 IF NOT public.armory_can_access(_unit) THEN RAISE EXCEPTION 'Armory command access denied' USING ERRCODE='42501'; END IF;
 IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 1000 OR length(trim(COALESCE(_reference,''))) NOT BETWEEN 1 AND 100 OR length(trim(COALESCE(_title,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Reference, title and reason are required'; END IF;
 IF _kind NOT IN ('weapon','ammunition','personnel','custody','facility','transfer','maintenance','certification','audit','finding','corrective') OR jsonb_typeof(_details) IS DISTINCT FROM 'object' OR octet_length(_details::text)>20000 THEN RAISE EXCEPTION 'Invalid record details'; END IF;
 IF _id IS NOT NULL THEN
  SELECT * INTO oldrow FROM public.armory_records WHERE id=_id FOR UPDATE;
  IF oldrow.id IS NULL OR NOT public.armory_can_access(oldrow.org_unit_id) OR oldrow.org_unit_id<>_unit OR oldrow.kind<>_kind THEN RAISE EXCEPTION 'Record access denied' USING ERRCODE='42501'; END IF;
  IF _version IS DISTINCT FROM oldrow.version THEN RAISE EXCEPTION 'Record changed; refresh before saving'; END IF;
  IF oldrow.status IN ('closed','archived') OR (_kind IN ('custody','transfer','audit','ammunition','personnel','certification') AND oldrow.status NOT IN ('draft','pending','scheduled')) THEN RAISE EXCEPTION 'Workflow record cannot be edited in this state'; END IF;
 END IF;
 IF _profile IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.deleted_at IS NULL AND p.status='active' AND p.org_unit_id=_unit AND public.armory_can_access(p.org_unit_id)) THEN RAISE EXCEPTION 'Officer must be active and assigned to this command'; END IF;
 IF _kind IN ('personnel','custody','certification') AND _profile IS NULL THEN RAISE EXCEPTION 'Select an existing officer'; END IF;
 IF _asset IS NOT NULL THEN SELECT * INTO related FROM public.armory_records WHERE id=_asset FOR UPDATE; IF related.id IS NULL OR related.kind<>'weapon' OR related.org_unit_id<>_unit OR related.status='archived' THEN RAISE EXCEPTION 'Weapon is unavailable in this command'; END IF; END IF;
 IF _kind IN ('custody','transfer','maintenance') AND _asset IS NULL THEN RAISE EXCEPTION 'Select a registered weapon'; END IF;
 IF _kind IN ('custody','transfer') AND related.status<>'in_store' THEN RAISE EXCEPTION 'Weapon must be in store'; END IF;
 IF _kind='custody' AND NOT EXISTS(SELECT 1 FROM public.armory_records p WHERE p.kind='personnel' AND p.profile_id=_profile AND p.org_unit_id=_unit AND p.status='authorized' AND (p.details->>'expiry')::date>=current_date) THEN RAISE EXCEPTION 'Officer requires current armory authorization'; END IF;
 IF _kind='transfer' AND (_destination IS NULL OR _destination=_unit OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=_destination AND public.armory_can_access(u.id))) THEN RAISE EXCEPTION 'Select a different authorized destination command'; END IF;
 IF _parent IS NOT NULL THEN SELECT * INTO related FROM public.armory_records WHERE id=_parent FOR UPDATE; IF related.id IS NULL OR related.org_unit_id<>_unit OR related.status IN ('closed','archived') OR (_kind='finding' AND related.kind<>'audit') OR (_kind='corrective' AND related.kind<>'finding') THEN RAISE EXCEPTION 'Parent record unavailable or closed'; END IF; END IF;
 IF _kind IN ('finding','corrective') AND _parent IS NULL THEN RAISE EXCEPTION 'Parent record required'; END IF;
 IF _kind='weapon' AND (length(trim(COALESCE(_details->>'serial',''))) NOT BETWEEN 1 AND 100 OR length(trim(COALESCE(_details->>'registration',''))) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Serial and registration are required'; END IF;
 IF _kind='ammunition' AND (COALESCE(_details->>'quantity','') !~ '^[0-9]{1,9}$' OR (_details->>'quantity')::bigint>100000000) THEN RAISE EXCEPTION 'Ammunition quantity must be a nonnegative whole number'; END IF;
 IF _kind IN ('personnel','certification') AND (COALESCE(_details->>'expiry','') !~ '^\d{4}-\d{2}-\d{2}$' OR (_details->>'expiry')::date<current_date) THEN RAISE EXCEPTION 'A current expiry date is required'; END IF;
 IF _kind='maintenance' AND (COALESCE(_details->>'next_review','') !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'Next review date required'; END IF;
 initial:=CASE _kind WHEN 'weapon' THEN 'in_store' WHEN 'custody' THEN 'draft' WHEN 'transfer' THEN 'draft' WHEN 'audit' THEN 'scheduled' WHEN 'personnel' THEN 'pending' WHEN 'ammunition' THEN 'pending' WHEN 'certification' THEN 'pending' WHEN 'finding' THEN 'open' WHEN 'corrective' THEN 'open' ELSE 'active' END;
 IF _id IS NULL THEN INSERT INTO public.armory_records(kind,org_unit_id,reference,title,profile_id,asset_id,parent_id,destination_unit_id,details,status) VALUES(_kind,_unit,upper(trim(_reference)),trim(_title),_profile,_asset,_parent,_destination,_details,initial) RETURNING * INTO saved;
 ELSE UPDATE public.armory_records SET reference=upper(trim(_reference)),title=trim(_title),profile_id=_profile,asset_id=_asset,parent_id=_parent,destination_unit_id=_destination,details=_details,updated_at=now(),updated_by=auth.uid(),version=version+1 WHERE id=_id RETURNING * INTO saved; END IF;
 SELECT COALESCE(NULLIF(trim(p.first_name||' '||p.last_name),''),'Authorized user') INTO actor FROM public.profiles p WHERE p.user_id=auth.uid() LIMIT 1;
 INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record) VALUES(saved.id,_unit,COALESCE(actor,'Authorized user'),CASE WHEN _id IS NULL THEN 'created' ELSE 'updated' END,trim(_reason),CASE WHEN _id IS NULL THEN NULL ELSE to_jsonb(oldrow) END,to_jsonb(saved));
 RETURN saved.id;
END $$;
REVOKE ALL ON FUNCTION public.armory_save(uuid,text,uuid,text,text,uuid,uuid,uuid,uuid,jsonb,text,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_save(uuid,text,uuid,text,text,uuid,uuid,uuid,uuid,jsonb,text,integer) TO authenticated;
CREATE FUNCTION public.armory_transition(_id uuid,_action text,_reason text,_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
REVOKE ALL ON FUNCTION public.armory_transition(uuid,text,text,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_transition(uuid,text,text,integer) TO authenticated;
CREATE FUNCTION public.armory_export_log(_unit uuid,_kind text,_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.armory_can_access(_unit) OR _count<0 THEN RAISE EXCEPTION 'Export denied' USING ERRCODE='42501'; END IF; INSERT INTO public.system_audit_log(user_id,action,table_name,details) VALUES(auth.uid(),'armory_export','armory_records',jsonb_build_object('org_unit_id',_unit,'kind',left(_kind,30),'row_count',_count)); END $$;
REVOKE ALL ON FUNCTION public.armory_export_log(uuid,text,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_export_log(uuid,text,integer) TO authenticated;