
ALTER TABLE public.leave_requests       ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE public.excuse_duty_forms    ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE public.postings_transfers   ADD COLUMN IF NOT EXISTS attachment_path text;
