CREATE OR REPLACE FUNCTION public.delete_custom_role(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_admin boolean := public.has_role(auth.uid(),'admin');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_command_tier(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO r FROM custom_roles WHERE id=_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT v_admin THEN
    IF r.org_unit_id IS NULL OR NOT public.can_see_org_unit(auth.uid(), r.org_unit_id) THEN RAISE EXCEPTION 'Role is outside your command'; END IF;
    IF NOT public.custom_role_base_allowed(r.base_role) THEN RAISE EXCEPTION 'Only Super Admins can delete this role'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM custom_role_assignments WHERE custom_role_id=r.id) THEN
    RAISE EXCEPTION 'Remove every officer from this role before deleting it';
  END IF;
  DELETE FROM custom_roles WHERE id=r.id;
  INSERT INTO staff_tier_audit(actor_id, action, reason, details)
  VALUES (auth.uid(), 'delete_role', _reason, jsonb_build_object('id',r.id,'name',r.name,'base_role',r.base_role,'org_unit_id',r.org_unit_id));
END $$;
REVOKE ALL ON FUNCTION public.delete_custom_role(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_custom_role(uuid,text) TO authenticated;