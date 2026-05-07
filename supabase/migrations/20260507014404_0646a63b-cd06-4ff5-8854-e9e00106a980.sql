-- DOB on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

-- New medical officer role for Health Lab scoping
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'medical_officer';

-- Helper view: birthdays for active staff (year-agnostic)
CREATE OR REPLACE VIEW public.staff_birthdays AS
SELECT
  p.id,
  p.user_id,
  p.first_name,
  p.last_name,
  p.staff_id,
  p.department_id,
  p.photo_url,
  p.date_of_birth,
  EXTRACT(MONTH FROM p.date_of_birth)::int AS bday_month,
  EXTRACT(DAY   FROM p.date_of_birth)::int AS bday_day
FROM public.profiles p
WHERE p.status = 'active' AND p.date_of_birth IS NOT NULL;

GRANT SELECT ON public.staff_birthdays TO authenticated;