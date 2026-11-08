CREATE OR REPLACE FUNCTION public.command_vault_activity(_org_unit_id uuid, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, created_at timestamptz, action text, file_id uuid, file_title text, file_name text, detail text, actor_user_id uuid, actor_name text, actor_staff_id text, actor_rank text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.command_vault_can_access(auth.uid(), _org_unit_id) THEN
    RAISE EXCEPTION 'Not authorized to view this command vault log' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.created_at, a.action::text, a.file_id, a.file_title, a.file_name, a.detail, a.actor_user_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.staff_id, r.name
  FROM public.command_vault_file_audit a
  LEFT JOIN public.profiles p ON p.user_id = a.actor_user_id
  LEFT JOIN public.ranks r ON r.id = p.rank_id
  WHERE a.org_unit_id = _org_unit_id
    AND (_from IS NULL OR a.created_at >= _from)
    AND (_to IS NULL OR a.created_at < _to)
  ORDER BY a.created_at DESC, a.id;
END $$;
REVOKE ALL ON FUNCTION public.command_vault_activity(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_vault_activity(uuid, timestamptz, timestamptz) TO authenticated;