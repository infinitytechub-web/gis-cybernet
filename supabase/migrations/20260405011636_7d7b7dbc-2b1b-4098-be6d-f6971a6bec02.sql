
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage announcements"
ON public.announcements FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can create department announcements"
ON public.announcements FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND department_id = get_user_department_id(auth.uid())
);

CREATE POLICY "Supervisors can update own announcements"
ON public.announcements FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND created_by = auth.uid()
);

CREATE POLICY "Supervisors can delete own announcements"
ON public.announcements FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can view relevant announcements"
ON public.announcements FOR SELECT TO authenticated
USING (
  is_active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    department_id IS NULL
    OR department_id = get_user_department_id(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
