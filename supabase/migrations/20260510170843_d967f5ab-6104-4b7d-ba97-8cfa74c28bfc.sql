-- Announcement file sharing
CREATE TABLE public.announcement_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT,
  sha256 TEXT,
  scan_action TEXT,
  uploaded_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcement_files_dept ON public.announcement_files(department_id);
CREATE INDEX idx_announcement_files_active ON public.announcement_files(is_active, created_at DESC);

ALTER TABLE public.announcement_files ENABLE ROW LEVEL SECURITY;

-- Staff: view files targeted to all (NULL) or their department
CREATE POLICY "Staff view targeted shared files"
ON public.announcement_files FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    department_id IS NULL
    OR department_id = public.get_user_department_id(auth.uid())
    OR public.is_command_tier(auth.uid())
  )
);

-- Command tier: full management
CREATE POLICY "Command tier manage shared files"
ON public.announcement_files FOR ALL
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (public.is_command_tier(auth.uid()));

-- updated_at trigger (reuse existing helper)
CREATE TRIGGER update_announcement_files_updated_at
BEFORE UPDATE ON public.announcement_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: increment download counter (any authenticated user who can SELECT the row)
CREATE OR REPLACE FUNCTION public.increment_announcement_file_downloads(_file_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- enforce visibility: only allow increment if caller can see the row
  IF NOT EXISTS (
    SELECT 1 FROM public.announcement_files
    WHERE id = _file_id
      AND is_active = true
      AND (
        department_id IS NULL
        OR department_id = public.get_user_department_id(auth.uid())
        OR public.is_command_tier(auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'File not accessible';
  END IF;

  UPDATE public.announcement_files
  SET download_count = download_count + 1
  WHERE id = _file_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_announcement_file_downloads(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_announcement_file_downloads(UUID) TO authenticated;