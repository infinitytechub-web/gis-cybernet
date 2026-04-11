
CREATE TABLE public.platform_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  action TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'success',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync history"
  ON public.platform_sync_history FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own sync history"
  ON public.platform_sync_history FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all sync history"
  ON public.platform_sync_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_sync_history_profile ON public.platform_sync_history(profile_id, synced_at DESC);
