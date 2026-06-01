-- ============================================================
-- portfolios  +  profile_portfolios  (many-to-many)
-- ============================================================

CREATE TABLE public.portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolios are viewable by authenticated"
  ON public.portfolios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Command tier can insert portfolios"
  ON public.portfolios FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Command tier can update portfolios"
  ON public.portfolios FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Admin can delete portfolios"
  ON public.portfolios FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ---------- join table ----------
CREATE TABLE public.profile_portfolios (
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  assigned_by  UUID,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, portfolio_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_portfolios TO authenticated;
GRANT ALL ON public.profile_portfolios TO service_role;

ALTER TABLE public.profile_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments viewable by authenticated"
  ON public.profile_portfolios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Command tier can assign portfolios"
  ON public.profile_portfolios FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Command tier can unassign portfolios"
  ON public.profile_portfolios FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'oic')
    OR public.has_role(auth.uid(), '2ic')
    OR public.has_role(auth.uid(), 'staff_officer')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE INDEX idx_profile_portfolios_profile ON public.profile_portfolios(profile_id);
CREATE INDEX idx_profile_portfolios_portfolio ON public.profile_portfolios(portfolio_id);


-- ---------- seed common portfolios ----------
INSERT INTO public.portfolios (name, description) VALUES
  ('Operations Lead',     'Day-to-day operations command'),
  ('Welfare Officer',     'Staff welfare and morale'),
  ('IT / Cybernet',       'Information systems & networks'),
  ('Logistics',           'Supplies, transport, equipment'),
  ('Training Officer',    'Onboarding and continuous training'),
  ('Discipline',          'Conduct, grievances, internal affairs'),
  ('Health & Safety',     'Medical, OSH and incident response'),
  ('Front Desk Lead',     'Visa, passport, walk-in coordination'),
  ('Procurement',         'Purchase requests and vendor liaison')
ON CONFLICT (name) DO NOTHING;