CREATE OR REPLACE FUNCTION public.armory_export_log(_unit uuid,_kind text,_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.armory_can_access(_unit) OR _count IS NULL OR _count<0 OR _count>10000000 THEN RAISE EXCEPTION 'Export denied' USING ERRCODE='42501'; END IF; INSERT INTO public.system_audit_log(performed_by,action,entity_type,entity_id,details) VALUES(auth.uid(),'armory_export','armory_records',_unit,jsonb_build_object('kind',left(_kind,30),'row_count',_count)); END $$;
CREATE FUNCTION public.armory_validate_record() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE key text; required text[]; parent public.armory_records; BEGIN
 IF jsonb_typeof(NEW.details)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(NEW.details) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value #>> '{}')>2000) THEN RAISE EXCEPTION 'Detail values must be text, at most 2000 characters'; END IF;
 required:=CASE NEW.kind WHEN 'weapon' THEN ARRAY['serial','registration'] WHEN 'ammunition' THEN ARRAY['batch','quantity'] WHEN 'personnel' THEN ARRAY['responsibilities','certification','expiry'] WHEN 'custody' THEN ARRAY['purpose'] WHEN 'facility' THEN ARRAY['address'] WHEN 'maintenance' THEN ARRAY['category','date','officer','next_review'] WHEN 'certification' THEN ARRAY['provider','issued','expiry'] WHEN 'audit' THEN ARRAY['type','scheduled','officer','scope'] WHEN 'finding' THEN ARRAY['severity'] WHEN 'corrective' THEN ARRAY['owner','due_date'] ELSE ARRAY[]::text[] END;
 FOREACH key IN ARRAY required LOOP IF length(trim(COALESCE(NEW.details->>key,'')))=0 THEN RAISE EXCEPTION 'Required field missing: %',key; END IF; END LOOP;
 FOREACH key IN ARRAY ARRAY['acquisition_date','expiry','date','next_review','issued','scheduled','due_date','verified_date'] LOOP IF COALESCE(NEW.details->>key,'')<>'' THEN IF NEW.details->>key !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid date: %',key; END IF; PERFORM (NEW.details->>key)::date; END IF; END LOOP;
 FOREACH key IN ARRAY ARRAY['quantity','received','pending_quantity'] LOOP IF COALESCE(NEW.details->>key,'')<>'' AND (NEW.details->>key !~ '^[0-9]{1,9}$' OR (NEW.details->>key)::bigint>100000000) THEN RAISE EXCEPTION 'Quantity must be a nonnegative whole number'; END IF; END LOOP;
 IF NEW.kind='maintenance' AND (NEW.details->>'next_review')::date<(NEW.details->>'date')::date THEN RAISE EXCEPTION 'Next review cannot precede inspection'; END IF;
 IF NEW.kind='certification' AND (NEW.details->>'expiry')::date<(NEW.details->>'issued')::date THEN RAISE EXCEPTION 'Expiry cannot precede issue'; END IF;
 IF NEW.kind='finding' AND NEW.details->>'severity' NOT IN ('Low','Medium','High','Critical') THEN RAISE EXCEPTION 'Invalid severity'; END IF;
 IF NEW.kind='maintenance' AND NEW.details->>'category' NOT IN ('Routine Inspection','Preventive Service','Repair','Condition Assessment') THEN RAISE EXCEPTION 'Invalid inspection category'; END IF;
 IF NEW.kind='audit' AND NEW.details->>'type' NOT IN ('Scheduled Inventory Audit','Spot Verification','Annual Reconciliation') THEN RAISE EXCEPTION 'Invalid audit type'; END IF;
 IF NEW.parent_id IS NOT NULL THEN
  SELECT * INTO parent FROM public.armory_records WHERE id=NEW.parent_id FOR UPDATE;
  IF parent.org_unit_id<>NEW.org_unit_id OR (NEW.kind='finding' AND parent.kind<>'audit') OR (NEW.kind='corrective' AND parent.kind<>'finding') THEN RAISE EXCEPTION 'Invalid parent record'; END IF;
  IF parent.status IN ('closed','archived') OR EXISTS(SELECT 1 FROM public.armory_records a WHERE a.id=parent.parent_id AND a.status IN ('closed','archived')) THEN RAISE EXCEPTION 'Closed audits and their child records are immutable'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.kind='audit' AND OLD.status='closed' THEN RAISE EXCEPTION 'Closed audit is immutable'; END IF;
  IF NEW.kind IN ('custody','transfer') AND OLD.status<>'draft' AND (NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.destination_unit_id IS DISTINCT FROM OLD.destination_unit_id OR NEW.details IS DISTINCT FROM OLD.details) THEN RAISE EXCEPTION 'Submitted custody and transfer details are immutable'; END IF;
  IF NEW.kind='ammunition' AND NEW.status='verified' AND OLD.status='pending' AND NEW.details ? 'pending_quantity' THEN NEW.details:=(NEW.details-'pending_quantity')||jsonb_build_object('quantity',NEW.details->>'pending_quantity'); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.armory_validate_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER armory_validate_fields BEFORE INSERT OR UPDATE ON public.armory_records FOR EACH ROW EXECUTE FUNCTION public.armory_validate_record();
CREATE FUNCTION public.armory_adjust_ammunition(_id uuid,_quantity integer,_reason text,_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.armory_records; saved public.armory_records; actor text; BEGIN
 SELECT * INTO r FROM public.armory_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.kind<>'ammunition' OR NOT public.armory_can_access(r.org_unit_id) THEN RAISE EXCEPTION 'Ammunition access denied' USING ERRCODE='42501'; END IF;
 IF r.status<>'verified' OR r.version IS DISTINCT FROM _version OR _quantity IS NULL OR _quantity<0 OR _quantity>100000000 OR length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Verified lot, current version, valid quantity and reason required'; END IF;
 UPDATE public.armory_records SET details=details||jsonb_build_object('pending_quantity',_quantity::text),status='pending',updated_by=auth.uid(),updated_at=now(),version=version+1 WHERE id=r.id RETURNING * INTO saved;
 SELECT trim(p.first_name||' '||p.last_name) INTO actor FROM public.profiles p WHERE p.user_id=auth.uid() LIMIT 1;
 INSERT INTO public.armory_events(record_id,org_unit_id,actor_name,action,reason,before_record,after_record) VALUES(r.id,r.org_unit_id,COALESCE(actor,'Authorized user'),'adjustment_requested',trim(_reason),to_jsonb(r),to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.armory_adjust_ammunition(uuid,integer,text,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_adjust_ammunition(uuid,integer,text,integer) TO authenticated;