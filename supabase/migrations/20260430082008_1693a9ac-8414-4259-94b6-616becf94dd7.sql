-- Add 'head_of_administration' and 'chief_staff_officer' as new command-tier roles.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'head_of_administration';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chief_staff_officer';