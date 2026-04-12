
-- Create app_settings table (singleton pattern)
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_name text NOT NULL DEFAULT 'GIS Amasaman Sector Command',
  system_label text NOT NULL DEFAULT 'Cybernet',
  auto_logout_minutes integer NOT NULL DEFAULT 30,
  enforce_password_change boolean NOT NULL DEFAULT true,
  min_password_length integer NOT NULL DEFAULT 8,
  allow_self_registration boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure only one row exists
CREATE UNIQUE INDEX app_settings_singleton ON public.app_settings ((true));

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage app settings"
ON public.app_settings FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can read settings
CREATE POLICY "Authenticated users can view app settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.app_settings (org_name, system_label) VALUES ('GIS Amasaman Sector Command', 'Cybernet');
