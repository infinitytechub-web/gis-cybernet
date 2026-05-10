ALTER TABLE public.passport_applications
  ADD COLUMN IF NOT EXISTS mfa_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS mfa_review_notes text,
  ADD COLUMN IF NOT EXISTS mfa_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS mfa_reviewed_at timestamptz;

ALTER TABLE public.passport_applications
  DROP CONSTRAINT IF EXISTS passport_applications_mfa_review_status_check;

ALTER TABLE public.passport_applications
  ADD CONSTRAINT passport_applications_mfa_review_status_check
  CHECK (mfa_review_status IN ('pending', 'approved', 'rejected'));