-- Singleton table holding the shift-rotation configuration.
CREATE TABLE public.shift_rotation_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  anchor_date DATE NOT NULL DEFAULT '2026-05-01',
  pattern TEXT[] NOT NULL DEFAULT ARRAY['A','B','C','D'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT shift_rotation_config_singleton CHECK (id = TRUE),
  CONSTRAINT shift_rotation_config_pattern_nonempty CHECK (array_length(pattern, 1) BETWEEN 1 AND 12)
);

-- Seed the singleton row.
INSERT INTO public.shift_rotation_config (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.shift_rotation_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the active rotation.
CREATE POLICY "Authenticated can read rotation config"
ON public.shift_rotation_config
FOR SELECT
TO authenticated
USING (TRUE);

-- Only admins can update.
CREATE POLICY "Admins can update rotation config"
ON public.shift_rotation_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Touch updated_at / updated_by on every change.
CREATE OR REPLACE FUNCTION public.touch_shift_rotation_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  -- Validate every entry in pattern is a single uppercase letter A-Z.
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.pattern) AS p WHERE p !~ '^[A-Z]$'
  ) THEN
    RAISE EXCEPTION 'pattern entries must each be a single uppercase letter (A-Z)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shift_rotation_config_touch
BEFORE UPDATE ON public.shift_rotation_config
FOR EACH ROW EXECUTE FUNCTION public.touch_shift_rotation_config();

-- Realtime so the self-view calendar updates instantly when an admin saves.
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_rotation_config;