-- Create the command vault table for admin/OIC/2IC-only files about staff
CREATE TABLE public.command_vault_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  related_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  file_type text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cvf_category ON public.command_vault_files(category);
CREATE INDEX idx_cvf_related_profile ON public.command_vault_files(related_profile_id);
CREATE INDEX idx_cvf_created_at ON public.command_vault_files(created_at DESC);

ALTER TABLE public.command_vault_files ENABLE ROW LEVEL SECURITY;

-- Only admin/OIC/2IC can read
CREATE POLICY "Command tier can view command vault"
ON public.command_vault_files FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
);

-- Only admin/OIC/2IC can insert
CREATE POLICY "Command tier can upload to command vault"
ON public.command_vault_files FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  )
);

-- Only admin/OIC/2IC can update
CREATE POLICY "Command tier can update command vault"
ON public.command_vault_files FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
);

-- Only admin/OIC/2IC can delete
CREATE POLICY "Command tier can delete from command vault"
ON public.command_vault_files FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'oic'::app_role)
  OR public.has_role(auth.uid(), '2ic'::app_role)
);

-- Auto-update updated_at
CREATE TRIGGER trg_cvf_updated_at
BEFORE UPDATE ON public.command_vault_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create the private storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('command-vault', 'command-vault', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — only admin/OIC/2IC can read/write/delete files in this bucket
CREATE POLICY "Command tier can read command vault files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'command-vault'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  )
);

CREATE POLICY "Command tier can upload command vault files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'command-vault'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  )
);

CREATE POLICY "Command tier can update command vault files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'command-vault'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  )
);

CREATE POLICY "Command tier can delete command vault files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'command-vault'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  )
);