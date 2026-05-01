-- 1. Add warning seconds column to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS auto_logout_warning_seconds integer NOT NULL DEFAULT 30
    CHECK (auto_logout_warning_seconds BETWEEN 5 AND 300);

-- Tighten existing auto_logout_minutes range (1..480) without dropping data
DO $$ BEGIN
  ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_auto_logout_minutes_check
    CHECK (auto_logout_minutes BETWEEN 1 AND 480);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Account unlock audit table
CREATE TABLE IF NOT EXISTS public.account_unlock_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_staff_id text,
  target_full_name text,
  unlocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  unlocked_by_name text,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_unlock_audit_created
  ON public.account_unlock_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_unlock_audit_target
  ON public.account_unlock_audit (target_profile_id);

ALTER TABLE public.account_unlock_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view unlock audit" ON public.account_unlock_audit;
CREATE POLICY "Admins view unlock audit"
  ON public.account_unlock_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No insert/update/delete policies → only SECURITY DEFINER fn can write.

-- 3. Admin unlock RPC
CREATE OR REPLACE FUNCTION public.admin_unlock_account(
  _profile_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_target record;
  v_prev jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can unlock accounts' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT id, staff_id, first_name, last_name, account_locked, login_enabled
    INTO v_target
    FROM public.profiles
   WHERE id = _profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '02000';
  END IF;

  v_prev := jsonb_build_object(
    'account_locked', v_target.account_locked,
    'login_enabled', v_target.login_enabled
  );

  -- Clear failed login attempts (best effort — table may not exist on fresh installs)
  BEGIN
    DELETE FROM public.failed_login_attempts WHERE staff_id = v_target.staff_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Re-enable account
  UPDATE public.profiles
     SET account_locked = false,
         login_enabled = true
   WHERE id = _profile_id;

  -- Resolve actor name for audit
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO v_actor_name
    FROM public.profiles
   WHERE user_id = v_actor
   LIMIT 1;

  INSERT INTO public.account_unlock_audit
    (target_profile_id, target_staff_id, target_full_name,
     unlocked_by, unlocked_by_name, reason, previous_state)
  VALUES
    (_profile_id, v_target.staff_id,
     trim(coalesce(v_target.first_name,'') || ' ' || coalesce(v_target.last_name,'')),
     v_actor, nullif(v_actor_name,''), btrim(_reason), v_prev);

  INSERT INTO public.system_audit_log
    (action, entity_type, entity_id, performed_by, details)
  VALUES
    ('account_unlocked', 'profile', _profile_id, v_actor,
     jsonb_build_object(
       'staff_id', v_target.staff_id,
       'reason', btrim(_reason),
       'previous_state', v_prev
     ));

  RETURN jsonb_build_object('success', true, 'profile_id', _profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unlock_account(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_account(uuid, text) TO authenticated;