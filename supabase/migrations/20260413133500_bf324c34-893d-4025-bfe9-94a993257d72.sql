
CREATE TABLE public.processing_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  result jsonb DEFAULT '{}'::jsonb,
  error text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage processing jobs"
  ON public.processing_jobs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own jobs"
  ON public.processing_jobs FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER update_processing_jobs_updated_at
  BEFORE UPDATE ON public.processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
