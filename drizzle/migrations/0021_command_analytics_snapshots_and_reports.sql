CREATE TABLE IF NOT EXISTS public.command_analytics_snapshots (
  org_unit_id uuid NOT NULL REFERENCES public.org_units(id) ON DELETE CASCADE,
  snap_date date NOT NULL DEFAULT current_date,
  total integer NOT NULL DEFAULT 0,
  active integer NOT NULL DEFAULT 0,
  authorised integer,
  PRIMARY KEY (org_unit_id, snap_date)
);
GRANT SELECT ON public.command_analytics_snapshots TO authenticated;
GRANT ALL ON public.command_analytics_snapshots TO service_role;
ALTER TABLE public.command_analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots visible within scope" ON public.command_analytics_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR org_unit_id IN (SELECT public.user_org_scope(auth.uid())));

CREATE OR REPLACE FUNCTION public.snapshot_command_analytics()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  INSERT INTO command_analytics_snapshots(org_unit_id, snap_date, total, active, authorised)
  SELECT u.id, current_date,
    (SELECT count(*) FROM profiles p WHERE p.deleted_at IS NULL AND p.org_unit_id IN (SELECT org_unit_descendants(u.id))),
    (SELECT count(*) FROM profiles p WHERE p.deleted_at IS NULL AND p.status::text='active' AND p.org_unit_id IN (SELECT org_unit_descendants(u.id))),
    u.authorised_strength
  FROM org_units u
  ON CONFLICT (org_unit_id, snap_date) DO UPDATE SET total=EXCLUDED.total, active=EXCLUDED.active, authorised=EXCLUDED.authorised;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_command_analytics() FROM PUBLIC, anon, authenticated;

-- Trend baseline: the snapshot nearest to N days ago, scoped to caller.
CREATE OR REPLACE FUNCTION public.command_analytics_baseline(_days integer DEFAULT 7)
RETURNS TABLE(org_unit_id uuid, snap_date date, total integer, active integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (s.org_unit_id) s.org_unit_id, s.snap_date, s.total, s.active
  FROM command_analytics_snapshots s
  WHERE s.snap_date <= current_date - greatest(_days,1)
    AND (has_role(auth.uid(),'admin') OR s.org_unit_id IN (SELECT user_org_scope(auth.uid())))
  ORDER BY s.org_unit_id, s.snap_date DESC;
$$;
REVOKE ALL ON FUNCTION public.command_analytics_baseline(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_analytics_baseline(integer) TO authenticated;

-- Weekly scheduled summary delivered to each commander's notifications.
CREATE OR REPLACE FUNCTION public.send_weekly_command_summary()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _n integer := 0; _prev record; _vac int;
BEGIN
  PERFORM snapshot_command_analytics();
  FOR r IN
    SELECT DISTINCT ur.user_id, p.org_unit_id, u.name, s.total, s.active, s.authorised
    FROM user_roles ur JOIN profiles p ON p.user_id = ur.user_id
    JOIN org_units u ON u.id = p.org_unit_id
    JOIN command_analytics_snapshots s ON s.org_unit_id = u.id AND s.snap_date = current_date
    WHERE ur.role IN ('oic','2ic','command_officer') AND p.deleted_at IS NULL
  LOOP
    SELECT total, active INTO _prev FROM command_analytics_snapshots
     WHERE org_unit_id = r.org_unit_id AND snap_date <= current_date - 7 ORDER BY snap_date DESC LIMIT 1;
    _vac := CASE WHEN r.authorised IS NOT NULL THEN greatest(r.authorised - r.active, 0) END;
    INSERT INTO notifications(user_id, title, message, type, reference_id)
    VALUES (r.user_id, 'Weekly command summary — '||r.name,
      format('Strength %s (active %s)%s%s.', r.total, r.active,
        CASE WHEN _prev.total IS NOT NULL THEN format(', %s%s vs last week', CASE WHEN r.total-_prev.total>=0 THEN '+' ELSE '' END, r.total-_prev.total) ELSE '' END,
        CASE WHEN _vac IS NOT NULL THEN format(', %s vacancies against %s authorised', _vac, r.authorised) ELSE '' END),
      'weekly_summary', r.org_unit_id);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.send_weekly_command_summary() FROM PUBLIC, anon, authenticated;

SELECT public.snapshot_command_analytics();
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('command-analytics-daily-snapshot','command-weekly-summary');
SELECT cron.schedule('command-analytics-daily-snapshot', '10 0 * * *', $$SELECT public.snapshot_command_analytics()$$);
SELECT cron.schedule('command-weekly-summary', '0 7 * * 1', $$SELECT public.send_weekly_command_summary()$$);