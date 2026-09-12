ALTER TYPE public.staff_status ADD VALUE IF NOT EXISTS 'partially_active';
ALTER TYPE public.staff_status ADD VALUE IF NOT EXISTS 'retired';
ALTER TYPE public.staff_status ADD VALUE IF NOT EXISTS 'interdicted';