CREATE TABLE IF NOT EXISTS public.rum_events (
  id           bigserial PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  kind         text        NOT NULL,
  route        text,
  value        double precision,
  rating       text,
  meta         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   text,
  build_id     text,
  ua           text,
  viewport     text
);

CREATE INDEX IF NOT EXISTS rum_events_created_at_idx ON public.rum_events (created_at DESC);
CREATE INDEX IF NOT EXISTS rum_events_kind_idx       ON public.rum_events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS rum_events_route_idx      ON public.rum_events (route, kind, created_at DESC);

GRANT SELECT ON public.rum_events TO authenticated;
GRANT ALL    ON public.rum_events TO service_role;

ALTER TABLE public.rum_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY rum_events_admin_read
  ON public.rum_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));