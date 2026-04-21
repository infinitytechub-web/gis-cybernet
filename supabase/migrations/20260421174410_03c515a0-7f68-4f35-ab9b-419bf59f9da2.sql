-- 1. Add office field to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS office text;

-- 2. Recipient list for scheduled attendance compliance reports
CREATE TABLE IF NOT EXISTS public.attendance_report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, period)
);

ALTER TABLE public.attendance_report_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view recipients"
  ON public.attendance_report_recipients
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Command tier can insert recipients"
  ON public.attendance_report_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  );

CREATE POLICY "Command tier can update recipients"
  ON public.attendance_report_recipients
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  );

CREATE POLICY "Command tier can delete recipients"
  ON public.attendance_report_recipients
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'oic'::app_role)
    OR public.has_role(auth.uid(), '2ic'::app_role)
  );