ALTER TABLE public.announcement_files
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcement_files_target_user
  ON public.announcement_files(target_user_id)
  WHERE target_user_id IS NOT NULL;

DROP POLICY IF EXISTS "Staff view targeted shared files" ON public.announcement_files;

CREATE POLICY "Staff view targeted shared files"
  ON public.announcement_files
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      is_command_tier(auth.uid())
      OR (target_user_id IS NOT NULL AND target_user_id = auth.uid())
      OR (target_user_id IS NULL AND department_id IS NULL)
      OR (target_user_id IS NULL AND department_id = get_user_department_id(auth.uid()))
    )
  );