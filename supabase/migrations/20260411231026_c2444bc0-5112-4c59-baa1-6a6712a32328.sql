-- Add OIC and 2IC to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'oic';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS '2ic';