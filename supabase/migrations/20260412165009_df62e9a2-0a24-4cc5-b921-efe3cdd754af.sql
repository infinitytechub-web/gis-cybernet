
-- Create report_schedules table for automated report generation
CREATE TABLE public.report_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type text NOT NULL CHECK (report_type IN ('staff', 'attendance', 'leave')),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (report_type, frequency)
);

-- Enable RLS
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

-- Admins can fully manage schedules
CREATE POLICY "Admins can manage report schedules"
ON public.report_schedules
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Supervisors can view schedules
CREATE POLICY "Supervisors can view report schedules"
ON public.report_schedules
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'supervisor'));

-- Timestamp trigger
CREATE TRIGGER update_report_schedules_updated_at
BEFORE UPDATE ON public.report_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
