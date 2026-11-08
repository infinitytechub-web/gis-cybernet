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
  IF _rank_id IS NOT NULL THEN UPDATE profiles SET rank_id = _rank_id WHERE id=p.id; END IF;
  -- An explicitly chosen grade wins over the automatic grade-from-rank rule.
  IF _grade_id IS NOT NULL THEN UPDATE profiles SET grade_id = _grade_id WHERE id=p.id; END IF;
  INSERT INTO staff_tier_audit(actor_id, action, target_profile_id, reason, details)
  VALUES (auth.uid(), 'assign', p.id, _reason, jsonb_build_object('from_rank',p.rank_id,'to_rank',_rank_id,'from_grade',p.grade_id,'to_grade',_grade_id,'role',_add_role));
END $$;