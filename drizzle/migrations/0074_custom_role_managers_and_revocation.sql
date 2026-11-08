CREATE OR REPLACE FUNCTION public.can_manage_custom_roles(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text IN ('admin','oic','2ic','chief_staff_officer'))
$$;
REVOKE ALL ON FUNCTION public.can_manage_custom_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_custom_roles(uuid) TO authenticated;

ALTER TABLE public.custom_role_assignments ADD COLUMN IF NOT EXISTS granted_base boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.custom_role_assignments.granted_base IS 'True when this assignment created the user_roles row for the base permission, so removing it revokes that permission.';

DROP POLICY IF EXISTS "Command tier read custom roles" ON public.custom_roles;
CREATE POLICY "Role managers read custom roles" ON public.custom_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR (public.can_manage_custom_roles(auth.uid()) AND (org_unit_id IS NULL OR public.can_see_org_unit(auth.uid(), org_unit_id))));
DROP POLICY IF EXISTS "Read own or scoped custom role assignments" ON public.custom_role_assignments;
CREATE POLICY "Read own or scoped custom role assignments" ON public.custom_role_assignments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.user_id=auth.uid())
  OR (public.can_manage_custom_roles(auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.org_unit_id IS NOT NULL AND public.can_see_org_unit(auth.uid(), p.org_unit_id))));

CREATE OR REPLACE FUNCTION public.save_custom_role(_id uuid, _name text, _description text, _base_role app_role, _org_unit_id uuid, _active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin boolean := public.has_role(auth.uid(),'admin'); v_id uuid; v_old record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_custom_roles(auth.uid()) THEN RAISE EXCEPTION 'Only Super Admins, OIC, 2IC and Chief Staff Officers can create roles'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Role name is required'; END IF;
  IF NOT public.custom_role_base_allowed(_base_role) THEN RAISE EXCEPTION 'Only Super Admins can create roles with that permission level'; END IF;
  IF NOT v_admin THEN
    IF _org_unit_id IS NULL THEN RAISE EXCEPTION 'Choose the command this role belongs to'; END IF;
    IF NOT public.can_see_org_unit(auth.uid(), _org_unit_id) THEN RAISE EXCEPTION 'You can only create roles for your own command'; END IF;
  END IF;
  IF _id IS NULL THEN
    INSERT INTO custom_roles(name, description, base_role, org_unit_id, is_active, created_by)
    VALUES (trim(_name), nullif(trim(_description),''), _base_role, _org_unit_id, coalesce(_active,true), auth.uid()) RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_old FROM custom_roles WHERE id=_id FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
    IF NOT v_admin AND (v_old.org_unit_id IS NULL OR NOT public.can_see_org_unit(auth.uid(), v_old.org_unit_id) OR NOT public.custom_role_base_allowed(v_old.base_role)) THEN RAISE EXCEPTION 'You cannot edit this role'; END IF;
    IF v_old.base_role <> _base_role AND EXISTS (SELECT 1 FROM custom_role_assignments WHERE custom_role_id=_id) THEN
      RAISE EXCEPTION 'Remove every officer from this role before changing its permission level';
    END IF;
    UPDATE custom_roles SET name=trim(_name), description=nullif(trim(_description),''), base_role=_base_role, org_unit_id=_org_unit_id, is_active=coalesce(_active,is_active), updated_at=now() WHERE id=_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO staff_tier_audit(actor_id, action, details) VALUES (auth.uid(), CASE WHEN _id IS NULL THEN 'create_role' ELSE 'update_role' END, jsonb_build_object('id',v_id,'name',_name,'base_role',_base_role,'org_unit_id',_org_unit_id,'active',_active));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A role with this name already exists for that command';
END $$;

CREATE OR REPLACE FUNCTION public.assign_custom_role(_custom_role_id uuid, _profile_id uuid, _remove boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; p record; a record; v_admin boolean := public.has_role(auth.uid(),'admin'); v_inserted int; v_heir uuid; v_revoked boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_custom_roles(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO r FROM custom_roles WHERE id=_custom_role_id;
  SELECT id, user_id, org_unit_id INTO p FROM profiles WHERE id=_profile_id AND deleted_at IS NULL;
  IF r.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'Role or officer not found'; END IF;
  IF NOT r.is_active AND NOT coalesce(_remove,false) THEN RAISE EXCEPTION 'This role is retired'; END IF;
  IF NOT v_admin THEN
    IF p.user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own roles'; END IF;
    IF NOT public.custom_role_base_allowed(r.base_role) THEN RAISE EXCEPTION 'Only Super Admins can assign this role'; END IF;
    IF p.org_unit_id IS NULL OR NOT public.can_see_org_unit(auth.uid(), p.org_unit_id) THEN RAISE EXCEPTION 'Officer is outside your command'; END IF;
    IF r.org_unit_id IS NOT NULL AND NOT public.can_see_org_unit(auth.uid(), r.org_unit_id) THEN RAISE EXCEPTION 'Role is outside your command'; END IF;
  END IF;
  IF coalesce(_remove,false) THEN
    DELETE FROM custom_role_assignments WHERE custom_role_id=r.id AND profile_id=p.id RETURNING * INTO a;
    IF a.id IS NULL THEN RAISE EXCEPTION 'This officer does not hold that role'; END IF;
    IF a.granted_base AND p.user_id IS NOT NULL THEN
      -- Hand the grant to another custom role that gives the same permission; otherwise revoke it.
      SELECT ca.id INTO v_heir FROM custom_role_assignments ca JOIN custom_roles cr ON cr.id=ca.custom_role_id
        WHERE ca.profile_id=p.id AND cr.base_role=r.base_role AND cr.is_active LIMIT 1;
      IF v_heir IS NOT NULL THEN
        UPDATE custom_role_assignments SET granted_base=true WHERE id=v_heir;
      ELSE
        DELETE FROM user_roles WHERE user_id=p.user_id AND role=r.base_role;
        v_revoked := true;
        IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=p.user_id) THEN
          INSERT INTO user_roles(user_id, role) VALUES (p.user_id, 'staff') ON CONFLICT (user_id, role) DO NOTHING;
        END IF;
      END IF;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM custom_role_assignments WHERE custom_role_id=r.id AND profile_id=p.id) THEN RAISE EXCEPTION 'This officer already has that role'; END IF;
    v_inserted := 0;
    IF p.user_id IS NOT NULL THEN
      INSERT INTO user_roles(user_id, role) VALUES (p.user_id, r.base_role) ON CONFLICT (user_id, role) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END IF;
    INSERT INTO custom_role_assignments(custom_role_id, profile_id, assigned_by, granted_base) VALUES (r.id, p.id, auth.uid(), v_inserted > 0);
  END IF;
  INSERT INTO staff_tier_audit(actor_id, action, target_profile_id, reason, details)
  VALUES (auth.uid(), CASE WHEN coalesce(_remove,false) THEN 'unassign_role' ELSE 'assign_role' END, p.id, _reason,
    jsonb_build_object('custom_role_id',r.id,'name',r.name,'base_role',r.base_role,'permission_revoked',v_revoked));
END $$;

CREATE OR REPLACE FUNCTION public.delete_custom_role(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_admin boolean := public.has_role(auth.uid(),'admin');
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_custom_roles(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
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

-- Head of Administration is no longer a command-tier role.
CREATE OR REPLACE FUNCTION public.can_export_hrm(_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('admin','oic','2ic','staff_officer','chief_staff_officer','supervisor'));
$$;