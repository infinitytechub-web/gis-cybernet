
-- ============================================================
-- Helper: is_command_tier (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_command_tier(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','oic','2ic','staff_officer','supervisor')
  )
$$;

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.shift_rotation_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shift_rotation_scope AS ENUM ('org','department','role','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- shift_rotation_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_rotation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  anchor_date date NOT NULL,
  pattern text[] NOT NULL,
  cycle_length integer GENERATED ALWAYS AS (cardinality(pattern)) STORED,
  timezone text NOT NULL DEFAULT 'Africa/Accra',
  status public.shift_rotation_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  parent_schedule_id uuid REFERENCES public.shift_rotation_schedules(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srs_status ON public.shift_rotation_schedules(status);
CREATE INDEX IF NOT EXISTS idx_srs_parent ON public.shift_rotation_schedules(parent_schedule_id);

ALTER TABLE public.shift_rotation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier full access on schedules"
  ON public.shift_rotation_schedules FOR ALL
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()));

CREATE POLICY "Authenticated can view published schedules"
  ON public.shift_rotation_schedules FOR SELECT
  USING (auth.uid() IS NOT NULL AND status = 'published');

-- ============================================================
-- shift_rotation_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_rotation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.shift_rotation_schedules(id) ON DELETE CASCADE,
  scope_type public.shift_rotation_scope NOT NULL,
  scope_value text,
  start_date date NOT NULL,
  end_date date,
  priority integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sra_schedule ON public.shift_rotation_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sra_scope ON public.shift_rotation_assignments(scope_type, scope_value);
CREATE INDEX IF NOT EXISTS idx_sra_dates ON public.shift_rotation_assignments(start_date, end_date);

ALTER TABLE public.shift_rotation_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier full access on assignments"
  ON public.shift_rotation_assignments FOR ALL
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()));

CREATE POLICY "Authenticated can view published assignments"
  ON public.shift_rotation_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.shift_rotation_schedules s
      WHERE s.id = schedule_id AND s.status = 'published'
    )
  );

-- ============================================================
-- shift_rotation_individual_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_rotation_individual_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  override_date date NOT NULL,
  group_letter text NOT NULL,
  reason text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_srio_profile_date
  ON public.shift_rotation_individual_overrides(profile_id, override_date);

ALTER TABLE public.shift_rotation_individual_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier full access on individual overrides"
  ON public.shift_rotation_individual_overrides FOR ALL
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()));

CREATE POLICY "Staff can view their own overrides"
  ON public.shift_rotation_individual_overrides FOR SELECT
  USING (auth.uid() = profile_id);

-- ============================================================
-- shift_rotation_deploy_audit (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_rotation_deploy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.shift_rotation_schedules(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srda_schedule ON public.shift_rotation_deploy_audit(schedule_id);
CREATE INDEX IF NOT EXISTS idx_srda_created ON public.shift_rotation_deploy_audit(created_at DESC);

ALTER TABLE public.shift_rotation_deploy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Command tier can read audit"
  ON public.shift_rotation_deploy_audit FOR SELECT
  USING (public.is_command_tier(auth.uid()));

CREATE POLICY "Command tier can insert audit"
  ON public.shift_rotation_deploy_audit FOR INSERT
  WITH CHECK (public.is_command_tier(auth.uid()) AND auth.uid() = actor_id);

-- (no UPDATE / DELETE policies = immutable)

-- ============================================================
-- shift_rotation_exclusions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shift_rotation_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_rotation_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read exclusions"
  ON public.shift_rotation_exclusions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Command tier manages exclusions"
  ON public.shift_rotation_exclusions FOR ALL
  USING (public.is_command_tier(auth.uid()))
  WITH CHECK (public.is_command_tier(auth.uid()));

INSERT INTO public.shift_rotation_exclusions (role, reason) VALUES
  ('admin','Command tier — exempt from auto-deploy'),
  ('oic','Command tier — exempt from auto-deploy'),
  ('2ic','Command tier — exempt from auto-deploy'),
  ('staff_officer','Command tier — exempt from auto-deploy'),
  ('supervisor','Command tier — exempt from auto-deploy')
ON CONFLICT (role) DO NOTHING;

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_srs_updated_at
  BEFORE UPDATE ON public.shift_rotation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_sra_updated_at
  BEFORE UPDATE ON public.shift_rotation_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_srio_updated_at
  BEFORE UPDATE ON public.shift_rotation_individual_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Block edits to published schedules (force new version)
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_published_rotation_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow status transition to 'archived' from 'published'.
  IF OLD.status = 'published'
     AND NEW.status = 'published'
     AND (OLD.anchor_date IS DISTINCT FROM NEW.anchor_date
          OR OLD.pattern IS DISTINCT FROM NEW.pattern
          OR OLD.timezone IS DISTINCT FROM NEW.timezone) THEN
    RAISE EXCEPTION 'Published rotation schedules cannot be edited. Create a new version instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_srs_protect_published
  BEFORE UPDATE ON public.shift_rotation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_rotation_schedule();

-- ============================================================
-- Auto-bump version + stamp publisher on publish
-- ============================================================
CREATE OR REPLACE FUNCTION public.stamp_rotation_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') THEN
    NEW.published_at := now();
    NEW.published_by := COALESCE(NEW.published_by, auth.uid());

    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM public.shift_rotation_schedules
    WHERE name = NEW.name AND status = 'published';

    NEW.version := GREATEST(NEW.version, next_version);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_srs_stamp_publish
  BEFORE UPDATE ON public.shift_rotation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.stamp_rotation_publish();

-- ============================================================
-- Conflict detection helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_rotation_conflicts(
  _scope_type public.shift_rotation_scope,
  _scope_value text,
  _start_date date,
  _end_date date,
  _exclude_assignment_id uuid DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  schedule_id uuid,
  schedule_name text,
  start_date date,
  end_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.schedule_id, s.name, a.start_date, a.end_date
  FROM public.shift_rotation_assignments a
  JOIN public.shift_rotation_schedules s ON s.id = a.schedule_id
  WHERE s.status = 'published'
    AND a.scope_type = _scope_type
    AND COALESCE(a.scope_value,'') = COALESCE(_scope_value,'')
    AND (_exclude_assignment_id IS NULL OR a.id <> _exclude_assignment_id)
    AND a.start_date <= COALESCE(_end_date, 'infinity'::date)
    AND COALESCE(a.end_date, 'infinity'::date) >= _start_date;
$$;
