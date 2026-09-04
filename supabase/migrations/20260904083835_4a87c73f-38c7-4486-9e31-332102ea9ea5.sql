-- 1. M&E scores: restrict reads to M&E/command roles
DROP POLICY IF EXISTS me_scores_read ON public.me_scores;
CREATE POLICY me_scores_read ON public.me_scores
  FOR SELECT TO authenticated
  USING (public.me_can_manage());

-- 2. M&E settings: restrict reads to M&E/command roles
DROP POLICY IF EXISTS me_settings_read ON public.me_settings;
CREATE POLICY me_settings_read ON public.me_settings
  FOR SELECT TO authenticated
  USING (public.me_can_manage());

-- 3. Shift rotation config: table reads limited to command tier; staff read a safe RPC
DROP POLICY IF EXISTS "Authenticated can read rotation config" ON public.shift_rotation_config;
CREATE POLICY "Command tier can read rotation config" ON public.shift_rotation_config
  FOR SELECT TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE OR REPLACE FUNCTION public.shift_rotation_public_config()
RETURNS TABLE (anchor_date date, pattern text[], updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.anchor_date, c.pattern, c.updated_at
  FROM public.shift_rotation_config c
  WHERE auth.uid() IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.shift_rotation_public_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_rotation_public_config() TO authenticated, service_role;

-- 4. Shift rotation overrides: table reads limited to command tier; staff read a notes-free RPC
DROP POLICY IF EXISTS "Authenticated can read rotation overrides" ON public.shift_rotation_overrides;
CREATE POLICY "Command tier can read rotation overrides" ON public.shift_rotation_overrides
  FOR SELECT TO authenticated
  USING (public.is_command_tier(auth.uid()));

CREATE OR REPLACE FUNCTION public.shift_rotation_public_overrides()
RETURNS TABLE (
  id uuid,
  scope_type text,
  scope_value text,
  anchor_date date,
  pattern text[],
  enabled boolean,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.scope_type::text, o.scope_value::text, o.anchor_date, o.pattern, o.enabled, o.updated_at
  FROM public.shift_rotation_overrides o
  WHERE auth.uid() IS NOT NULL
    AND o.enabled
  ORDER BY o.scope_type;
$$;
REVOKE ALL ON FUNCTION public.shift_rotation_public_overrides() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_rotation_public_overrides() TO authenticated, service_role;