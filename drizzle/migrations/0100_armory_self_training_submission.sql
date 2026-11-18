CREATE OR REPLACE FUNCTION public.armory_guard_management()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF current_setting('armory.self_training',true)='on' AND NEW.kind='certification' AND NEW.status='pending' AND NEW.created_by=auth.uid()
     AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL AND p.status='active' AND p.org_unit_id=NEW.org_unit_id)
     AND EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=NEW.org_unit_id AND u.is_active) THEN RETURN NEW; END IF;
  IF NOT (public.armory_can_manage(NEW.org_unit_id) OR (NEW.kind='weapon' AND public.armory_can_manage_weapons(NEW.org_unit_id))) OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=NEW.org_unit_id AND u.is_active) THEN RAISE EXCEPTION 'Active command management permission required' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT public.armory_can_manage(OLD.org_unit_id) AND NOT (OLD.kind='weapon' AND NEW.kind='weapon' AND NEW.org_unit_id=OLD.org_unit_id AND NEW.status=OLD.status AND public.armory_can_manage_weapons(OLD.org_unit_id)) AND NOT (NEW.kind='weapon' AND NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id AND public.armory_can_approve(NEW.org_unit_id) AND EXISTS(SELECT 1 FROM public.armory_records r WHERE r.kind='transfer' AND r.asset_id=OLD.id AND r.destination_unit_id=NEW.org_unit_id AND r.status='handed_over')) AND NOT (NEW.kind='transfer' AND NEW.status='received' AND OLD.status='handed_over' AND public.armory_can_approve(NEW.destination_unit_id)) AND NOT (NEW.kind='custody' AND OLD.status='handed_over' AND NEW.status IN ('acknowledged','discrepancy') AND NEW.details=OLD.details AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Armory management permission required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.armory_submit_my_training(_training_month text, _location text, _training_status text, _provider text, _issued date, _expiry date, _document text, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me public.profiles; saved public.armory_records; d jsonb; ref text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO me FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL AND status='active' LIMIT 1;
 IF me.id IS NULL OR me.org_unit_id IS NULL THEN RAISE EXCEPTION 'An active staff profile assigned to a command is required' USING ERRCODE='42501'; END IF;
 IF COALESCE(_training_month,'') !~ '^(19|20)\d{2}-(0[1-9]|1[0-2])$' OR to_date(_training_month||'-01','YYYY-MM-DD') > current_date THEN RAISE EXCEPTION 'Enter the month and year you completed training'; END IF;
 IF length(trim(COALESCE(_location,''))) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter the training location'; END IF;
 IF length(trim(COALESCE(_provider,''))) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter the training provider'; END IF;
 IF _issued IS NULL OR _issued > current_date THEN RAISE EXCEPTION 'Enter a valid issued date'; END IF;
 IF _expiry IS NULL OR _expiry < current_date OR _expiry < _issued THEN RAISE EXCEPTION 'A current expiry date after the issued date is required'; END IF;
 IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 1000 OR length(COALESCE(_document,'')) > 100 THEN RAISE EXCEPTION 'Add a short note (3 characters or more)'; END IF;
 IF EXISTS(SELECT 1 FROM public.armory_records WHERE kind='certification' AND profile_id=me.id AND status='pending' AND created_by=auth.uid()) THEN RAISE EXCEPTION 'You already have a training record waiting for approval'; END IF;
 d:=jsonb_build_object('training_month',_training_month,'location',trim(_location),'training_status',_training_status,'provider',trim(_provider),'issued',_issued::text,'expiry',_expiry::text,'document',NULLIF(trim(COALESCE(_document,'')),''),'self_submitted',true);
 ref:='CRT-SELF-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
 PERFORM set_config('armory.self_training','on',true);
 INSERT INTO public.armory_records(kind,org_unit_id,reference,title,profile_id,details,status)
  VALUES('certification',me.org_unit_id,ref,'Weapon training · '||trim(COALESCE(me.first_name,'')||' '||COALESCE(me.last_name,'')),me.id,d,'pending') RETURNING * INTO saved;
 PERFORM set_config('armory.self_training','off',true);
 INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record)
  VALUES(saved.id,saved.org_unit_id,COALESCE(NULLIF(trim(COALESCE(me.first_name,'')||' '||COALESCE(me.last_name,'')),''),'Officer'),'created',trim(_reason),NULL,to_jsonb(saved));
 RETURN saved.id;
END $function$;
REVOKE ALL ON FUNCTION public.armory_submit_my_training(text,text,text,text,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.armory_submit_my_training(text,text,text,text,date,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.armory_my_training()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT id INTO me FROM public.profiles WHERE user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'reference',a.reference,'status',a.status,'created_at',a.created_at,
   'training_month',a.details->>'training_month','location',a.details->>'location','training_status',a.details->>'training_status',
   'provider',a.details->>'provider','issued',a.details->>'issued','expiry',a.details->>'expiry','self_submitted',COALESCE((a.details->>'self_submitted')::boolean,false)) ORDER BY a.created_at DESC)
  FROM public.armory_records a WHERE me IS NOT NULL AND a.kind='certification' AND a.profile_id=me AND a.status<>'archived'),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.armory_my_training() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.armory_my_training() TO authenticated;