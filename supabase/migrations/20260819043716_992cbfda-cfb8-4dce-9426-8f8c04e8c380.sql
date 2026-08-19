CREATE TABLE public.patrol_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_reference text NOT NULL DEFAULT '',
  title text NOT NULL,
  objective text,
  planned_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time time without time zone NOT NULL DEFAULT '08:00',
  end_time time without time zone,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  district_name text,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  patrol_type text NOT NULL DEFAULT 'routine',
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by uuid,
  assigned_at timestamp with time zone,
  personnel_count integer NOT NULL DEFAULT 0,
  route_summary text,
  status text NOT NULL DEFAULT 'draft',
  outcome text,
  closure_notes text,
  closed_by uuid,
  closed_at timestamp with time zone,
  patrol_log_id uuid REFERENCES public.patrol_logs(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patrol_plans_status_chk CHECK (status IN ('draft','assigned','active','completed','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patrol_plans TO authenticated;
GRANT ALL ON public.patrol_plans TO service_role;

ALTER TABLE public.patrol_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patrol plans visible within own unit branch"
ON public.patrol_plans FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR assigned_to IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR (org_unit_id IS NOT NULL AND can_view_org_unit(auth.uid(), org_unit_id))
  OR (org_unit_id IS NULL AND is_command_tier(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Staff create patrol plans for reachable units"
ON public.patrol_plans FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (org_unit_id IS NULL OR can_view_org_unit(auth.uid(), org_unit_id))
);

CREATE POLICY "Authors edit open plans, command tier assigns and closes"
ON public.patrol_plans FOR UPDATE TO authenticated
USING (
  (created_by = auth.uid() AND status IN ('draft','assigned','active'))
  OR (is_command_tier(auth.uid()) AND (org_unit_id IS NULL OR org_unit_id IN (SELECT command_reach_units(auth.uid()))))
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (created_by = auth.uid() AND status IN ('draft','assigned','active','completed','cancelled'))
  OR (is_command_tier(auth.uid()) AND (org_unit_id IS NULL OR org_unit_id IN (SELECT command_reach_units(auth.uid()))))
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authors remove draft plans, admins remove any plan"
ON public.patrol_plans FOR DELETE TO authenticated
USING (
  (created_by = auth.uid() AND status = 'draft')
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE INDEX idx_patrol_plans_date ON public.patrol_plans(planned_date DESC);
CREATE INDEX idx_patrol_plans_unit ON public.patrol_plans(org_unit_id);
CREATE INDEX idx_patrol_plans_vehicle ON public.patrol_plans(vehicle_id);
CREATE INDEX idx_patrol_plans_status ON public.patrol_plans(status);

CREATE OR REPLACE FUNCTION public.generate_patrol_plan_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq integer;
BEGIN
  IF NEW.plan_reference IS NULL OR NEW.plan_reference = '' THEN
    SELECT COUNT(*) + 1 INTO seq FROM public.patrol_plans WHERE planned_date = NEW.planned_date;
    NEW.plan_reference := 'PLN-' || to_char(NEW.planned_date, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
  END IF;
  IF NEW.district_id IS NOT NULL AND (NEW.district_name IS NULL OR NEW.district_name = '') THEN
    SELECT name INTO NEW.district_name FROM public.ghana_districts WHERE id = NEW.district_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_patrol_plans_reference
BEFORE INSERT ON public.patrol_plans
FOR EACH ROW EXECUTE FUNCTION public.generate_patrol_plan_reference();

CREATE TRIGGER trg_patrol_plans_updated_at
BEFORE UPDATE ON public.patrol_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();