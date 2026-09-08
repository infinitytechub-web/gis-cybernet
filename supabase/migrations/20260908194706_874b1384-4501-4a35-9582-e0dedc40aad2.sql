CREATE TABLE public.command_rank_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_rank_id uuid,
  to_rank_id uuid,
  from_role app_role,
  to_role app_role,
  from_level text,
  to_level text,
  from_org_unit_id uuid,
  to_org_unit_id uuid,
  direction text NOT NULL DEFAULT 'lateral',
  reason text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.command_rank_changes TO authenticated;
GRANT ALL ON public.command_rank_changes TO service_role;

ALTER TABLE public.command_rank_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can read rank changes"
  ON public.command_rank_changes FOR SELECT TO authenticated
  USING (public.can_move_command(auth.uid()));

CREATE INDEX idx_command_rank_changes_profile ON public.command_rank_changes(profile_id, created_at DESC);
CREATE INDEX idx_command_rank_changes_created ON public.command_rank_changes(created_at DESC);

-- History must stay immutable, like command transfers.
CREATE OR REPLACE FUNCTION public.block_command_rank_change_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Rank change history is immutable';
END;
$$;

CREATE TRIGGER command_rank_changes_immutable
  BEFORE UPDATE OR DELETE ON public.command_rank_changes
  FOR EACH ROW EXECUTE FUNCTION public.block_command_rank_change_mutation();

-- Preview: what would a role be able to do at the level of a given command?
CREATE OR REPLACE FUNCTION public.directory_rights_for_role(_role app_role, _org_unit_id uuid)
RETURNS TABLE(level text, scope text, can_view boolean, can_create boolean, can_edit boolean,
              can_delete boolean, can_download boolean, can_print boolean, can_vault boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lvl text;
  _is_admin boolean := (_role = 'admin'::app_role);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.can_move_command(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to inspect directory rights';
  END IF;

  _lvl := public.directory_level_of_unit(_org_unit_id);

  IF _org_unit_id IS NULL OR _lvl IS NULL THEN
    RETURN QUERY SELECT NULL::text, CASE WHEN _is_admin THEN 'all' ELSE 'none' END,
      _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin, _is_admin;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT _lvl,
         CASE WHEN _is_admin THEN 'all' ELSE COALESCE(dp.scope, 'none') END,
         _is_admin OR COALESCE(dp.can_view, false),
         _is_admin OR COALESCE(dp.can_create, false),
         _is_admin OR COALESCE(dp.can_edit, false),
         _is_admin OR COALESCE(dp.can_delete, false),
         _is_admin OR COALESCE(dp.can_download, false),
         _is_admin OR COALESCE(dp.can_print, false),
         _is_admin OR COALESCE(dp.can_vault, false)
  FROM (SELECT 1) s
  LEFT JOIN public.directory_permissions dp ON dp.role = _role AND dp.level = _lvl;
END;
$$;

-- Promote / demote: rank + role (+ optional command move); rights follow the
-- new role and the level of the resulting command automatically.
CREATE OR REPLACE FUNCTION public.command_change_rank(
  _profile_ids uuid[],
  _to_rank_id uuid DEFAULT NULL,
  _to_role app_role DEFAULT NULL,
  _to_org_unit_id uuid DEFAULT NULL,
  _direction text DEFAULT 'lateral',
  _reason text DEFAULT NULL,
  _effective_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _p record;
  _from_role app_role;
  _to_unit uuid;
  _to_level text;
  _dir text := COALESCE(NULLIF(btrim(_direction), ''), 'lateral');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.can_move_command(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators, OIC, 2IC or staff officers can promote or demote officers';
  END IF;
  IF _profile_ids IS NULL OR array_length(_profile_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one officer';
  END IF;
  IF _to_rank_id IS NULL AND _to_role IS NULL AND _to_org_unit_id IS NULL THEN
    RAISE EXCEPTION 'Choose a new rank, role or command';
  END IF;
  IF _dir NOT IN ('promotion', 'demotion', 'lateral') THEN
    RAISE EXCEPTION 'Unknown change type';
  END IF;
  IF _to_role = 'admin'::app_role AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can grant the administrator role';
  END IF;
  IF _to_rank_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ranks r WHERE r.id = _to_rank_id) THEN
    RAISE EXCEPTION 'Unknown rank';
  END IF;
  IF _to_org_unit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.org_units u WHERE u.id = _to_org_unit_id) THEN
    RAISE EXCEPTION 'Unknown command';
  END IF;

  FOR _p IN
    SELECT p.id, p.user_id, p.rank_id, p.org_unit_id
    FROM public.profiles p
    WHERE p.id = ANY(_profile_ids)
  LOOP
    _to_unit := COALESCE(_to_org_unit_id, _p.org_unit_id);
    _to_level := public.directory_level_of_unit(_to_unit);

    SELECT ur.role INTO _from_role
    FROM public.user_roles ur
    WHERE ur.user_id = _p.user_id
    ORDER BY ur.role
    LIMIT 1;

    UPDATE public.profiles
       SET rank_id = COALESCE(_to_rank_id, rank_id),
           org_unit_id = _to_unit,
           updated_at = now()
     WHERE id = _p.id;

    IF _to_role IS NOT NULL AND _p.user_id IS NOT NULL THEN
      -- Replace the officer's role set with the new role, keeping the
      -- administrator role untouched unless an administrator made the change.
      DELETE FROM public.user_roles ur
       WHERE ur.user_id = _p.user_id
         AND (ur.role <> 'admin'::app_role OR public.has_role(auth.uid(), 'admin'::app_role));

      INSERT INTO public.user_roles (user_id, role)
      VALUES (_p.user_id, _to_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    INSERT INTO public.command_rank_changes (
      profile_id, from_rank_id, to_rank_id, from_role, to_role,
      from_level, to_level, from_org_unit_id, to_org_unit_id,
      direction, reason, effective_date, changed_by
    ) VALUES (
      _p.id, _p.rank_id, COALESCE(_to_rank_id, _p.rank_id), _from_role, COALESCE(_to_role, _from_role),
      public.directory_level_of_unit(_p.org_unit_id), _to_level, _p.org_unit_id, _to_unit,
      _dir, NULLIF(btrim(COALESCE(_reason, '')), ''), COALESCE(_effective_date, CURRENT_DATE), auth.uid()
    );

    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES ('UPDATE', 'command_rank_change', _p.id, auth.uid(),
      jsonb_build_object(
        'direction', _dir,
        'from_rank_id', _p.rank_id,
        'to_rank_id', COALESCE(_to_rank_id, _p.rank_id),
        'from_role', _from_role,
        'to_role', COALESCE(_to_role, _from_role),
        'from_org_unit_id', _p.org_unit_id,
        'to_org_unit_id', _to_unit,
        'to_level', _to_level,
        'reason', _reason
      ));

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.command_change_rank(uuid[], uuid, app_role, uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_change_rank(uuid[], uuid, app_role, uuid, text, text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.directory_rights_for_role(app_role, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_rights_for_role(app_role, uuid) TO authenticated;