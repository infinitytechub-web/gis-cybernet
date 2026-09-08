-- Directory permission matrix: per-role, per-hierarchy-level action switches
CREATE TABLE IF NOT EXISTS public.directory_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  level text NOT NULL CHECK (level IN ('hq','regional','sector','department','section','unit','shift')),
  scope text NOT NULL DEFAULT 'own_unit' CHECK (scope IN ('all','own_subtree','own_unit','shift','self','none')),
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_download boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT false,
  can_vault boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, level)
);

GRANT SELECT ON public.directory_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.directory_permissions TO authenticated;
GRANT ALL ON public.directory_permissions TO service_role;

ALTER TABLE public.directory_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read directory permissions" ON public.directory_permissions;
CREATE POLICY "Authenticated can read directory permissions"
  ON public.directory_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage directory permissions" ON public.directory_permissions;
CREATE POLICY "Admins manage directory permissions"
  ON public.directory_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_directory_permissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_directory_permissions_trg ON public.directory_permissions;
CREATE TRIGGER touch_directory_permissions_trg
  BEFORE INSERT OR UPDATE ON public.directory_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_directory_permissions();

-- Map an org unit onto one of the seven matrix levels
CREATE OR REPLACE FUNCTION public.directory_level_of_unit(_org_unit_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE u.type::text
           WHEN 'directorate' THEN 'hq'
           WHEN 'national' THEN 'hq'
           WHEN 'management' THEN 'hq'
           WHEN 'command' THEN 'hq'
           WHEN 'regional' THEN 'regional'
           WHEN 'sector' THEN 'sector'
           WHEN 'department' THEN 'department'
           WHEN 'section' THEN 'section'
           ELSE 'unit'
         END
  FROM public.org_units u WHERE u.id = _org_unit_id;
$$;

-- Level of the profile being acted on ('unit' when unposted)
CREATE OR REPLACE FUNCTION public.directory_level_of_profile(_profile_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.directory_level_of_unit(p.org_unit_id), 'unit')
  FROM public.profiles p WHERE p.id = _profile_id;
$$;

-- Core decision: does the caller hold `_action` over `_profile_id`?
CREATE OR REPLACE FUNCTION public.can_directory_action(_action text, _profile_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lvl text;
  tgt_unit uuid;
  tgt_dept uuid;
  tgt_user uuid;
  tgt_shift text;
  my_unit uuid;
  my_dept uuid;
  my_shift text;
  r record;
BEGIN
  IF _user_id IS NULL OR _profile_id IS NULL OR _action IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  IF _action NOT IN ('view','create','edit','delete','download','print','vault') THEN
    RETURN false;
  END IF;

  SELECT p.org_unit_id, p.department_id, p.user_id, p.shift_group
    INTO tgt_unit, tgt_dept, tgt_user, tgt_shift
  FROM public.profiles p WHERE p.id = _profile_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  lvl := COALESCE(public.directory_level_of_unit(tgt_unit), 'unit');

  SELECT p.org_unit_id, p.department_id, p.shift_group
    INTO my_unit, my_dept, my_shift
  FROM public.profiles p WHERE p.user_id = _user_id;

  FOR r IN
    SELECT dp.scope,
           CASE _action
             WHEN 'view' THEN dp.can_view
             WHEN 'create' THEN dp.can_create
             WHEN 'edit' THEN dp.can_edit
             WHEN 'delete' THEN dp.can_delete
             WHEN 'download' THEN dp.can_download
             WHEN 'print' THEN dp.can_print
             ELSE dp.can_vault
           END AS allowed
    FROM public.directory_permissions dp
    JOIN public.user_roles ur ON ur.role = dp.role AND ur.user_id = _user_id
    WHERE dp.level = lvl
  LOOP
    IF NOT r.allowed THEN
      CONTINUE;
    END IF;
    IF r.scope = 'all' THEN
      RETURN true;
    ELSIF r.scope = 'self' THEN
      IF tgt_user = _user_id THEN RETURN true; END IF;
    ELSIF r.scope = 'own_subtree' THEN
      IF tgt_unit IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.command_reach_units(_user_id) u WHERE u = tgt_unit
      ) THEN RETURN true; END IF;
    ELSIF r.scope = 'own_unit' THEN
      IF (tgt_unit IS NOT NULL AND my_unit IS NOT NULL AND tgt_unit = my_unit)
         OR (tgt_dept IS NOT NULL AND my_dept IS NOT NULL AND tgt_dept = my_dept)
      THEN RETURN true; END IF;
    ELSIF r.scope = 'shift' THEN
      IF tgt_shift IS NOT NULL AND my_shift IS NOT NULL AND tgt_shift = my_shift
         AND (tgt_dept IS NULL OR my_dept IS NULL OR tgt_dept = my_dept)
      THEN RETURN true; END IF;
    END IF;
  END LOOP;

  -- Everyone may always view and print their own record
  IF tgt_user = _user_id AND _action IN ('view','print','download') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Effective switches for the signed-in user, per level (UI gating)
CREATE OR REPLACE FUNCTION public.my_directory_permissions()
RETURNS TABLE (
  level text, scope text,
  can_view boolean, can_create boolean, can_edit boolean,
  can_delete boolean, can_download boolean, can_print boolean, can_vault boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.level,
         CASE WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN 'all'
              ELSE COALESCE(MIN(dp.scope), 'none') END,
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_view), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_create), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_edit), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_delete), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_download), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_print), false),
         public.has_role(auth.uid(), 'admin'::app_role) OR COALESCE(bool_or(dp.can_vault), false)
  FROM (VALUES ('hq'),('regional'),('sector'),('department'),('section'),('unit'),('shift')) AS l(level)
  LEFT JOIN public.user_roles ur ON ur.user_id = auth.uid()
  LEFT JOIN public.directory_permissions dp ON dp.role = ur.role AND dp.level = l.level
  GROUP BY l.level;
