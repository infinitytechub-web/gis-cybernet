CREATE OR REPLACE FUNCTION public._custom_role_unit_ok(_role_unit uuid, _officer_unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _role_unit IS NULL OR (_officer_unit IS NOT NULL AND _officer_unit IN (SELECT public.org_unit_descendants(_role_unit)));
$$;
REVOKE EXECUTE ON FUNCTION public._custom_role_unit_ok(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.assign_custom_role(_custom_role_id uuid, _profile_id uuid, _remove boolean, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; p record; a record; v_admin boolean := public.has_role(auth.uid(),'admin'); v_inserted int; v_heir uuid; v_revoked boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_custom_roles(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO r FROM custom_roles WHERE id=_custom_role_id;
  SELECT id, user_id, org_unit_id INTO p FROM profiles WHERE id=_profile_id AND deleted_at IS NULL;
  IF r.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'Role or officer not found'; END IF;
  IF NOT r.is_active AND NOT coalesce(_remove,false) THEN RAISE EXCEPTION 'This role is retired'; END IF;
  IF NOT coalesce(_remove,false) AND NOT public._custom_role_unit_ok(r.org_unit_id, p.org_unit_id) THEN
    RAISE EXCEPTION 'This role belongs to another command; the officer must be posted there first';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.save_custom_role(_id uuid, _name text, _description text, _base_role app_role, _org_unit_id uuid, _active boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    IF v_old.org_unit_id IS DISTINCT FROM _org_unit_id AND EXISTS (
      SELECT 1 FROM custom_role_assignments ca JOIN profiles p ON p.id=ca.profile_id
      WHERE ca.custom_role_id=_id AND NOT public._custom_role_unit_ok(_org_unit_id, p.org_unit_id)) THEN
      RAISE EXCEPTION 'Some officers holding this role are outside the new command; remove them first';
    END IF;
    UPDATE custom_roles SET name=trim(_name), description=nullif(trim(_description),''), base_role=_base_role, org_unit_id=_org_unit_id, is_active=coalesce(_active,is_active), updated_at=now() WHERE id=_id RETURNING id INTO v_id;
  END IF;
  INSERT INTO staff_tier_audit(actor_id, action, details) VALUES (auth.uid(), CASE WHEN _id IS NULL THEN 'create_role' ELSE 'update_role' END, jsonb_build_object('id',v_id,'custom_role_id',v_id,'name',_name,'base_role',_base_role,'org_unit_id',_org_unit_id,'active',_active));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'A role with this name already exists for that command';
END $function$;

CREATE OR REPLACE FUNCTION public.custom_roles_follow_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; v_heir uuid; v_revoked boolean;
BEGIN
  FOR a IN SELECT ca.*, cr.base_role, cr.name, cr.org_unit_id AS role_unit FROM custom_role_assignments ca JOIN custom_roles cr ON cr.id=ca.custom_role_id
    WHERE ca.profile_id=NEW.id AND cr.org_unit_id IS NOT NULL AND NOT public._custom_role_unit_ok(cr.org_unit_id, NEW.org_unit_id)
  LOOP
    v_revoked := false;
    DELETE FROM custom_role_assignments WHERE id=a.id;
    IF a.granted_base AND NEW.user_id IS NOT NULL THEN
      SELECT ca.id INTO v_heir FROM custom_role_assignments ca JOIN custom_roles cr ON cr.id=ca.custom_role_id
        WHERE ca.profile_id=NEW.id AND cr.base_role=a.base_role AND cr.is_active LIMIT 1;
      IF v_heir IS NOT NULL THEN UPDATE custom_role_assignments SET granted_base=true WHERE id=v_heir;
      ELSE
        DELETE FROM user_roles WHERE user_id=NEW.user_id AND role=a.base_role; v_revoked := true;
        IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=NEW.user_id) THEN
          INSERT INTO user_roles(user_id, role) VALUES (NEW.user_id,'staff') ON CONFLICT (user_id, role) DO NOTHING;
        END IF;
      END IF;
    END IF;
    INSERT INTO staff_tier_audit(actor_id, action, target_profile_id, reason, details)
    VALUES (auth.uid(), 'unassign_role', NEW.id, 'Transferred out of command',
      jsonb_build_object('custom_role_id',a.custom_role_id,'name',a.name,'base_role',a.base_role,'permission_revoked',v_revoked,'automatic',true));
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.custom_roles_follow_posting() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_custom_roles_follow_posting ON public.profiles;
CREATE TRIGGER trg_custom_roles_follow_posting AFTER UPDATE OF org_unit_id ON public.profiles
  FOR EACH ROW WHEN (OLD.org_unit_id IS DISTINCT FROM NEW.org_unit_id) EXECUTE FUNCTION public.custom_roles_follow_posting();

CREATE OR REPLACE FUNCTION public.custom_role_history(_role_id uuid)
RETURNS TABLE(id uuid, action text, actor_name text, officer_name text, reason text, details jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_custom_roles(auth.uid()) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO r FROM custom_roles WHERE custom_roles.id=_role_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT public.has_role(auth.uid(),'admin') AND (r.org_unit_id IS NULL OR NOT public.can_see_org_unit(auth.uid(), r.org_unit_id)) THEN RAISE EXCEPTION 'Role is outside your command'; END IF;
  RETURN QUERY
  SELECT a.id, a.action, nullif(trim(coalesce(ap.first_name,'')||' '||coalesce(ap.last_name,'')),''),
         nullif(trim(coalesce(tp.first_name,'')||' '||coalesce(tp.last_name,'')),''), a.reason, a.details, a.created_at
  FROM staff_tier_audit a
  LEFT JOIN profiles ap ON ap.user_id=a.actor_id
  LEFT JOIN profiles tp ON tp.id=a.target_profile_id
  WHERE a.details->>'custom_role_id' = _role_id::text OR a.details->>'id' = _role_id::text
  ORDER BY a.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.custom_role_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.custom_role_history(uuid) TO authenticated;