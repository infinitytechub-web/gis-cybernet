ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS staff_category text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_staff_category_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_staff_category_check CHECK (staff_category IS NULL OR staff_category IN ('Cadet','Recruit'));