CREATE OR REPLACE FUNCTION public.armory_guard_management()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT (public.armory_can_manage(NEW.org_unit_id) OR (NEW.kind='weapon' AND public.armory_can_manage_weapons(NEW.org_unit_id))) OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE u.id=NEW.org_unit_id AND u.is_active) THEN RAISE EXCEPTION 'Active command management permission required' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT public.armory_can_manage(OLD.org_unit_id) AND NOT (OLD.kind='weapon' AND NEW.kind='weapon' AND NEW.org_unit_id=OLD.org_unit_id AND NEW.status=OLD.status AND public.armory_can_manage_weapons(OLD.org_unit_id)) AND NOT (NEW.kind='weapon' AND NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id AND public.armory_can_approve(NEW.org_unit_id) AND EXISTS(SELECT 1 FROM public.armory_records r WHERE r.kind='transfer' AND r.asset_id=OLD.id AND r.destination_unit_id=NEW.org_unit_id AND r.status='handed_over')) AND NOT (NEW.kind='transfer' AND NEW.status='received' AND OLD.status='handed_over' AND public.armory_can_approve(NEW.destination_unit_id)) AND NOT (NEW.kind='custody' AND OLD.status='handed_over' AND NEW.status IN ('acknowledged','discrepancy') AND NEW.details=OLD.details AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.profile_id AND p.user_id=auth.uid() AND p.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Armory management permission required' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $function$;