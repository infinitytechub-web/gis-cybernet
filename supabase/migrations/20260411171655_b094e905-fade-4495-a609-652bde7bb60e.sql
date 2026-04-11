
CREATE TABLE public.night_guard_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'online' or 'offline'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.night_guard_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage night guard activity log"
ON public.night_guard_activity_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view night guard activity log"
ON public.night_guard_activity_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "Users can insert own activity log"
ON public.night_guard_activity_log
FOR INSERT
TO authenticated
WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own activity log"
ON public.night_guard_activity_log
FOR SELECT
TO authenticated
USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE INDEX idx_night_guard_activity_created ON public.night_guard_activity_log(created_at DESC);
CREATE INDEX idx_night_guard_activity_profile ON public.night_guard_activity_log(profile_id);
