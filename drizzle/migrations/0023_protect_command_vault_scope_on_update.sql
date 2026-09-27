CREATE OR REPLACE FUNCTION public.protect_command_vault_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'Command, storage path and uploader cannot be changed';
  END IF;
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    NEW.archived_by := auth.uid();
    IF nullif(btrim(coalesce(NEW.archive_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Archive reason is required';
    END IF;
  ELSIF NEW.archived_at IS NULL AND OLD.archived_at IS NOT NULL THEN
    NEW.archived_by := NULL;
    NEW.archive_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_command_vault_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER command_vault_scope_guard BEFORE UPDATE ON public.command_vault_files
FOR EACH ROW EXECUTE FUNCTION public.protect_command_vault_scope();

DROP POLICY IF EXISTS "Authorized command members update vault" ON public.command_vault_files;
CREATE POLICY "Authorized command members update vault"
ON public.command_vault_files FOR UPDATE TO authenticated
USING (public.command_vault_can_access(auth.uid(), org_unit_id))
WITH CHECK (public.command_vault_can_access(auth.uid(), org_unit_id));