-- 1. New command levels
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'directorate' BEFORE 'national';
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'command';
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'department';
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'section';
ALTER TYPE public.org_unit_type ADD VALUE IF NOT EXISTS 'control';

-- 2. Position level enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_position_level') THEN
    CREATE TYPE public.org_position_level AS ENUM (
      'directorate',
      'management_member',
      'regional_commander',
      'commandant',
      'commanding_officer',
      'sector_commander',
      'departmental_head',
      'sectional_head',
      'unit_head',
      'control_head'
    );
  END IF;
END $$;

-- 3. Positions register
CREATE TABLE IF NOT EXISTS public.org_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  position_level public.org_position_level NOT NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  holder_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_positions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_positions TO authenticated;
GRANT ALL ON public.org_positions TO service_role;

ALTER TABLE public.org_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view positions in reach" ON public.org_positions;
CREATE POLICY "Authenticated can view positions in reach"
ON public.org_positions FOR SELECT TO authenticated
USING (org_unit_id IS NULL OR public.can_see_org_unit(auth.uid(), org_unit_id));

DROP POLICY IF EXISTS "Admins manage positions" ON public.org_positions;
CREATE POLICY "Admins manage positions"
ON public.org_positions FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
);

DROP TRIGGER IF EXISTS update_org_positions_updated_at ON public.org_positions;
CREATE TRIGGER update_org_positions_updated_at
BEFORE UPDATE ON public.org_positions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS audit_org_positions ON public.org_positions;
CREATE TRIGGER audit_org_positions
AFTER INSERT OR UPDATE OR DELETE ON public.org_positions
FOR EACH ROW EXECUTE FUNCTION public.audit_record_changes();

CREATE INDEX IF NOT EXISTS org_positions_unit_idx ON public.org_positions(org_unit_id);
CREATE INDEX IF NOT EXISTS org_positions_holder_idx ON public.org_positions(holder_profile_id);
