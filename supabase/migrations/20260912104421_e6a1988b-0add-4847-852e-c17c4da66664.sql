CREATE OR REPLACE FUNCTION public.directory_rights_at_unit(_profile_id uuid, _org_unit_id uuid)
 RETURNS TABLE(level text, scope text, assigned boolean, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean, can_download boolean, can_print boolean, can_vault boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _lvl text;
  _is_admin boolean;
  _self boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.user_id INTO _uid FROM public.profiles p WHERE p.id = _profile_id;

  -- Every officer may inspect their OWN rights (needed by my_command_context /
  -- the command portal). Inspecting somebody else's rights stays command-tier.
  _self := _uid IS NOT NULL AND _uid = auth.uid();
  IF NOT _self AND NOT public.can_move_command(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to inspect directory rights';
  END IF;

  _lvl := public.directory_level_of_unit(_org_unit_id);
  _is_admin := _uid IS NOT NULL AND public.has_role(_uid, 'admin'::app_role);

  IF _org_unit_id IS NULL OR _lvl IS NULL THEN
    RETURN QUERY SELECT NULL::text, 'none'::text, false,
      _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT _lvl,
         CASE WHEN _is_admin THEN 'all' ELSE COALESCE(MIN(dp.scope), 'none') END,
         true,
         _is_admin OR COALESCE(bool_or(dp.can_view), false),
         _is_admin OR COALESCE(bool_or(dp.can_create), false),
         _is_admin OR COALESCE(bool_or(dp.can_edit), false),
         _is_admin OR COALESCE(bool_or(dp.can_delete), false),
         _is_admin OR COALESCE(bool_or(dp.can_download), false),
         _is_admin OR COALESCE(bool_or(dp.can_print), false),
         _is_admin OR COALESCE(bool_or(dp.can_vault), false)
  FROM public.user_roles ur
  LEFT JOIN public.directory_permissions dp ON dp.role = ur.role AND dp.level = _lvl
  WHERE ur.user_id = _uid;

  IF NOT FOUND THEN
    RETURN QUERY SELECT _lvl, CASE WHEN _is_admin THEN 'all' ELSE 'none' END, true,
      _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin;
  END IF;
END;
$function$;