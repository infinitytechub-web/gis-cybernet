-- Add Processing chain-of-command roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'head_of_processing';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'deputy_head_of_processing';