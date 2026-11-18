CREATE OR REPLACE FUNCTION public.armory_access_state(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; g public.command_tier_grants;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Super Admin only' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO uid FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL;
 IF uid IS NULL THEN RETURN jsonb_build_object('has_account',false,'granted',false); END IF;
 SELECT * INTO g FROM public.command_tier_grants WHERE user_id=uid AND capability='armory-weapons' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('has_account',true,'granted',g.id IS NOT NULL,'granted_at',g.created_at,'granted_by_name',g.granted_by_name,'reason',g.reason,
   'built_in', public.has_role(uid,'admin') OR public.has_role(uid,'oic') OR public.has_role(uid,'2ic') OR public.has_role(uid,'chief_staff_officer'));
END $$;
REVOKE ALL ON FUNCTION public.armory_access_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.armory_access_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_armory_access(_profile_id uuid,_grant boolean,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; actor text; n int;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins can change armory access' USING ERRCODE='42501'; END IF;
 IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 SELECT user_id INTO uid FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL AND status='active';
 IF uid IS NULL THEN RAISE EXCEPTION 'Officer must be active and have a sign-in account'; END IF;
 IF uid=auth.uid() THEN RAISE EXCEPTION 'You cannot change your own armory access'; END IF;
 SELECT NULLIF(trim(first_name||' '||last_name),'') INTO actor FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
 IF _grant THEN
  IF EXISTS(SELECT 1 FROM public.command_tier_grants WHERE user_id=uid AND capability='armory-weapons' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Officer already has armory access'; END IF;
  UPDATE public.command_tier_grants SET revoked_at=now(),revoked_by=auth.uid(),updated_at=now() WHERE user_id=uid AND capability='armory-weapons' AND revoked_at IS NULL;
  INSERT INTO public.command_tier_grants(user_id,capability,reason,granted_by,granted_by_name) VALUES(uid,'armory-weapons',trim(_reason),auth.uid(),actor);
 ELSE
  UPDATE public.command_tier_grants SET revoked_at=now(),revoked_by=auth.uid(),updated_at=now() WHERE user_id=uid AND capability='armory-weapons' AND revoked_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT; IF n=0 THEN RAISE EXCEPTION 'Officer has no armory access to revoke'; END IF;
 END IF;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details)
 VALUES(CASE WHEN _grant THEN 'armory_access_granted' ELSE 'armory_access_revoked' END,'profiles',_profile_id,auth.uid(),jsonb_build_object('reason',trim(_reason)));
END $$;
REVOKE ALL ON FUNCTION public.set_armory_access(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_armory_access(uuid,boolean,text) TO authenticated;