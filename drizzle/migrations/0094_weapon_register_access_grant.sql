CREATE OR REPLACE FUNCTION public.armory_can_manage_weapons(_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ SELECT public.armory_can_manage(_unit) OR (auth.uid() IS NOT NULL AND public.armory_can_access(_unit) AND EXISTS(SELECT 1 FROM public.command_tier_grants g WHERE g.user_id=auth.uid() AND g.capability='armory-weapon-register' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()))) $f$;
REVOKE ALL ON FUNCTION public.armory_can_manage_weapons(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_can_manage_weapons(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.armory_guard_management()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT (public.armory_can_manage(NEW.org_unit_id) OR (NEW.kind='weapon' AND public.armory_can_manage_weapons(NEW.org_unit_id))) OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=NEW.org_unit_id AND u.is_active) THEN RAISE EXCEPTION 'Active command management permission required' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT public.armory_can_manage(OLD.org_unit_id) AND NOT (OLD.kind='weapon' AND NEW.kind='weapon' AND NEW.org_unit_id=OLD.org_unit_id AND NEW.status=OLD.status AND public.armory_can_manage_weapons(OLD.org_unit_id)) AND NOT (NEW.kind='weapon' AND NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id AND public.armory_can_approve(NEW.org_unit_id) AND EXISTS(SELECT 1 FROM public.armory_records r WHERE r.kind='transfer' AND r.asset_id=OLD.id AND r.destination_unit_id=NEW.org_unit_id AND r.status='handed_over')) AND NOT (NEW.kind='transfer' AND NEW.status='received' AND OLD.status='handed_over' AND public.armory_can_approve(NEW.destination_unit_id)) AND NOT (NEW.kind='custody' AND OLD.status='approved' AND NEW.status='acknowledged' AND NEW.details=OLD.details AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Armory management permission required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.armory_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('commands',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'active',u.is_active,'can_approve',public.armory_can_approve(u.id),'can_manage',public.armory_can_manage(u.id),'can_manage_weapons',public.armory_can_manage_weapons(u.id)) ORDER BY u.name) FROM public.org_units u WHERE public.armory_can_access(u.id)),'[]'::jsonb),'staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'first_name',p.first_name,'last_name',p.last_name,'staff_id',CASE WHEN public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR p.user_id=auth.uid() THEN p.staff_id ELSE left(p.staff_id,3)||repeat('•',greatest(length(p.staff_id)-5,0))||right(p.staff_id,2) END,'org_unit_id',p.org_unit_id) ORDER BY p.last_name,p.first_name) FROM public.profiles p WHERE p.deleted_at IS NULL AND p.status='active' AND public.armory_can_access(p.org_unit_id)),'[]'::jsonb)) INTO result;
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.officer_capability_state(_profile_id uuid, _capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid; g public.command_tier_grants;
BEGIN
 IF _capability NOT IN ('armory-weapons','armory-weapon-register') THEN RAISE EXCEPTION 'Unsupported capability'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Super Admin only' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO uid FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL;
 IF uid IS NULL THEN RETURN jsonb_build_object('has_account',false,'granted',false); END IF;
 SELECT * INTO g FROM public.command_tier_grants WHERE user_id=uid AND capability=_capability AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('has_account',true,'granted',g.id IS NOT NULL,'granted_at',g.created_at,'granted_by_name',g.granted_by_name,'reason',g.reason,
   'built_in', public.has_role(uid,'admin') OR public.has_role(uid,'oic') OR public.has_role(uid,'2ic') OR public.has_role(uid,'chief_staff_officer'));
END $function$;
CREATE OR REPLACE FUNCTION public.set_officer_capability(_profile_id uuid, _capability text, _grant boolean, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid; actor text; n int;
BEGIN
 IF _capability NOT IN ('armory-weapons','armory-weapon-register') THEN RAISE EXCEPTION 'Unsupported capability'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Only Super Admins can change armory access' USING ERRCODE='42501'; END IF;
 IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'A reason is required'; END IF;
 SELECT user_id INTO uid FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL AND status='active';
 IF uid IS NULL THEN RAISE EXCEPTION 'Officer must be active and have a sign-in account'; END IF;
 IF uid=auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access'; END IF;
 SELECT NULLIF(trim(first_name||' '||last_name),'') INTO actor FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
 IF _grant THEN
  IF EXISTS(SELECT 1 FROM public.command_tier_grants WHERE user_id=uid AND capability=_capability AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())) THEN RAISE EXCEPTION 'Officer already has this access'; END IF;
  UPDATE public.command_tier_grants SET revoked_at=now(),revoked_by=auth.uid(),updated_at=now() WHERE user_id=uid AND capability=_capability AND revoked_at IS NULL;
  INSERT INTO public.command_tier_grants(user_id,capability,reason,granted_by,granted_by_name) VALUES(uid,_capability,trim(_reason),auth.uid(),actor);
 ELSE
  UPDATE public.command_tier_grants SET revoked_at=now(),revoked_by=auth.uid(),updated_at=now() WHERE user_id=uid AND capability=_capability AND revoked_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT; IF n=0 THEN RAISE EXCEPTION 'Officer has no such access to revoke'; END IF;
 END IF;
 INSERT INTO public.system_audit_log(action,entity_type,entity_id,performed_by,details)
 VALUES(CASE WHEN _grant THEN 'capability_granted' ELSE 'capability_revoked' END,'profiles',_profile_id,auth.uid(),jsonb_build_object('reason',trim(_reason),'capability',_capability));
END $function$;
REVOKE ALL ON FUNCTION public.officer_capability_state(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.officer_capability_state(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_officer_capability(uuid,text,boolean,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.set_officer_capability(uuid,text,boolean,text) TO authenticated;