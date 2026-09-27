CREATE OR REPLACE FUNCTION public.list_authorized_command_vault_units()
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ou.id, ou.name, ou.type::text
  FROM public.org_units ou
  WHERE ou.is_active
    AND public.command_vault_can_access(auth.uid(), ou.id)
  ORDER BY ou.name;
$$;
REVOKE ALL ON FUNCTION public.list_authorized_command_vault_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_authorized_command_vault_units() TO authenticated;