$$;

REVOKE ALL ON FUNCTION public.my_directory_permissions() FROM public;
GRANT EXECUTE ON FUNCTION public.my_directory_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_directory_action(text, uuid, uuid) TO authenticated;

-- Seed defaults from the approved matrix (idempotent)
INSERT INTO public.directory_permissions (role, level, scope, can_view, can_create, can_edit, can_delete, can_download, can_print, can_vault)
SELECT r.role::app_role, l.level, r.scope,
       r.v, r.c, r.e, r.d, r.dl, r.pr, r.vault
FROM (VALUES
  -- role, scope, view, create, edit, delete, download, print, vault
  ('admin','all',true,true,true,true,true,true,true),
  ('oic','all',true,true,true,true,true,true,true),
  ('2ic','all',true,true,true,true,true,true,true),
  ('chief_staff_officer','own_subtree',true,true,true,false,true,true,true),
  ('head_of_administration','own_subtree',true,true,true,false,true,true,true),
  ('staff_officer','own_unit',true,true,true,false,true,true,true),
  ('supervisor','own_unit',true,true,true,false,true,true,true),
  ('deputy_supervisor','own_unit',true,false,true,false,true,true,false),
  ('shift_supervisor','shift',true,false,true,false,true,true,true),
  ('deputy_shift_supervisor','shift',true,false,true,false,true,true,false),
  ('shift_leader','shift',true,false,false,false,false,true,false),
  ('deputy_shift_leader','shift',true,false,false,false,false,true,false),
  ('staff','self',true,false,false,false,false,true,false)
) AS r(role, scope, v, c, e, d, dl, pr, vault)
CROSS JOIN (VALUES ('hq'),('regional'),('sector'),('department'),('section'),('unit'),('shift')) AS l(level)
ON CONFLICT (role, level) DO NOTHING;

-- Shift roles never reach above their own shift; scoped roles never reach HQ/regional records
UPDATE public.directory_permissions
   SET can_view = false, can_create = false, can_edit = false,
       can_delete = false, can_download = false, can_print = false, can_vault = false
 WHERE scope = 'shift' AND level IN ('hq','regional','sector');

UPDATE public.directory_permissions
   SET can_create = false, can_edit = false, can_delete = false
 WHERE scope IN ('own_unit','self') AND level IN ('hq','regional');

-- Deletion of a staff record must satisfy the matrix
DROP POLICY IF EXISTS "Directory matrix governs profile deletes" ON public.profiles;
CREATE POLICY "Directory matrix governs profile deletes"
  ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_directory_action('delete', id, auth.uid()));