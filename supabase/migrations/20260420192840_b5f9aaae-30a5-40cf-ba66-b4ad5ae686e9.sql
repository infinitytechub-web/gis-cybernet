-- Extend Command Vault access to Staff Officer

-- Table: command_vault_files
DROP POLICY IF EXISTS "Command tier can view command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can upload to command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can update command vault" ON public.command_vault_files;
DROP POLICY IF EXISTS "Command tier can delete from command vault" ON public.command_vault_files;

CREATE POLICY "Command tier can view command vault"
ON public.command_vault_files FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'staff_officer'::app_role)
);

CREATE POLICY "Command tier can upload to command vault"
ON public.command_vault_files FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  )
);

CREATE POLICY "Command tier can update command vault"
ON public.command_vault_files FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'staff_officer'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'staff_officer'::app_role)
);

CREATE POLICY "Command tier can delete from command vault"
ON public.command_vault_files FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'oic'::app_role)
  OR has_role(auth.uid(), '2ic'::app_role)
  OR has_role(auth.uid(), 'staff_officer'::app_role)
);

-- Storage bucket policies for 'command-vault'
DROP POLICY IF EXISTS "Command tier can read command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can upload command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can update command vault files" ON storage.objects;
DROP POLICY IF EXISTS "Command tier can delete command vault files" ON storage.objects;

CREATE POLICY "Command tier can read command vault files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'command-vault'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  )
);

CREATE POLICY "Command tier can upload command vault files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'command-vault'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  )
);

CREATE POLICY "Command tier can update command vault files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'command-vault'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  )
);

CREATE POLICY "Command tier can delete command vault files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'command-vault'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'oic'::app_role)
    OR has_role(auth.uid(), '2ic'::app_role)
    OR has_role(auth.uid(), 'staff_officer'::app_role)
  )
);