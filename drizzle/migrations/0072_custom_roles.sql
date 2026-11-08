CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  base_role app_role NOT NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_roles_name_scope_uq ON public.custom_roles (lower(name), coalesce(org_unit_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE public.custom_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custom_role_id, profile_id)
);
GRANT SELECT ON public.custom_roles TO authenticated;
GRANT SELECT ON public.custom_role_assignments TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
GRANT ALL ON public.custom_role_assignments TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier read custom roles" ON public.custom_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR (public.is_command_tier(auth.uid()) AND (org_unit_id IS NULL OR public.can_see_org_unit(auth.uid(), org_unit_id))));
CREATE POLICY "Read own or scoped custom role assignments" ON public.custom_role_assignments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.user_id=auth.uid())
  OR (public.is_command_tier(auth.uid()) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=profile_id AND p.org_unit_id IS NOT NULL AND public.can_see_org_unit(auth.uid(), p.org_unit_id))));

CREATE OR REPLACE FUNCTION public.custom_role_base_allowed(_role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR _role NOT IN ('admin','oic','2ic','head_of_administration','chief_staff_officer','command_officer')
$$;

CREATE OR REPLACE FUNCTION public.save_custom_role(_id uuid, _name text, _description text, _base_role app_role, _org_unit_id uuid, _active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin boolean := public.has_role(auth.uid(),'admin'); v_id uuid; v_old record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_command_tier(auth.uid()) THEN RAISE EXCEPTION 'Only Command Tier staff and Super Admins can create roles'; END IF;
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
    SELECT * INTO v_old FROM custom_roles WHERE id=_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
    IF NOT v_admin AND (v_old.org_unit_id IS NULL OR NOT public.can_see_org_unit(auth.uid(), v_old.org_unit_id) OR NOT public.custom_role_base_allowed(v_old.base_role)) THEN RAISE EXCEPTION 'You cannot edit this role'; END IF;
    UPDATE custom_roles SET name=trim(_name), description=nullif(trim(_description),''), base_role=_base_role, org_unit_id=_org_unit_id, is_active=coalesce(_active,is_active), updated_at=now() WHERE id=_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO staff_tier_audit(actor_id, action, details) VALUES (auth.uid(), CASE WHEN _id IS NULL THEN 'create_role' ELSE 'update_role' END, jsonb_build_object('id',v_id,'name',_name,'base_role',_base_role,'org_unit_id',_org_unit_id,'active',_active));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A role with this name already exists for that command';
END $$;

CREATE OR REPLACE FUNCTION public.assign_custom_role(_custom_role_id uuid, _profile_id uuid, _remove boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; p record; v_admin boolean := public.has_role(auth.uid(),'admin');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_command_tier(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
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
    DELETE FROM custom_role_assignments WHERE custom_role_id=r.id AND profile_id=p.id;
  ELSE
    IF EXISTS (SELECT 1 FROM custom_role_assignments WHERE custom_role_id=r.id AND profile_id=p.id) THEN RAISE EXCEPTION 'This officer already has that role'; END IF;
    INSERT INTO custom_role_assignments(custom_role_id, profile_id, assigned_by) VALUES (r.id, p.id, auth.uid());
    IF p.user_id IS NOT NULL THEN INSERT INTO user_roles(user_id, role) VALUES (p.user_id, r.base_role) ON CONFLICT (user_id, role) DO NOTHING; END IF;
  END IF;
  INSERT INTO staff_tier_audit(actor_id, action, target_profile_id, reason, details)
  VALUES (auth.uid(), CASE WHEN coalesce(_remove,false) THEN 'unassign_role' ELSE 'assign_role' END, p.id, _reason, jsonb_build_object('custom_role_id',r.id,'name',r.name,'base_role',r.base_role));
END $$;

REVOKE ALL ON FUNCTION public.save_custom_role(uuid,text,text,app_role,uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_custom_role(uuid,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_custom_role(uuid,text,text,app_role,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_custom_role(uuid,uuid,boolean,text) TO authenticated;