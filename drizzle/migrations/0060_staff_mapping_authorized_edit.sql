CREATE OR REPLACE FUNCTION public.staff_mapping_edit_context(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_move_command(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to edit staff mappings'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Active staff record not found'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND (p.org_unit_id IS NULL OR NOT public.has_org_access(auth.uid(),p.org_unit_id) OR NOT public.so_can_see_profile(auth.uid(),p.id)) THEN RAISE EXCEPTION 'Officer is outside your command scope'; END IF;
 RETURN jsonb_build_object('org_unit_id',p.org_unit_id,'destinations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'code',u.code,'type',u.type,'parent_id',u.parent_id,'is_active',u.is_active) ORDER BY u.name),'[]'::jsonb) FROM public.org_units u WHERE u.is_active AND (public.has_role(auth.uid(),'admin') OR public.has_org_access(auth.uid(),u.id))));
END $$;
CREATE OR REPLACE FUNCTION public.save_staff_mapping(_profile_id uuid,_expected_org_unit_id uuid,_to_org_unit_id uuid,_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_move_command(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to edit staff mappings'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_profile_id AND deleted_at IS NULL FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Active staff record not found'; END IF;
 IF p.org_unit_id IS DISTINCT FROM _expected_org_unit_id THEN RAISE EXCEPTION 'Assignment changed; reload the record before saving'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND (p.org_unit_id IS NULL OR NOT public.has_org_access(auth.uid(),p.org_unit_id) OR NOT public.so_can_see_profile(auth.uid(),p.id)) THEN RAISE EXCEPTION 'Officer is outside your command scope'; END IF;
 IF _to_org_unit_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.org_units u WHERE id=_to_org_unit_id AND is_active AND (public.has_role(auth.uid(),'admin') OR public.has_org_access(auth.uid(),u.id))) THEN RAISE EXCEPTION 'Select an active authorised command or unit'; END IF;
 IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter the assignment reason'; END IF;
 PERFORM public.command_move_officers(ARRAY[p.id],_to_org_unit_id,NULL,trim(_reason),current_date);
 RETURN _to_org_unit_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.staff_mapping_edit_context(uuid),public.save_staff_mapping(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_mapping_edit_context(uuid),public.save_staff_mapping(uuid,uuid,uuid,text) TO authenticated;