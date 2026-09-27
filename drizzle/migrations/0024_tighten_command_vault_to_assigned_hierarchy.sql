CREATE OR REPLACE FUNCTION public.command_vault_can_access(_user_id uuid, _org_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _org_unit_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.org_positions op
      JOIN public.profiles hp ON hp.id = op.holder_profile_id
      WHERE hp.user_id = _user_id
        AND op.is_active
        AND op.position_level = 'regional_commander'::public.org_position_level
        AND op.org_unit_id IS NOT NULL
        AND _org_unit_id IN (SELECT public.org_unit_descendants(op.org_unit_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = _user_id
        AND p.org_unit_id IS NOT NULL
        AND _org_unit_id IN (SELECT public.org_unit_descendants(p.org_unit_id))
        AND (
          public.has_role(_user_id, 'oic'::public.app_role)
          OR public.has_role(_user_id, '2ic'::public.app_role)
          OR public.has_role(_user_id, 'command_officer'::public.app_role)
          OR (
            public.has_role(_user_id, 'staff_officer'::public.app_role)
            AND EXISTS (
              SELECT 1 FROM public.command_tier_grants g
              WHERE g.user_id = _user_id AND g.capability = 'command-vault'
                AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
            )
          )
        )
    )
  );
$$;