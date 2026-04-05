
-- 1. Fix the profile UPDATE policy to add WITH CHECK
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Create a trigger function to block sensitive field changes by non-admins
CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Admins can change anything
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Block non-admins from changing sensitive fields
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    RAISE EXCEPTION 'Only admins can change department';
  END IF;
  IF NEW.rank_id IS DISTINCT FROM OLD.rank_id THEN
    RAISE EXCEPTION 'Only admins can change rank';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only admins can change status';
  END IF;
  IF NEW.account_locked IS DISTINCT FROM OLD.account_locked THEN
    RAISE EXCEPTION 'Only admins can change account_locked';
  END IF;
  IF NEW.login_enabled IS DISTINCT FROM OLD.login_enabled THEN
    RAISE EXCEPTION 'Only admins can change login_enabled';
  END IF;
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Only admins can change staff_id';
  END IF;
  IF NEW.shift_group IS DISTINCT FROM OLD.shift_group THEN
    RAISE EXCEPTION 'Only admins can change shift_group';
  END IF;
  IF NEW.unit IS DISTINCT FROM OLD.unit THEN
    RAISE EXCEPTION 'Only admins can change unit';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS enforce_profile_field_restrictions ON public.profiles;
CREATE TRIGGER enforce_profile_field_restrictions
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_profile_updates();
