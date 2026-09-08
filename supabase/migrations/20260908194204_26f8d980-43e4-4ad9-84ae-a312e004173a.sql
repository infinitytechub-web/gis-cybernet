-- Self-service enrolment: a credential is created on the officer's own device
-- with user verification (fingerprint/face) already proven, so it is active
-- immediately. Administrators retain reject/revoke control afterwards.
ALTER TABLE public.webauthn_credentials
  ALTER COLUMN approval_status SET DEFAULT 'approved';

UPDATE public.webauthn_credentials
   SET approval_status = 'approved',
       approved_at = COALESCE(approved_at, now()),
       approval_notes = COALESCE(approval_notes, 'Auto-approved on self-enrolment'),
       updated_at = now()
 WHERE approval_status = 'pending'
   AND revoked_at IS NULL;