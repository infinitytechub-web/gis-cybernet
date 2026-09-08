CREATE TABLE IF NOT EXISTS public.command_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  to_org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  from_level text,
  to_level text,
  from_shift_group text,
  to_shift_group text,
  reason text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  moved_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.command_transfers TO authenticated;
GRANT ALL ON public.command_transfers TO service_role;

ALTER TABLE public.command_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Command tier can read command transfers" ON public.command_transfers;
CREATE POLICY "Command tier can read command transfers"
ON public.command_transfers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
  OR public.has_role(auth.uid(), 'staff_officer'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = command_transfers.profile_id AND p.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS command_transfers_profile_idx
  ON public.command_transfers(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS command_transfers_created_idx
  ON public.command_transfers(created_at DESC);

-- Immutable history: no client-side writes at all (the RPC below is definer).
CREATE OR REPLACE FUNCTION public.block_command_transfer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'Command transfer history is immutable';
END;
$fn$;

DROP TRIGGER IF EXISTS block_command_transfer_mutation_trg ON public.command_transfers;
CREATE TRIGGER block_command_transfer_mutation_trg
BEFORE UPDATE OR DELETE ON public.command_transfers
FOR EACH ROW EXECUTE FUNCTION public.block_command_transfer_mutation();

-- Who may post officers between commands.
CREATE OR REPLACE FUNCTION public.can_move_command(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'oic'::app_role)
      OR public.has_role(_user_id, '2ic'::app_role)
      OR public.has_role(_user_id, 'staff_officer'::app_role);
$fn$;

REVOKE ALL ON FUNCTION public.can_move_command(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_move_command(uuid) TO authenticated;

-- Rights an officer would hold once posted to a given command. NULL unit =>
-- unassigned, which yields no rights at all (default deny).
CREATE OR REPLACE FUNCTION public.directory_rights_at_unit(_profile_id uuid, _org_unit_id uuid)
RETURNS TABLE(
  level text, scope text, assigned boolean,
  can_view boolean, can_create boolean, can_edit boolean, can_delete boolean,
  can_download boolean, can_print boolean, can_vault boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid;
  _lvl text;
  _is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.can_move_command(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to inspect directory rights';
  END IF;

  SELECT p.user_id INTO _uid FROM public.profiles p WHERE p.id = _profile_id;
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
$fn$;

REVOKE ALL ON FUNCTION public.directory_rights_at_unit(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.directory_rights_at_unit(uuid, uuid) TO authenticated;

-- Move officers between commands, recording history + audit trail.
CREATE OR REPLACE FUNCTION public.command_move_officers(
  _profile_ids uuid[],
  _to_org_unit_id uuid,
  _shift_group text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _effective_date date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _count integer := 0;
  _p record;
  _to_level text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.can_move_command(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators, OIC, 2IC or staff officers can move officers between commands';
  END IF;
  IF _profile_ids IS NULL OR array_length(_profile_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one officer';
  END IF;
  IF _to_org_unit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.org_units u WHERE u.id = _to_org_unit_id) THEN
    RAISE EXCEPTION 'Unknown command';
  END IF;

  _to_level := public.directory_level_of_unit(_to_org_unit_id);

  FOR _p IN
    SELECT p.id, p.org_unit_id, p.shift_group
    FROM public.profiles p
    WHERE p.id = ANY(_profile_ids)
  LOOP
    IF _p.org_unit_id IS NOT DISTINCT FROM _to_org_unit_id
       AND (_shift_group IS NULL OR _p.shift_group IS NOT DISTINCT FROM _shift_group) THEN
      CONTINUE;
    END IF;

    UPDATE public.profiles
       SET org_unit_id = _to_org_unit_id,
           shift_group = COALESCE(_shift_group, shift_group),
           updated_at = now()
     WHERE id = _p.id;

    INSERT INTO public.command_transfers (
      profile_id, from_org_unit_id, to_org_unit_id, from_level, to_level,
      from_shift_group, to_shift_group, reason, effective_date, moved_by
    ) VALUES (
      _p.id, _p.org_unit_id, _to_org_unit_id,
      public.directory_level_of_unit(_p.org_unit_id), _to_level,
      _p.shift_group, COALESCE(_shift_group, _p.shift_group),
      NULLIF(btrim(COALESCE(_reason, '')), ''), COALESCE(_effective_date, CURRENT_DATE), auth.uid()
    );

    INSERT INTO public.system_audit_log (action, entity_type, entity_id, performed_by, details)
    VALUES ('UPDATE', 'command_transfer', _p.id, auth.uid(),
      jsonb_build_object(
        'from_org_unit_id', _p.org_unit_id,
        'to_org_unit_id', _to_org_unit_id,
        'to_level', _to_level,
        'shift_group', COALESCE(_shift_group, _p.shift_group),
        'reason', _reason
      ));

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.command_move_officers(uuid[], uuid, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.command_move_officers(uuid[], uuid, text, text, date) TO authenticated;