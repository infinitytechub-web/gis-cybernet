-- ============================================================
-- M&E PLATFORM — FOUNDATION
-- ============================================================

-- ---------- helper functions ----------
CREATE OR REPLACE FUNCTION public.me_classification_rank(_c text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(_c,'internal'))
    WHEN 'public' THEN 1 WHEN 'internal' THEN 2 WHEN 'confidential' THEN 3
    WHEN 'restricted' THEN 4 WHEN 'highly_restricted' THEN 5 ELSE 2 END
$$;

CREATE OR REPLACE FUNCTION public.me_user_clearance(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id,'admin') OR public.has_role(_user_id,'oic')
      OR public.has_role(_user_id,'2ic') THEN 5
    WHEN public.has_role(_user_id,'me_officer') OR public.has_role(_user_id,'staff_officer')
      OR public.has_role(_user_id,'command_officer') OR public.has_role(_user_id,'chief_staff_officer')
      OR public.has_role(_user_id,'head_of_administration') THEN 4
    WHEN public.has_role(_user_id,'supervisor') OR public.has_role(_user_id,'project_manager')
      OR public.has_role(_user_id,'shift_supervisor') OR public.has_role(_user_id,'ipse_supervisor')
      OR public.has_role(_user_id,'head_of_processing') THEN 3
    ELSE 2 END
$$;

REVOKE ALL ON FUNCTION public.me_user_clearance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_user_clearance(uuid) TO authenticated, service_role;

-- Can the caller read a record with this classification / org unit?
CREATE OR REPLACE FUNCTION public.me_can_view(_classification text, _org_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.me_user_clearance(auth.uid()) >= public.me_classification_rank(_classification)
     AND (_org_unit_id IS NULL
          OR public.has_role(auth.uid(),'admin')
          OR public.can_see_org_unit(auth.uid(), _org_unit_id))
$$;

REVOKE ALL ON FUNCTION public.me_can_view(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_can_view(text, uuid) TO authenticated, service_role;

-- Can the caller create/edit M&E records?
CREATE OR REPLACE FUNCTION public.me_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'staff_officer')
    OR public.has_role(auth.uid(),'command_officer') OR public.has_role(auth.uid(),'chief_staff_officer')
    OR public.has_role(auth.uid(),'head_of_administration') OR public.has_role(auth.uid(),'supervisor')
    OR public.has_role(auth.uid(),'project_manager') OR public.has_role(auth.uid(),'me_officer')
  )
$$;

REVOKE ALL ON FUNCTION public.me_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_can_manage() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.me_can_verify()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic')
    OR public.has_role(auth.uid(),'2ic') OR public.has_role(auth.uid(),'me_officer')
    OR public.has_role(auth.uid(),'staff_officer')
  )
$$;

REVOKE ALL ON FUNCTION public.me_can_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_can_verify() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.me_can_delete()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'oic') OR public.has_role(auth.uid(),'2ic')
  )
$$;

REVOKE ALL ON FUNCTION public.me_can_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_can_delete() TO authenticated, service_role;

-- ---------- settings ----------
CREATE TABLE public.me_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  version int NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.me_settings TO authenticated;
GRANT ALL ON public.me_settings TO service_role;
ALTER TABLE public.me_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_settings_read" ON public.me_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_settings_admin" ON public.me_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.me_settings TO authenticated;

-- ---------- reporting periods ----------
CREATE TABLE public.me_reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_type text NOT NULL DEFAULT 'quarter',
  fiscal_year int NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  submission_deadline date,
  is_open boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_period_type_chk CHECK (period_type IN ('year','half','quarter','month','week','custom'))
);
GRANT SELECT ON public.me_reporting_periods TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.me_reporting_periods TO authenticated;
GRANT ALL ON public.me_reporting_periods TO service_role;
ALTER TABLE public.me_reporting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_periods_read" ON public.me_reporting_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_periods_manage" ON public.me_reporting_periods FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

