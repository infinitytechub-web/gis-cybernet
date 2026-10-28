CREATE OR REPLACE FUNCTION public.regional_commands_overview()
RETURNS TABLE(id uuid, name text, type text, activation_status text, display_order int, brand_color text, staff_count bigint, is_own boolean, can_open boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid(); _admin boolean; _own uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _admin := public.has_role(_uid,'admin');
  SELECT public.command_region_of(p.org_unit_id) INTO _own FROM profiles p WHERE p.user_id=_uid AND p.deleted_at IS NULL LIMIT 1;
  RETURN QUERY
  SELECT o.id, o.name, o.type::text, o.activation_status, o.display_order, o.brand_color,
    CASE WHEN _admin OR o.id=_own THEN (SELECT count(*) FROM profiles p WHERE p.deleted_at IS NULL AND public.command_region_of(p.org_unit_id)=o.id) ELSE NULL END,
    coalesce(o.id=_own,false),
    o.activation_status='active' AND (_admin OR coalesce(o.id=_own,false))
  FROM org_units o
  WHERE (o.id='95ab6cb7-290f-45fb-ad23-32664e34dacd'
     OR (o.type='regional' AND o.parent_id IN ('95ab6cb7-290f-45fb-ad23-32664e34dacd','cfed7729-3406-430f-a324-ae86bb303488')))
    AND (_admin OR o.id=_own)
  ORDER BY o.display_order NULLS LAST, o.name;
END $$;