CREATE FUNCTION public.armory_can_manage(_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.armory_can_access(_unit) AND (public.has_role(auth.uid(),'admin') OR public.is_command_head_for(auth.uid(),_unit) OR (public.has_role(auth.uid(),'chief_staff_officer') AND NOT public.is_scoped_staff_officer(auth.uid())) OR EXISTS(SELECT 1 FROM public.command_tier_grants g WHERE g.user_id=auth.uid() AND g.capability='armory-manage' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()))); $$;
REVOKE ALL ON FUNCTION public.armory_can_manage(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.armory_can_manage(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.armory_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('commands',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'active',u.is_active,'can_approve',public.armory_can_approve(u.id),'can_manage',public.armory_can_manage(u.id)) ORDER BY u.name) FROM public.org_units u WHERE public.armory_can_access(u.id)),'[]'::jsonb),'staff',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'first_name',p.first_name,'last_name',p.last_name,'staff_id',CASE WHEN public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic') OR p.user_id=auth.uid() THEN p.staff_id ELSE left(p.staff_id,3)||repeat('•',greatest(length(p.staff_id)-5,0))||right(p.staff_id,2) END,'org_unit_id',p.org_unit_id) ORDER BY p.last_name,p.first_name) FROM public.profiles p WHERE p.deleted_at IS NULL AND p.status='active' AND public.armory_can_access(p.org_unit_id)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.armory_guard_management() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT public.armory_can_manage(NEW.org_unit_id) OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=NEW.org_unit_id AND u.is_active) THEN RAISE EXCEPTION 'Active command management permission required' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT public.armory_can_manage(OLD.org_unit_id) AND NOT (NEW.kind='weapon' AND NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id AND public.armory_can_approve(NEW.org_unit_id) AND EXISTS(SELECT 1 FROM public.armory_records r WHERE r.kind='transfer' AND r.asset_id=OLD.id AND r.destination_unit_id=NEW.org_unit_id AND r.status='handed_over')) AND NOT (NEW.kind='transfer' AND NEW.status='received' AND OLD.status='handed_over' AND public.armory_can_approve(NEW.destination_unit_id)) AND NOT (NEW.kind='custody' AND OLD.status='approved' AND NEW.status='acknowledged' AND NEW.details=OLD.details AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Armory management permission required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.armory_guard_management() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER armory_management_guard BEFORE INSERT OR UPDATE ON public.armory_records FOR EACH ROW EXECUTE FUNCTION public.armory_guard_management();
ALTER PUBLICATION supabase_realtime ADD TABLE public.armory_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.armory_events;