-- ---------- strategy ----------
CREATE TABLE public.me_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_pillars TO authenticated;
GRANT ALL ON public.me_pillars TO service_role;
ALTER TABLE public.me_pillars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_pillars_read" ON public.me_pillars FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_pillars_manage" ON public.me_pillars FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  pillar_id uuid REFERENCES public.me_pillars(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  classification text NOT NULL DEFAULT 'internal',
  budget_amount numeric(16,2),
  performance_score numeric(6,2),
  version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_obj_priority_chk CHECK (priority IN ('critical','high','medium','low')),
  CONSTRAINT me_obj_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_objectives TO authenticated;
GRANT ALL ON public.me_objectives TO service_role;
ALTER TABLE public.me_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_objectives_read" ON public.me_objectives FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_objectives_write" ON public.me_objectives FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_objectives_update" ON public.me_objectives FOR UPDATE TO authenticated
  USING (public.me_can_manage() AND public.me_can_view(classification, org_unit_id))
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_objectives_delete" ON public.me_objectives FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_objectives_pillar_idx ON public.me_objectives(pillar_id);
CREATE INDEX me_objectives_org_idx ON public.me_objectives(org_unit_id);
CREATE INDEX me_objectives_status_idx ON public.me_objectives(status);

-- ---------- portfolio ----------
CREATE TABLE public.me_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  charter text,
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  director_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  classification text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'draft',
  health text NOT NULL DEFAULT 'not_started',
  start_date date,
  end_date date,
  budget_amount numeric(16,2),
  performance_score numeric(6,2),
  version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_prog_status_chk CHECK (status IN ('draft','submitted','under_review','approved','active','on_hold','at_risk','delayed','completed','cancelled','archived')),
  CONSTRAINT me_prog_health_chk CHECK (health IN ('on_track','at_risk','critical','not_started','completed')),
  CONSTRAINT me_prog_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_programs TO authenticated;
GRANT ALL ON public.me_programs TO service_role;
ALTER TABLE public.me_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_programs_read" ON public.me_programs FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_programs_insert" ON public.me_programs FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_programs_update" ON public.me_programs FOR UPDATE TO authenticated
  USING (public.me_can_manage() AND public.me_can_view(classification, org_unit_id))
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_programs_delete" ON public.me_programs FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_programs_objective_idx ON public.me_programs(objective_id);
CREATE INDEX me_programs_org_idx ON public.me_programs(org_unit_id);

CREATE TABLE public.me_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  charter text,
  scope text,
  deliverables text,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  manager_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  classification text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'draft',
  health text NOT NULL DEFAULT 'not_started',
  priority text NOT NULL DEFAULT 'medium',
  start_date date,
  end_date date,
  actual_start_date date,
  actual_end_date date,
  percent_complete numeric(5,2) NOT NULL DEFAULT 0,
  budget_amount numeric(16,2),
  revised_budget_amount numeric(16,2),
  health_score numeric(6,2),
  performance_score numeric(6,2),
  version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_proj_status_chk CHECK (status IN ('draft','submitted','under_review','approved','active','on_hold','at_risk','delayed','completed','cancelled','archived')),
  CONSTRAINT me_proj_health_chk CHECK (health IN ('on_track','at_risk','critical','not_started','completed')),
  CONSTRAINT me_proj_priority_chk CHECK (priority IN ('critical','high','medium','low')),
  CONSTRAINT me_proj_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_projects TO authenticated;
GRANT ALL ON public.me_projects TO service_role;
ALTER TABLE public.me_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_projects_read" ON public.me_projects FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_projects_insert" ON public.me_projects FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_projects_update" ON public.me_projects FOR UPDATE TO authenticated
  USING (public.me_can_manage() AND public.me_can_view(classification, org_unit_id))
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_projects_delete" ON public.me_projects FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_projects_program_idx ON public.me_projects(program_id);
CREATE INDEX me_projects_org_idx ON public.me_projects(org_unit_id);
CREATE INDEX me_projects_region_idx ON public.me_projects(region);
CREATE INDEX me_projects_status_idx ON public.me_projects(status);

CREATE TABLE public.me_workstreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.me_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  lead_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order int NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_workstreams TO authenticated;
GRANT ALL ON public.me_workstreams TO service_role;
ALTER TABLE public.me_workstreams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_workstreams_read" ON public.me_workstreams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_projects p WHERE p.id = project_id AND public.me_can_view(p.classification, p.org_unit_id)));
CREATE POLICY "me_workstreams_manage" ON public.me_workstreams FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE INDEX me_workstreams_project_idx ON public.me_workstreams(project_id);

-- ---------- delivery ----------
CREATE TABLE public.me_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  project_id uuid NOT NULL REFERENCES public.me_projects(id) ON DELETE CASCADE,
  workstream_id uuid REFERENCES public.me_workstreams(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES public.me_activities(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  classification text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'not_started',
  priority text NOT NULL DEFAULT 'medium',
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  percent_complete numeric(5,2) NOT NULL DEFAULT 0,
  planned_cost numeric(16,2),
  actual_cost numeric(16,2),
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_act_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_activities TO authenticated;
GRANT ALL ON public.me_activities TO service_role;
ALTER TABLE public.me_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_activities_read" ON public.me_activities FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_activities_insert" ON public.me_activities FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_activities_update" ON public.me_activities FOR UPDATE TO authenticated
  USING (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "me_activities_delete" ON public.me_activities FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_activities_project_idx ON public.me_activities(project_id);
CREATE INDEX me_activities_owner_idx ON public.me_activities(owner_profile_id);

CREATE TABLE public.me_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.me_projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.me_tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'task',
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_team text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  classification text NOT NULL DEFAULT 'internal',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'not_started',
  planned_start date,
  due_date date,
  actual_start date,
  completed_at timestamptz,
  percent_complete numeric(5,2) NOT NULL DEFAULT 0,
  estimated_hours numeric(10,2),
  actual_hours numeric(10,2),
  cost numeric(16,2),
  requires_approval boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_task_status_chk CHECK (status IN ('not_started','in_progress','blocked','submitted','completed','cancelled')),
  CONSTRAINT me_task_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_tasks TO authenticated;
GRANT ALL ON public.me_tasks TO service_role;
ALTER TABLE public.me_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_tasks_read" ON public.me_tasks FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id)
         OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "me_tasks_insert" ON public.me_tasks FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_tasks_update" ON public.me_tasks FOR UPDATE TO authenticated
  USING (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "me_tasks_delete" ON public.me_tasks FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_tasks_project_idx ON public.me_tasks(project_id);
CREATE INDEX me_tasks_activity_idx ON public.me_tasks(activity_id);
CREATE INDEX me_tasks_owner_idx ON public.me_tasks(owner_profile_id);
CREATE INDEX me_tasks_due_idx ON public.me_tasks(due_date);

CREATE TABLE public.me_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.me_projects(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  due_date date NOT NULL,
  achieved_date date,
  criticality text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'planned',
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_ms_status_chk CHECK (status IN ('planned','at_risk','delayed','achieved','missed','cancelled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_milestones TO authenticated;
GRANT ALL ON public.me_milestones TO service_role;
ALTER TABLE public.me_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_milestones_read" ON public.me_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_projects p WHERE p.id = project_id AND public.me_can_view(p.classification, p.org_unit_id)));
CREATE POLICY "me_milestones_manage" ON public.me_milestones FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE INDEX me_milestones_project_idx ON public.me_milestones(project_id);

CREATE TABLE public.me_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  to_type text NOT NULL,
  to_id uuid NOT NULL,
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  lag_days int NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_dep_type_chk CHECK (dependency_type IN ('finish_to_start','start_to_start','finish_to_finish','start_to_finish'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_dependencies TO authenticated;
GRANT ALL ON public.me_dependencies TO service_role;
ALTER TABLE public.me_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_deps_read" ON public.me_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_deps_manage" ON public.me_dependencies FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

-- ---------- measurement ----------
CREATE TABLE public.me_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL UNIQUE,
  name text NOT NULL,
  definition text,
  measure_class text NOT NULL DEFAULT 'kpi',
  result_level text,
  value_type text NOT NULL DEFAULT 'number',
  unit text,
  baseline_value numeric(16,4),
  baseline_date date,
  calculation_method text,
  data_source text,
  collection_method text,
  reporting_frequency text NOT NULL DEFAULT 'quarterly',
  requires_evidence boolean NOT NULL DEFAULT true,
  direction text NOT NULL DEFAULT 'increase',
  threshold_green numeric(6,2) NOT NULL DEFAULT 90,
  threshold_amber numeric(6,2) NOT NULL DEFAULT 70,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verifier_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  classification text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'active',
  version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_measure_class_chk CHECK (measure_class IN ('kpi','indicator')),
  CONSTRAINT me_measure_level_chk CHECK (result_level IS NULL OR result_level IN ('input','activity','output','outcome','impact')),
  CONSTRAINT me_measure_valuetype_chk CHECK (value_type IN ('percentage','number','rate','ratio','currency','time','score','index','boolean','composite')),
  CONSTRAINT me_measure_freq_chk CHECK (reporting_frequency IN ('annual','semiannual','quarterly','monthly','weekly','custom')),
  CONSTRAINT me_measure_dir_chk CHECK (direction IN ('increase','decrease')),
  CONSTRAINT me_measure_dataclass_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_measures TO authenticated;
GRANT ALL ON public.me_measures TO service_role;
ALTER TABLE public.me_measures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_measures_read" ON public.me_measures FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_measures_insert" ON public.me_measures FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_measures_update" ON public.me_measures FOR UPDATE TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE POLICY "me_measures_delete" ON public.me_measures FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_measures_project_idx ON public.me_measures(project_id);
CREATE INDEX me_measures_class_idx ON public.me_measures(measure_class);

CREATE TABLE public.me_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measure_id uuid NOT NULL REFERENCES public.me_measures(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.me_reporting_periods(id) ON DELETE CASCADE,
  target_value numeric(16,4) NOT NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  notes text,
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (measure_id, period_id, region, org_unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_targets TO authenticated;
GRANT ALL ON public.me_targets TO service_role;
ALTER TABLE public.me_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_targets_read" ON public.me_targets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_measures m WHERE m.id = measure_id AND public.me_can_view(m.classification, m.org_unit_id)));
CREATE POLICY "me_targets_manage" ON public.me_targets FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE INDEX me_targets_measure_idx ON public.me_targets(measure_id, period_id);

CREATE TABLE public.me_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measure_id uuid NOT NULL REFERENCES public.me_measures(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.me_reporting_periods(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.me_targets(id) ON DELETE SET NULL,
  reported_value numeric(16,4),
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_at timestamptz,
  verified_value numeric(16,4),
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_status text NOT NULL DEFAULT 'draft',
  verification_notes text,
  narrative text,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  data_quality_status text NOT NULL DEFAULT 'unchecked',
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_result_vstatus_chk CHECK (verification_status IN ('draft','submitted','returned','verified','rejected','archived')),
  CONSTRAINT me_result_dq_chk CHECK (data_quality_status IN ('unchecked','pass','warning','fail'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_results TO authenticated;
GRANT ALL ON public.me_results TO service_role;
ALTER TABLE public.me_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_results_read" ON public.me_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_measures m WHERE m.id = measure_id AND public.me_can_view(m.classification, m.org_unit_id)));
CREATE POLICY "me_results_insert" ON public.me_results FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "me_results_update" ON public.me_results FOR UPDATE TO authenticated
  USING (public.me_can_verify() OR public.me_can_manage()
         OR (verification_status IN ('draft','returned') AND reported_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (public.me_can_verify() OR public.me_can_manage()
         OR (verification_status IN ('draft','returned','submitted') AND reported_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())));
CREATE POLICY "me_results_delete" ON public.me_results FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_results_measure_idx ON public.me_results(measure_id, period_id);

-- ---------- results framework ----------
CREATE TABLE public.me_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_frameworks TO authenticated;
GRANT ALL ON public.me_frameworks TO service_role;
ALTER TABLE public.me_frameworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_frameworks_read" ON public.me_frameworks FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_frameworks_manage" ON public.me_frameworks FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_framework_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES public.me_frameworks(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.me_framework_rows(id) ON DELETE CASCADE,
  result_level text NOT NULL,
  result_statement text NOT NULL,
  assumptions text,
  means_of_verification text,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  measure_id uuid REFERENCES public.me_measures(id) ON DELETE SET NULL,
  risk_note text,
  sort_order int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_fwrow_level_chk CHECK (result_level IN ('input','activity','output','outcome','impact'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_framework_rows TO authenticated;
GRANT ALL ON public.me_framework_rows TO service_role;
ALTER TABLE public.me_framework_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_fwrows_read" ON public.me_framework_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_fwrows_manage" ON public.me_framework_rows FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE INDEX me_fwrows_fw_idx ON public.me_framework_rows(framework_id);

-- ---------- field reporting ----------
CREATE TABLE public.me_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'project_progress',
  description text,
  schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  requires_gps boolean NOT NULL DEFAULT true,
  requires_evidence boolean NOT NULL DEFAULT false,
  classification text NOT NULL DEFAULT 'internal',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_form_templates TO authenticated;
GRANT ALL ON public.me_form_templates TO service_role;
ALTER TABLE public.me_form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_forms_read" ON public.me_form_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_forms_manage" ON public.me_form_templates FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_field_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  template_id uuid REFERENCES public.me_form_templates(id) ON DELETE SET NULL,
  template_version int,
  report_type text NOT NULL DEFAULT 'project_progress',
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  measure_id uuid REFERENCES public.me_measures(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.me_reporting_periods(id) ON DELETE SET NULL,
  officer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by uuid,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  location_accuracy_m numeric(10,2),
  reported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  reviewer_notes text,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  signature_data text,
  classification text NOT NULL DEFAULT 'internal',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_fr_status_chk CHECK (status IN ('draft','submitted','returned','verified','approved','rejected','archived')),
  CONSTRAINT me_fr_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_field_reports TO authenticated;
GRANT ALL ON public.me_field_reports TO service_role;
ALTER TABLE public.me_field_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_fr_read" ON public.me_field_reports FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id) OR submitted_by = auth.uid());
CREATE POLICY "me_fr_insert" ON public.me_field_reports FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "me_fr_update" ON public.me_field_reports FOR UPDATE TO authenticated
  USING (public.me_can_verify() OR public.me_can_manage()
         OR (status IN ('draft','returned') AND submitted_by = auth.uid()))
  WITH CHECK (public.me_can_verify() OR public.me_can_manage()
         OR (status IN ('draft','returned','submitted') AND submitted_by = auth.uid()));
CREATE POLICY "me_fr_delete" ON public.me_field_reports FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_fr_project_idx ON public.me_field_reports(project_id);
CREATE INDEX me_fr_status_idx ON public.me_field_reports(status);
CREATE INDEX me_fr_region_idx ON public.me_field_reports(region);

-- ---------- evidence ----------
CREATE TABLE public.me_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  evidence_type text NOT NULL DEFAULT 'document',
  source text,
  evidence_date date,
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  content_hash text,
  uploaded_by uuid,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending',
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_notes text,
  classification text NOT NULL DEFAULT 'internal',
  retention_status text NOT NULL DEFAULT 'retain',
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_ev_status_chk CHECK (verification_status IN ('pending','verified','rejected','superseded')),
  CONSTRAINT me_ev_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_evidence TO authenticated;
GRANT ALL ON public.me_evidence TO service_role;
ALTER TABLE public.me_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_evidence_read" ON public.me_evidence FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id) OR uploaded_by = auth.uid());
CREATE POLICY "me_evidence_insert" ON public.me_evidence FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "me_evidence_update" ON public.me_evidence FOR UPDATE TO authenticated
  USING (public.me_can_verify() OR public.me_can_manage() OR uploaded_by = auth.uid())
  WITH CHECK (public.me_can_verify() OR public.me_can_manage() OR uploaded_by = auth.uid());
CREATE POLICY "me_evidence_delete" ON public.me_evidence FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_evidence_related_idx ON public.me_evidence(related_type, related_id);

CREATE TABLE public.me_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  decision text NOT NULL,
  notes text,
  verified_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_verif_decision_chk CHECK (decision IN ('verified','rejected','returned','requested_correction'))
);
GRANT SELECT, INSERT ON public.me_verifications TO authenticated;
GRANT ALL ON public.me_verifications TO service_role;
ALTER TABLE public.me_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_verif_read" ON public.me_verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "me_verif_insert" ON public.me_verifications FOR INSERT TO authenticated
  WITH CHECK (public.me_can_verify() AND verified_by = auth.uid());
CREATE INDEX me_verif_related_idx ON public.me_verifications(related_type, related_id);

-- ---------- risk, issues, corrective actions, incidents ----------
CREATE TABLE public.me_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'operational',
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE SET NULL,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  probability int NOT NULL DEFAULT 3,
  impact int NOT NULL DEFAULT 3,
  risk_score int GENERATED ALWAYS AS (probability * impact) STORED,
  risk_level text NOT NULL DEFAULT 'medium',
  mitigation text,
  contingency text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  last_reviewed_at timestamptz,
  classification text NOT NULL DEFAULT 'internal',
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_risk_prob_chk CHECK (probability BETWEEN 1 AND 5),
  CONSTRAINT me_risk_impact_chk CHECK (impact BETWEEN 1 AND 5),
  CONSTRAINT me_risk_status_chk CHECK (status IN ('open','mitigating','monitoring','closed','escalated')),
  CONSTRAINT me_risk_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_risks TO authenticated;
GRANT ALL ON public.me_risks TO service_role;
ALTER TABLE public.me_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_risks_read" ON public.me_risks FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_risks_insert" ON public.me_risks FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());
CREATE POLICY "me_risks_update" ON public.me_risks FOR UPDATE TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE POLICY "me_risks_delete" ON public.me_risks FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_risks_project_idx ON public.me_risks(project_id);
CREATE INDEX me_risks_level_idx ON public.me_risks(risk_level);

CREATE TABLE public.me_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  title text NOT NULL,
  description text,
  root_cause text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  risk_id uuid REFERENCES public.me_risks(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  due_date date,
  resolved_at timestamptz,
  classification text NOT NULL DEFAULT 'internal',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_issue_status_chk CHECK (status IN ('open','assigned','in_progress','submitted_for_verification','closed')),
  CONSTRAINT me_issue_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_issues TO authenticated;
GRANT ALL ON public.me_issues TO service_role;
ALTER TABLE public.me_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_issues_read" ON public.me_issues FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_issues_manage" ON public.me_issues FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  title text NOT NULL,
  description text,
  action_type text NOT NULL DEFAULT 'corrective',
  issue_id uuid REFERENCES public.me_issues(id) ON DELETE SET NULL,
  risk_id uuid REFERENCES public.me_risks(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  incident_id uuid,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  verification_notes text,
  closure_evidence_id uuid REFERENCES public.me_evidence(id) ON DELETE SET NULL,
  closed_at timestamptz,
  classification text NOT NULL DEFAULT 'internal',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_ca_status_chk CHECK (status IN ('open','assigned','in_progress','submitted_for_verification','closed')),
  CONSTRAINT me_ca_type_chk CHECK (action_type IN ('corrective','preventive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_corrective_actions TO authenticated;
GRANT ALL ON public.me_corrective_actions TO service_role;
ALTER TABLE public.me_corrective_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_ca_read" ON public.me_corrective_actions FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id)
         OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "me_ca_manage" ON public.me_corrective_actions FOR ALL TO authenticated
  USING (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.me_can_manage() OR owner_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TABLE public.me_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  incident_type text NOT NULL DEFAULT 'operational',
  title text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'reported',
  reporting_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  location_name text,
  latitude double precision,
  longitude double precision,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  risk_id uuid REFERENCES public.me_risks(id) ON DELETE SET NULL,
  issue_id uuid REFERENCES public.me_issues(id) ON DELETE SET NULL,
  response_summary text,
  investigation_summary text,
  resolution text,
  resolved_at timestamptz,
  escalated_at timestamptz,
  classification text NOT NULL DEFAULT 'confidential',
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_inc_sev_chk CHECK (severity IN ('informational','low','medium','high','critical')),
  CONSTRAINT me_inc_status_chk CHECK (status IN ('reported','acknowledged','assigned','investigating','contained','resolved','closed')),
  CONSTRAINT me_inc_class_chk CHECK (classification IN ('public','internal','confidential','restricted','highly_restricted'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_incidents TO authenticated;
GRANT ALL ON public.me_incidents TO service_role;
ALTER TABLE public.me_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_incidents_read" ON public.me_incidents FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_incidents_insert" ON public.me_incidents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "me_incidents_update" ON public.me_incidents FOR UPDATE TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE POLICY "me_incidents_delete" ON public.me_incidents FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_incidents_severity_idx ON public.me_incidents(severity);
CREATE INDEX me_incidents_region_idx ON public.me_incidents(region);

ALTER TABLE public.me_corrective_actions
  ADD CONSTRAINT me_ca_incident_fk FOREIGN KEY (incident_id) REFERENCES public.me_incidents(id) ON DELETE SET NULL;

-- ---------- resources & finance ----------
CREATE TABLE public.me_resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_category text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  external_ref text,
  label text,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  allocated_from date,
  allocated_to date,
  utilization_percent numeric(5,2),
  cost numeric(16,2),
  status text NOT NULL DEFAULT 'allocated',
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_res_cat_chk CHECK (resource_category IN ('personnel','vehicle','equipment','facility','technology','contractor','consultant','financial')),
  CONSTRAINT me_res_status_chk CHECK (status IN ('planned','allocated','in_use','released','unavailable'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_resource_allocations TO authenticated;
GRANT ALL ON public.me_resource_allocations TO service_role;
ALTER TABLE public.me_resource_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_res_read" ON public.me_resource_allocations FOR SELECT TO authenticated
  USING (public.me_can_view('internal', org_unit_id));
CREATE POLICY "me_res_manage" ON public.me_resource_allocations FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE INDEX me_res_project_idx ON public.me_resource_allocations(project_id);

CREATE TABLE public.me_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text,
  name text NOT NULL,
  fiscal_year int NOT NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.me_programs(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES public.me_objectives(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  region text,
  funding_source text,
  currency text NOT NULL DEFAULT 'GHS',
  approved_amount numeric(16,2) NOT NULL DEFAULT 0,
  revised_amount numeric(16,2),
  committed_amount numeric(16,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  classification text NOT NULL DEFAULT 'confidential',
  external_ref text,
  sync_status text NOT NULL DEFAULT 'local',
  synced_at timestamptz,
  version int NOT NULL DEFAULT 1,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_budget_status_chk CHECK (status IN ('draft','submitted','approved','revised','closed')),
  CONSTRAINT me_budget_sync_chk CHECK (sync_status IN ('local','pending','synced','failed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_budgets TO authenticated;
GRANT ALL ON public.me_budgets TO service_role;
ALTER TABLE public.me_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_budgets_read" ON public.me_budgets FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id));
CREATE POLICY "me_budgets_manage" ON public.me_budgets FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.me_budgets(id) ON DELETE CASCADE,
  line_code text,
  description text NOT NULL,
  category text,
  approved_amount numeric(16,2) NOT NULL DEFAULT 0,
  revised_amount numeric(16,2),
  committed_amount numeric(16,2) NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_budget_lines TO authenticated;
GRANT ALL ON public.me_budget_lines TO service_role;
ALTER TABLE public.me_budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_blines_read" ON public.me_budget_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_budgets b WHERE b.id = budget_id AND public.me_can_view(b.classification, b.org_unit_id)));
CREATE POLICY "me_blines_manage" ON public.me_budget_lines FOR ALL TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());

CREATE TABLE public.me_expenditures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES public.me_budgets(id) ON DELETE CASCADE,
  budget_line_id uuid REFERENCES public.me_budget_lines(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.me_projects(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.me_activities(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(16,2) NOT NULL,
  spend_date date NOT NULL DEFAULT current_date,
  expenditure_type text NOT NULL DEFAULT 'actual',
  vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_ref text,
  payment_ref text,
  requested_by uuid,
  approved_by uuid,
  paid_by uuid,
  status text NOT NULL DEFAULT 'requested',
  external_ref text,
  sync_status text NOT NULL DEFAULT 'local',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_exp_type_chk CHECK (expenditure_type IN ('commitment','actual')),
  CONSTRAINT me_exp_status_chk CHECK (status IN ('requested','approved','rejected','paid','reconciled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_expenditures TO authenticated;
GRANT ALL ON public.me_expenditures TO service_role;
ALTER TABLE public.me_expenditures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_exp_read" ON public.me_expenditures FOR SELECT TO authenticated
  USING (public.me_can_view('confidential', NULL) OR requested_by = auth.uid());
CREATE POLICY "me_exp_insert" ON public.me_expenditures FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage() AND requested_by = auth.uid());
CREATE POLICY "me_exp_update" ON public.me_expenditures FOR UPDATE TO authenticated
  USING (public.me_can_manage()) WITH CHECK (public.me_can_manage());
CREATE POLICY "me_exp_delete" ON public.me_expenditures FOR DELETE TO authenticated
  USING (public.me_can_delete());
CREATE INDEX me_exp_budget_idx ON public.me_expenditures(budget_id);

-- separation of duties: the requester may not approve or pay their own expenditure
CREATE OR REPLACE FUNCTION public.me_enforce_expenditure_sod()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.requested_by THEN
    RAISE EXCEPTION 'Separation of duties: the requester cannot approve this expenditure';
  END IF;
  IF NEW.paid_by IS NOT NULL AND (NEW.paid_by = NEW.requested_by OR NEW.paid_by = NEW.approved_by) THEN
    RAISE EXCEPTION 'Separation of duties: payment must be recorded by a different officer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER me_expenditures_sod BEFORE INSERT OR UPDATE ON public.me_expenditures
  FOR EACH ROW EXECUTE FUNCTION public.me_enforce_expenditure_sod();

-- ---------- approvals / events / scores ----------
CREATE TABLE public.me_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  workflow_key text NOT NULL DEFAULT 'default',
  current_step int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid,
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL,
  classification text NOT NULL DEFAULT 'internal',
  due_date date,
  completed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_appr_status_chk CHECK (status IN ('pending','approved','rejected','returned','escalated','cancelled'))
);
GRANT SELECT, INSERT, UPDATE ON public.me_approvals TO authenticated;
GRANT ALL ON public.me_approvals TO service_role;
ALTER TABLE public.me_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_appr_read" ON public.me_approvals FOR SELECT TO authenticated
  USING (public.me_can_view(classification, org_unit_id) OR requested_by = auth.uid());
CREATE POLICY "me_appr_insert" ON public.me_approvals FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "me_appr_update" ON public.me_approvals FOR UPDATE TO authenticated
  USING (public.me_can_manage() OR public.me_can_verify()) WITH CHECK (public.me_can_manage() OR public.me_can_verify());
CREATE INDEX me_appr_record_idx ON public.me_approvals(record_type, record_id);

CREATE TABLE public.me_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.me_approvals(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  step_role text,
  approver_user_id uuid,
  action text,
  comment text,
  delegated_to uuid,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_step_action_chk CHECK (action IS NULL OR action IN ('approve','reject','return','delegate','escalate','comment'))
);
GRANT SELECT, INSERT ON public.me_approval_steps TO authenticated;
GRANT ALL ON public.me_approval_steps TO service_role;
ALTER TABLE public.me_approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_steps_read" ON public.me_approval_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.me_approvals a WHERE a.id = approval_id
                 AND (public.me_can_view(a.classification, a.org_unit_id) OR a.requested_by = auth.uid())));
CREATE POLICY "me_steps_insert" ON public.me_approval_steps FOR INSERT TO authenticated
  WITH CHECK (approver_user_id = auth.uid() AND (public.me_can_manage() OR public.me_can_verify()));
CREATE INDEX me_steps_approval_idx ON public.me_approval_steps(approval_id);

CREATE TABLE public.me_event_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_key text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_roles text[] NOT NULL DEFAULT '{}',
  escalate_after_hours int,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.me_event_rules TO authenticated;
GRANT ALL ON public.me_event_rules TO service_role;
ALTER TABLE public.me_event_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_rules_read" ON public.me_event_rules FOR SELECT TO authenticated
  USING (public.me_can_manage());
CREATE POLICY "me_rules_admin" ON public.me_event_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.me_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_id uuid,
  scope_label text,
  period_id uuid REFERENCES public.me_reporting_periods(id) ON DELETE SET NULL,
  score numeric(6,2) NOT NULL,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula_version text NOT NULL DEFAULT 'v1',
  calculation_status text NOT NULL DEFAULT 'complete',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT me_score_scope_chk CHECK (scope_type IN ('project','program','objective','department','region','national'))
);
GRANT SELECT ON public.me_scores TO authenticated;
GRANT ALL ON public.me_scores TO service_role;
ALTER TABLE public.me_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "me_scores_read" ON public.me_scores FOR SELECT TO authenticated USING (true);
GRANT INSERT ON public.me_scores TO authenticated;
CREATE POLICY "me_scores_insert" ON public.me_scores FOR INSERT TO authenticated
  WITH CHECK (public.me_can_manage());

-- ---------- updated_at triggers ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'me_settings','me_reporting_periods','me_pillars','me_objectives','me_programs','me_projects',
    'me_workstreams','me_activities','me_tasks','me_milestones','me_dependencies','me_measures',
    'me_targets','me_results','me_frameworks','me_framework_rows','me_form_templates','me_field_reports',
    'me_evidence','me_risks','me_issues','me_corrective_actions','me_incidents','me_resource_allocations',
    'me_budgets','me_budget_lines','me_expenditures','me_approvals','me_event_rules']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_touch', t);
  END LOOP;
END $$;

-- ---------- audit triggers on material tables ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'me_objectives','me_programs','me_projects','me_activities','me_tasks','me_milestones',
    'me_measures','me_targets','me_results','me_field_reports','me_evidence','me_risks',
    'me_issues','me_corrective_actions','me_incidents','me_budgets','me_expenditures',
    'me_resource_allocations','me_approvals','me_event_rules','me_settings']
  LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_record_changes()', t || '_audit', t);
  END LOOP;
END $$;