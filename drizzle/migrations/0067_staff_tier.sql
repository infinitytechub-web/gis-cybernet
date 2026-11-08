CREATE TABLE IF NOT EXISTS public.staff_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_grades TO authenticated;
GRANT ALL ON public.staff_grades TO service_role;
ALTER TABLE public.staff_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read grades" ON public.staff_grades FOR SELECT TO authenticated USING (true);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.staff_grades(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.staff_tier_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_profile_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_tier_audit TO authenticated;
GRANT ALL ON public.staff_tier_audit TO service_role;
ALTER TABLE public.staff_tier_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read tier audit" ON public.staff_tier_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.save_staff_tier_definition(_kind text, _id uuid, _name text, _code text, _sort integer, _active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only Super Admins can define ranks and grades'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF _kind = 'grade' THEN
    IF _id IS NULL THEN
      INSERT INTO staff_grades(name, code, sort_order, is_active, created_by) VALUES (trim(_name), nullif(trim(_code),''), coalesce(_sort,0), coalesce(_active,true), auth.uid()) RETURNING id INTO v_id;
    ELSE
      UPDATE staff_grades SET name=trim(_name), code=nullif(trim(_code),''), sort_order=coalesce(_sort,sort_order), is_active=coalesce(_active,is_active), updated_at=now() WHERE id=_id RETURNING id INTO v_id;
    END IF;
  ELSIF _kind = 'rank' THEN
    IF _id IS NULL THEN
      INSERT INTO ranks(name, abbreviation, sort_order) VALUES (trim(_name), nullif(trim(_code),''), coalesce(_sort,0)) RETURNING id INTO v_id;
    ELSE
      UPDATE ranks SET name=trim(_name), abbreviation=nullif(trim(_code),''), sort_order=coalesce(_sort,sort_order) WHERE id=_id RETURNING id INTO v_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unknown kind'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  INSERT INTO staff_tier_audit(actor_id, action, details) VALUES (auth.uid(), 'define_'||_kind, jsonb_build_object('id',v_id,'name',_name,'code',_code,'active',_active));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.assign_staff_tier(_profile_id uuid, _rank_id uuid, _grade_id uuid, _add_role app_role, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT id, user_id, org_unit_id, rank_id, grade_id INTO p FROM profiles WHERE id=_profile_id AND deleted_at IS NULL;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Staff record not found'; END IF;
  v_admin := public.has_role(auth.uid(), 'admin');
  IF NOT v_admin AND (p.org_unit_id IS NULL OR NOT public.is_command_head_for(auth.uid(), p.org_unit_id)) THEN
    RAISE EXCEPTION 'Only Super Admins or this officer''s command head can assign tiers'; END IF;
  IF p.user_id = auth.uid() AND NOT v_admin THEN RAISE EXCEPTION 'You cannot change your own tier'; END IF;
  IF _add_role IS NOT NULL THEN
    IF NOT v_admin AND _add_role IN ('admin') THEN RAISE EXCEPTION 'Only Super Admins can grant that role'; END IF;
    IF p.user_id IS NULL THEN RAISE EXCEPTION 'This officer has no sign-in account for a role'; END IF;
    IF EXISTS (SELECT 1 FROM user_roles WHERE user_id=p.user_id AND role=_add_role) THEN RAISE EXCEPTION 'This officer already has that role'; END IF;
    INSERT INTO user_roles(user_id, role) VALUES (p.user_id, _add_role);
  END IF;
  IF _grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_grades WHERE id=_grade_id AND is_active) THEN RAISE EXCEPTION 'Grade is not active'; END IF;
  UPDATE profiles SET rank_id = coalesce(_rank_id, rank_id), grade_id = coalesce(_grade_id, grade_id) WHERE id=p.id;
  INSERT INTO staff_tier_audit(actor_id, action, target_profile_id, reason, details)
  VALUES (auth.uid(), 'assign', p.id, _reason, jsonb_build_object('from_rank',p.rank_id,'to_rank',_rank_id,'from_grade',p.grade_id,'to_grade',_grade_id,'role',_add_role));
END $$;

CREATE OR REPLACE FUNCTION public.staff_tier_summary(_org_unit_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH s AS (
    SELECT p.id, p.user_id, p.rank_id, p.grade_id FROM profiles p
    WHERE p.deleted_at IS NULL AND (_org_unit_id IS NULL OR p.org_unit_id = _org_unit_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM s),
    'ranks', coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',coalesce(r.name,'No rank'),'count',x.c) ORDER BY r.sort_order NULLS LAST) FROM (SELECT rank_id, count(*) c FROM s GROUP BY rank_id) x LEFT JOIN ranks r ON r.id=x.rank_id),'[]'::jsonb),
    'grades', coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',coalesce(g.name,'No grade'),'count',x.c) ORDER BY g.sort_order NULLS LAST) FROM (SELECT grade_id, count(*) c FROM s GROUP BY grade_id) x LEFT JOIN staff_grades g ON g.id=x.grade_id),'[]'::jsonb),
    'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.role,'name',x.role,'count',x.c) ORDER BY x.c DESC) FROM (SELECT ur.role::text role, count(DISTINCT s.id) c FROM s JOIN user_roles ur ON ur.user_id=s.user_id GROUP BY ur.role) x),'[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.save_staff_tier_definition(text,uuid,text,text,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_staff_tier(uuid,uuid,uuid,app_role,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_tier_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_staff_tier_definition(text,uuid,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_staff_tier(uuid,uuid,uuid,app_role,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_tier_summary(uuid) TO authenticated;