ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS enable_system_health_widget boolean NOT NULL DEFAULT true;