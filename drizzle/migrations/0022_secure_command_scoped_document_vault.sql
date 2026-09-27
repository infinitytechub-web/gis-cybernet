ALTER TABLE public.command_vault_files
  ADD COLUMN IF NOT EXISTS org_unit_id uuid REFERENCES public.org_units(id),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

UPDATE public.command_vault_files cv
SET org_unit_id = COALESCE(
  (SELECT rp.org_unit_id FROM public.profiles rp WHERE rp.id = cv.related_profile_id),
  (SELECT up.org_unit_id FROM public.profiles up WHERE up.user_id = cv.uploaded_by LIMIT 1)
)
WHERE cv.org_unit_id IS NULL;

ALTER TABLE public.command_vault_files
  ALTER COLUMN org_unit_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_command_vault_files_org_unit
  ON public.command_vault_files(org_unit_id, archived_at, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.command_vault_files TO authenticated;
GRANT ALL ON public.command_vault_files TO service_role;
REVOKE DELETE ON public.command_vault_files FROM authenticated;

CREATE OR REPLACE FUNCTION public.command_vault_can_access(_user_id uuid, _org_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _org_unit_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR (
      public.can_view_org_unit(_user_id, _org_unit_id)
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
        OR EXISTS (
          SELECT 1 FROM public.org_positions op
          JOIN public.profiles hp ON hp.id = op.holder_profile_id
          WHERE hp.user_id = _user_id AND op.is_active
            AND op.position_level = 'regional_commander'::public.org_position_level
            AND op.org_unit_id IS NOT NULL
            AND _org_unit_id IN (SELECT public.org_unit_descendants(op.org_unit_id))
        )
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.command_vault_can_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_vault_can_access(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Command tier can view command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can upload to command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can update command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can delete from command vault" ON public.command_vault_files;

CREATE POLICY "Authorized command members view vault" ON public.command_vault_files FOR SELECT TO authenticated
USING (public.command_vault_can_access(auth.uid(), org_unit_id));
CREATE POLICY "Authorized command members upload to vault" ON public.command_vault_files FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.command_vault_can_access(auth.uid(), org_unit_id) AND split_part(file_path, '/', 1) = org_unit_id::text);
CREATE POLICY "Authorized command members update vault" ON public.command_vault_files FOR UPDATE TO authenticated
USING (public.command_vault_can_access(auth.uid(), org_unit_id))
WITH CHECK (public.command_vault_can_access(auth.uid(), org_unit_id) AND split_part(file_path, '/', 1) = org_unit_id::text);

CREATE TABLE public.command_vault_file_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid REFERENCES public.command_vault_files(id) ON DELETE SET NULL,
  org_unit_id uuid NOT NULL REFERENCES public.org_units(id),
  actor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('upload','preview','download','modify','archive','restore')),
  file_title text NOT NULL,
  file_name text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.command_vault_file_audit TO authenticated;
GRANT ALL ON public.command_vault_file_audit TO service_role;
ALTER TABLE public.command_vault_file_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_command_vault_audit_scope ON public.command_vault_file_audit(org_unit_id, created_at DESC);
CREATE INDEX idx_command_vault_audit_file ON public.command_vault_file_audit(file_id, created_at DESC);
CREATE POLICY "Authorized command members view vault audit" ON public.command_vault_file_audit FOR SELECT TO authenticated
USING (public.command_vault_can_access(auth.uid(), org_unit_id));

CREATE OR REPLACE FUNCTION public.block_command_vault_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Command Vault audit records are immutable'; END;
$$;
REVOKE ALL ON FUNCTION public.block_command_vault_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER command_vault_file_audit_immutable BEFORE UPDATE OR DELETE ON public.command_vault_file_audit
FOR EACH ROW EXECUTE FUNCTION public.block_command_vault_audit_mutation();

CREATE OR REPLACE FUNCTION public.audit_command_vault_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'upload';
  ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN v_action := 'archive';
  ELSIF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN v_action := 'restore';
  ELSE v_action := 'modify'; END IF;
  INSERT INTO public.command_vault_file_audit(file_id, org_unit_id, actor_user_id, action, file_title, file_name, detail)
  VALUES (NEW.id, NEW.org_unit_id, auth.uid(), v_action, NEW.title, NEW.file_name, CASE WHEN v_action = 'archive' THEN NEW.archive_reason ELSE NULL END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_command_vault_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER command_vault_file_change_audit AFTER INSERT OR UPDATE ON public.command_vault_files
FOR EACH ROW EXECUTE FUNCTION public.audit_command_vault_change();

CREATE OR REPLACE FUNCTION public.record_command_vault_access(_file_id uuid, _action text, _detail text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_file public.command_vault_files%ROWTYPE; v_action text := lower(btrim(coalesce(_action, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_action NOT IN ('preview', 'download') THEN RAISE EXCEPTION 'Invalid vault access action'; END IF;
  SELECT * INTO v_file FROM public.command_vault_files WHERE id = _file_id;
  IF v_file.id IS NULL OR NOT public.command_vault_can_access(auth.uid(), v_file.org_unit_id) THEN RAISE EXCEPTION 'Not authorized to access this command document'; END IF;
  IF v_file.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived documents cannot be opened'; END IF;
  INSERT INTO public.command_vault_file_audit(file_id, org_unit_id, actor_user_id, action, file_title, file_name, detail)
  VALUES (v_file.id, v_file.org_unit_id, auth.uid(), v_action, v_file.title, v_file.file_name, left(nullif(btrim(coalesce(_detail, '')), ''), 500));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_command_vault_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_command_vault_access(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Command tier can read command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can upload command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can update command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can delete command vault files" ON storage.objects;
CREATE POLICY "Command scoped vault file reads" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'command-vault' AND EXISTS (SELECT 1 FROM public.command_vault_files cv WHERE cv.file_path = name AND cv.archived_at IS NULL AND public.command_vault_can_access(auth.uid(), cv.org_unit_id)));
CREATE POLICY "Command scoped vault file uploads" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'command-vault' AND public.command_vault_can_access(auth.uid(), (storage.foldername(name))[1]::uuid));
CREATE POLICY "Command scoped vault file updates" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'command-vault' AND EXISTS (SELECT 1 FROM public.command_vault_files cv WHERE cv.file_path = name AND cv.archived_at IS NULL AND public.command_vault_can_access(auth.uid(), cv.org_unit_id)))
WITH CHECK (bucket_id = 'command-vault' AND public.command_vault_can_access(auth.uid(), (storage.foldername(name))[1]::uuid));

COMMENT ON TABLE public.command_vault_file_audit IS 'Immutable command-scoped audit trail for document uploads, previews, downloads, metadata changes, archives, and restores.';