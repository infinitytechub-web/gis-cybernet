-- Singleton table for editable Interlink branding (title + tagline)
CREATE TABLE IF NOT EXISTS public.interlink_branding (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  title TEXT NOT NULL DEFAULT 'Interlink System',
  tagline TEXT NOT NULL DEFAULT 'Command-tier dispatch hub: Intranet · Internet · Extranet',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT interlink_branding_singleton CHECK (id = true)
);

-- Seed the singleton row
INSERT INTO public.interlink_branding (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.interlink_branding ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated may read branding (it's display text)
DROP POLICY IF EXISTS "Authenticated can read interlink branding"
  ON public.interlink_branding;
CREATE POLICY "Authenticated can read interlink branding"
  ON public.interlink_branding
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins may update branding
DROP POLICY IF EXISTS "Admins can update interlink branding"
  ON public.interlink_branding;
CREATE POLICY "Admins can update interlink branding"
  ON public.interlink_branding
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger: keep updated_at + updated_by current, block non-admin writes defensively
CREATE OR REPLACE FUNCTION public.interlink_branding_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins may modify Interlink branding';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interlink_branding_touch_trg ON public.interlink_branding;
CREATE TRIGGER interlink_branding_touch_trg
  BEFORE UPDATE ON public.interlink_branding
  FOR EACH ROW EXECUTE FUNCTION public.interlink_branding_touch();

-- Realtime so all open clients update instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.interlink_branding;