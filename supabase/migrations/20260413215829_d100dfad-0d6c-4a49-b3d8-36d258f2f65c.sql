
-- Disable user-defined triggers that block updates
ALTER TABLE public.profiles DISABLE TRIGGER restrict_profile_updates;
ALTER TABLE public.profiles DISABLE TRIGGER enforce_profile_field_restrictions;

-- Clear department for all Night Guard staff
UPDATE profiles
SET department_id = NULL, updated_at = now()
WHERE department_id = (SELECT id FROM departments WHERE name ILIKE '%night guard%' LIMIT 1);

-- Re-enable triggers
ALTER TABLE public.profiles ENABLE TRIGGER restrict_profile_updates;
ALTER TABLE public.profiles ENABLE TRIGGER enforce_profile_field_restrictions;
