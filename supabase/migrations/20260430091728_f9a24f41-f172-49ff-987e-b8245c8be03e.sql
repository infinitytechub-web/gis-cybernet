
CREATE TABLE IF NOT EXISTS public.confidentiality_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  description text,
  pinned boolean NOT NULL DEFAULT false,
  sort_hint integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_pinned_name ON public.confidentiality_commands(pinned DESC, name ASC);

ALTER TABLE public.confidentiality_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view commands"
  ON public.confidentiality_commands FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert commands"
  ON public.confidentiality_commands FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update commands"
  ON public.confidentiality_commands FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete commands"
  ON public.confidentiality_commands FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cc_updated_at
  BEFORE UPDATE ON public.confidentiality_commands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.confidentiality_commands (name, slug, pinned) VALUES
  ('National Headquarters, Accra', 'national-hq-accra', true),
  ('Abokobi Sector Command', 'abokobi-sector', false),
  ('Adenta Sector Command', 'adenta-sector', false),
  ('AIA Command', 'aia-command', false),
  ('Kasoa Sector Command', 'kasoa-sector', false),
  ('Legon Command', 'legon-command', false),
  ('Millennium City Command', 'millennium-city', false),
  ('Regional Headquarters (All Regions)', 'regional-hq-all', false),
  ('Tema Regional Command', 'tema-regional', false),
  ('Weija Sector Command', 'weija-sector', false)
ON CONFLICT (slug) DO NOTHING;
