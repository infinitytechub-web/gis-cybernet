CREATE OR REPLACE FUNCTION public.can_see_org_unit(_user_id uuid, _org_unit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  home uuid;
BEGIN
  IF _user_id IS NULL OR _org_unit_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.can_view_org_unit(_user_id, _org_unit_id) THEN
    RETURN true;
  END IF;

  -- Allow the ancestor chain above the user's own posting so the hierarchy
  -- path renders correctly (names only, no sibling branches).
  SELECT org_unit_id INTO home FROM public.profiles WHERE user_id = _user_id;
  IF home IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.org_unit_ancestors(home) a WHERE a = _org_unit_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.can_see_org_unit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_org_unit(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can view org units" ON public.org_units;

CREATE POLICY "Org units visible within user scope"
ON public.org_units
FOR SELECT
TO authenticated
USING (public.can_see_org_unit(auth.uid(), id));