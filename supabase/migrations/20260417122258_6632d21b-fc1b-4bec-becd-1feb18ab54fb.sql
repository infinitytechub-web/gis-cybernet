-- Multiple contacts per staff member
CREATE TABLE public.profile_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL DEFAULT 'mobile',
  label TEXT,
  value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_contacts_profile_id ON public.profile_contacts(profile_id);

ALTER TABLE public.profile_contacts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view contacts (matches profile visibility)
CREATE POLICY "Authenticated users can view profile contacts"
ON public.profile_contacts FOR SELECT
TO authenticated
USING (true);

-- Owners can manage their own contacts
CREATE POLICY "Users can insert their own contacts"
ON public.profile_contacts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can update their own contacts"
ON public.profile_contacts FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can delete their own contacts"
ON public.profile_contacts FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER update_profile_contacts_updated_at
BEFORE UPDATE ON public.profile_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();