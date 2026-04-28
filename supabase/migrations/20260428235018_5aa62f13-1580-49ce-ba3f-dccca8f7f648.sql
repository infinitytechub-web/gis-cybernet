-- Permissions matrix for shift platform connection actions
CREATE TABLE IF NOT EXISTS public.shift_connection_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  action text NOT NULL CHECK (action IN ('disconnect','reconnect','purge','export')),
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (role, action)
);

ALTER TABLE public.shift_connection_permissions ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read the matrix (used to gate UI for that user)
CREATE POLICY "Authenticated can read shift connection permissions"
  ON public.shift_connection_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage shift connection permissions (insert)"
  ON public.shift_connection_permissions FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage shift connection permissions (update)"
  ON public.shift_connection_permissions FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage shift connection permissions (delete)"
  ON public.shift_connection_permissions FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Helper: does the current user have permission for a given action?
CREATE OR REPLACE FUNCTION public.can_shift_connection_action(_action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.shift_connection_permissions p
      JOIN public.user_roles ur ON ur.role = p.role
      WHERE ur.user_id = auth.uid()
        AND p.action = _action
        AND p.allowed = true
    );
$$;

-- Seed defaults: admin allowed for every action; others denied
INSERT INTO public.shift_connection_permissions (role, action, allowed)
SELECT r::app_role, a, (r = 'admin')
FROM (VALUES ('admin'),('oic'),('2ic'),('staff_officer'),('supervisor')) AS roles(r)
CROSS JOIN (VALUES ('disconnect'),('reconnect'),('purge'),('export')) AS acts(a)
ON CONFLICT (role, action) DO NOTHING;

-- Keep updated_at fresh
CREATE TRIGGER trg_shift_conn_perms_updated_at
BEFORE UPDATE ON public.shift_connection_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();