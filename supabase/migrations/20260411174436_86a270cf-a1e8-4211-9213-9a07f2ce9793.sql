-- Remove duplicate shift_assignments, keeping only the earliest created row per (profile_id, shift_id, start_date)
DELETE FROM public.shift_assignments
WHERE id NOT IN (
  SELECT DISTINCT ON (profile_id, shift_id, start_date) id
  FROM public.shift_assignments
  ORDER BY profile_id, shift_id, start_date, created_at ASC
);

-- Now add the unique constraint
ALTER TABLE public.shift_assignments
ADD CONSTRAINT unique_profile_shift_date UNIQUE (profile_id, shift_id, start_date);