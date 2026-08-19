-- 1. Hierarchy levels
CREATE TYPE public.org_unit_type AS ENUM ('national','regional','sector','district','station','unit');

-- 2. Org units
CREATE TABLE public.org_units (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  type public.org_unit_type NOT NULL,
  parent_id uuid REFERENCES public.org_units(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_units_parent ON public.org_units(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_units TO authenticated;
GRANT ALL ON public.org_units TO service_role;
ALTER TABLE public.org_units ENABLE ROW LEVEL SECURITY;

-- 3. Assignments
CREATE TABLE public.org_unit_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_unit_id uuid NOT NULL REFERENCES public.org_units(id) ON DELETE CASCADE,
  can_manage boolean NOT NULL DEFAULT false,
  granted_by uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_unit_id)
);
CREATE INDEX idx_org_unit_assignments_user ON public.org_unit_assignments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_unit_assignments TO authenticated;
GRANT ALL ON public.org_unit_assignments TO service_role;
ALTER TABLE public.org_unit_assignments ENABLE ROW LEVEL SECURITY;

-- 4. Profile posting
ALTER TABLE public.profiles
  ADD COLUMN org_unit_id uuid REFERENCES public.org_units(id) ON DELETE SET NULL;
CREATE INDEX idx_profiles_org_unit ON public.profiles(org_unit_id);

-- 5. Hierarchy helpers
CREATE OR REPLACE FUNCTION public.org_unit_descendants(_root uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT id FROM public.org_units WHERE id = _root
    UNION ALL
    SELECT o.id FROM public.org_units o JOIN t ON o.parent_id = t.id
  )
  SELECT id FROM t;
$$;

CREATE OR REPLACE FUNCTION public.org_unit_ancestors(_node uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE t AS (
    SELECT id, parent_id FROM public.org_units WHERE id = _node
    UNION ALL
    SELECT o.id, o.parent_id FROM public.org_units o JOIN t ON t.parent_id = o.id
  )
  SELECT id FROM t;
$$;

CREATE OR REPLACE FUNCTION public.user_org_scope(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH roots AS (
    SELECT p.org_unit_id AS id
      FROM public.profiles p
     WHERE p.user_id = _user_id AND p.org_unit_id IS NOT NULL
    UNION
    SELECT a.org_unit_id
      FROM public.org_unit_assignments a
     WHERE a.user_id = _user_id
       AND a.revoked_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
  )
  SELECT DISTINCT d
    FROM roots r
    CROSS JOIN LATERAL public.org_unit_descendants(r.id) AS d;
$$;

CREATE OR REPLACE FUNCTION public.has_org_access(_user_id uuid, _org_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org_unit_id IS NULL
      OR public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.user_org_scope(_user_id) s WHERE s = _org_unit_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_unit(_user_id uuid, _org_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1
          FROM public.org_unit_assignments a
         WHERE a.user_id = _user_id
           AND a.can_manage
           AND a.revoked_at IS NULL
           AND (a.expires_at IS NULL OR a.expires_at > now())
           AND _org_unit_id IN (SELECT public.org_unit_descendants(a.org_unit_id))
      );
$$;

CREATE OR REPLACE FUNCTION public.can_access_staff_profile(_user_id uuid, _profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = _profile_id
           AND (p.user_id = _user_id
                OR p.org_unit_id IS NULL
                OR public.has_org_access(_user_id, p.org_unit_id))
      );
$$;

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_org_units_updated_at BEFORE UPDATE ON public.org_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_unit_assignments_updated_at BEFORE UPDATE ON public.org_unit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Guard against cycles in the hierarchy
CREATE OR REPLACE FUNCTION public.guard_org_unit_cycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'An org unit cannot be its own parent';
    END IF;
    IF EXISTS (SELECT 1 FROM public.org_unit_descendants(NEW.id) d WHERE d = NEW.parent_id) THEN
      RAISE EXCEPTION 'Cyclic org hierarchy is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER guard_org_units_cycle BEFORE INSERT OR UPDATE ON public.org_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_unit_cycle();

-- 8. Policies — org_units
CREATE POLICY "Authenticated can view org units"
  ON public.org_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Branch managers can create org units"
  ON public.org_units FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin')
              OR (parent_id IS NOT NULL AND public.can_manage_org_unit(auth.uid(), parent_id)));
CREATE POLICY "Branch managers can update org units"
  ON public.org_units FOR UPDATE TO authenticated
  USING (public.can_manage_org_unit(auth.uid(), id))
  WITH CHECK (public.can_manage_org_unit(auth.uid(), id));
CREATE POLICY "Branch managers can delete org units"
  ON public.org_units FOR DELETE TO authenticated
  USING (public.can_manage_org_unit(auth.uid(), id));

-- 9. Policies — org_unit_assignments
CREATE POLICY "Users view own org assignments"
  ON public.org_unit_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_org_unit(auth.uid(), org_unit_id));
CREATE POLICY "Branch managers manage org assignments"
  ON public.org_unit_assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org_unit(auth.uid(), org_unit_id));
CREATE POLICY "Branch managers update org assignments"
  ON public.org_unit_assignments FOR UPDATE TO authenticated
  USING (public.can_manage_org_unit(auth.uid(), org_unit_id))
  WITH CHECK (public.can_manage_org_unit(auth.uid(), org_unit_id));
CREATE POLICY "Branch managers delete org assignments"
  ON public.org_unit_assignments FOR DELETE TO authenticated
  USING (public.can_manage_org_unit(auth.uid(), org_unit_id));

-- 10. Hierarchical scoping on staff profiles
CREATE POLICY "Org oversight can view profiles in scope"
  ON public.profiles FOR SELECT TO authenticated
  USING (org_unit_id IS NOT NULL AND public.has_org_access(auth.uid(), org_unit_id));

CREATE POLICY "Org scope restricts profile writes"
  ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
         OR user_id = auth.uid()
         OR org_unit_id IS NULL
         OR public.has_org_access(auth.uid(), org_unit_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin')
         OR user_id = auth.uid()
         OR org_unit_id IS NULL
         OR public.has_org_access(auth.uid(), org_unit_id));