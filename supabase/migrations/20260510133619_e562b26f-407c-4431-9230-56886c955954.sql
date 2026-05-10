
CREATE TABLE IF NOT EXISTS public.profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  requested_changes JSONB NOT NULL,
  previous_values JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewer_id UUID,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcr_profile ON public.profile_change_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_pcr_status ON public.profile_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_pcr_user ON public.profile_change_requests(user_id);

ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can create own change requests"
ON public.profile_change_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner or command can read change requests"
ON public.profile_change_requests FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_command_tier(auth.uid()));

CREATE POLICY "owner can cancel own pending request"
ON public.profile_change_requests FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "command tier can review change requests"
ON public.profile_change_requests FOR UPDATE
TO authenticated
USING (public.is_command_tier(auth.uid()))
WITH CHECK (public.is_command_tier(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_profile_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
  v TEXT;
  allowed TEXT[] := ARRAY[
    'first_name','last_name','gender','date_of_birth','marital_status',
    'phone','email','ghana_card_number','blood_group','office',
    'training_designation','staff_category','photo_url'
  ];
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    FOR k, v IN SELECT key, value::text FROM jsonb_each_text(NEW.requested_changes) LOOP
      IF k = ANY(allowed) THEN
        EXECUTE format('UPDATE public.profiles SET %I = $1, updated_at = now() WHERE id = $2', k)
          USING NULLIF(v, ''), NEW.profile_id;
      END IF;
    END LOOP;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_profile_change_request ON public.profile_change_requests;
CREATE TRIGGER trg_apply_profile_change_request
BEFORE UPDATE ON public.profile_change_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_profile_change_request();

ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_change_requests;
