-- Allow staff to update their own profile rows.
-- The existing restrict_profile_updates trigger continues to block changes to
-- rank, status, staff_id, shift_group, unit, account_locked, login_enabled,
-- and department for non-admins, so editable fields are limited to:
-- first_name, last_name, gender, phone, photo_url, ghana_card_number, email,
-- blood_group, office, intake, weapon_trained, weapon_training_date,
-- training_designation, staff_category, date_of_birth.

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for profile changes so self-edits propagate to other open
-- views (staff directory, dashboards, etc.) instantly.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END$$;