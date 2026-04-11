
CREATE TABLE public.shift_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_username TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  offline_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, platform)
);

ALTER TABLE public.shift_platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.shift_platform_connections FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own connections"
  ON public.shift_platform_connections FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own connections"
  ON public.shift_platform_connections FOR UPDATE TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own connections"
  ON public.shift_platform_connections FOR DELETE TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can view all connections"
  ON public.shift_platform_connections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
