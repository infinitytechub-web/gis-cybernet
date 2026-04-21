-- Office change history for staff profiles
CREATE TABLE public.profile_office_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_office TEXT,
  new_office TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE INDEX idx_profile_office_history_profile ON public.profile_office_history(profile_id, changed_at DESC);

ALTER TABLE public.profile_office_history ENABLE ROW LEVEL SECURITY;

-- Authenticated staff can read office history (same visibility as the profile itself)
CREATE POLICY "Authenticated can view office history"
ON public.profile_office_history
FOR SELECT
TO authenticated
USING (true);

-- Only command-tier roles can write entries; aligns with who can edit Office on the profile
CREATE POLICY "Command tier can insert office history"
ON public.profile_office_history
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'oic')
  OR public.has_role(auth.uid(), '2ic')
  OR public.has_role(auth.uid(), 'staff_officer')
  OR public.has_role(auth.uid(), 'supervisor')
);

-- Auto-log every office change via trigger so history stays in sync even if a row is updated elsewhere
CREATE OR REPLACE FUNCTION public.log_profile_office_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.office IS DISTINCT FROM OLD.office) THEN
    INSERT INTO public.profile_office_history (profile_id, previous_office, new_office, changed_by)
    VALUES (NEW.id, OLD.office, NEW.office, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_profile_office_change
AFTER UPDATE OF office ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_office_change();