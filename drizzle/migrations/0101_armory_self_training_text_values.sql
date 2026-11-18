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
 d:=jsonb_build_object('training_month',_training_month,'location',trim(_location),'training_status',_training_status,'provider',trim(_provider),'issued',_issued::text,'expiry',_expiry::text,'document',trim(COALESCE(_document,'')),'self_submitted','true');
 ref:='CRT-SELF-'||to_char(now(),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
 PERFORM set_config('armory.self_training','on',true);
 INSERT INTO public.armory_records(kind,org_unit_id,reference,title,profile_id,details,status)
  VALUES('certification',me.org_unit_id,ref,'Weapon training · '||trim(COALESCE(me.first_name,'')||' '||COALESCE(me.last_name,'')),me.id,d,'pending') RETURNING * INTO saved;
 PERFORM set_config('armory.self_training','off',true);
 INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record)
  VALUES(saved.id,saved.org_unit_id,COALESCE(NULLIF(trim(COALESCE(me.first_name,'')||' '||COALESCE(me.last_name,'')),''),'Officer'),'created',trim(_reason),NULL,to_jsonb(saved));
 RETURN saved.id;
END $function$;