
CREATE TABLE IF NOT EXISTS public.email_domain_status (
  domain TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  became_active_at TIMESTAMPTZ,
  notified_active BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_domain_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read email_domain_status"
ON public.email_domain_status FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins modify email_domain_status"
ON public.email_domain_status FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the row for our sender domain
INSERT INTO public.email_domain_status (domain, status)
VALUES ('notify.gis-cybernet.com', 'pending')
ON CONFLICT (domain) DO NOTHING;
