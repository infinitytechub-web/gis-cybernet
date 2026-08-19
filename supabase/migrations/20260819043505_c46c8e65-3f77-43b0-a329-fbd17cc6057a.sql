CREATE TABLE public.ghana_regional_capitals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region text NOT NULL UNIQUE,
  capital text NOT NULL,
  district_id uuid REFERENCES public.ghana_districts(id) ON DELETE SET NULL,
  district_code text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ghana_regional_capitals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ghana_regional_capitals TO authenticated;
GRANT ALL ON public.ghana_regional_capitals TO service_role;

ALTER TABLE public.ghana_regional_capitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can read regional capitals"
ON public.ghana_regional_capitals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage the regional capital register"
ON public.ghana_regional_capitals FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ghana_regional_capitals_district ON public.ghana_regional_capitals(district_id);

CREATE TRIGGER trg_ghana_regional_capitals_updated_at
BEFORE UPDATE ON public.ghana_regional_capitals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();