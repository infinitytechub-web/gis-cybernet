CREATE TABLE public.command_rank_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_unit_id uuid REFERENCES public.org_units(id) ON DELETE CASCADE,
  rank_id uuid NOT NULL REFERENCES public.ranks(id) ON DELETE CASCADE,
  is_visible boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX command_rank_visibility_unit_rank_key
  ON public.command_rank_visibility (COALESCE(org_unit_id, '00000000-0000-0000-0000-000000000000'::uuid), rank_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_rank_visibility TO authenticated;
GRANT ALL ON public.command_rank_visibility TO service_role;

ALTER TABLE public.command_rank_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY command_rank_visibility_read ON public.command_rank_visibility
  FOR SELECT TO authenticated USING (true);

CREATE POLICY command_rank_visibility_admin_write ON public.command_rank_visibility
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER command_rank_visibility_updated_at
  BEFORE UPDATE ON public.command_rank_visibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rank visible on a command dashboard: the command's own setting wins, then the
-- service-wide default row, otherwise visible.
CREATE OR REPLACE FUNCTION public.rank_visible_on_dashboard(_org_unit_id uuid, _rank_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT v.is_visible FROM public.command_rank_visibility v
      WHERE v.rank_id = _rank_id AND v.org_unit_id = _org_unit_id),
    (SELECT v.is_visible FROM public.command_rank_visibility v
      WHERE v.rank_id = _rank_id AND v.org_unit_id IS NULL),
    true
  )
$$;

REVOKE ALL ON FUNCTION public.rank_visible_on_dashboard(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rank_visible_on_dashboard(uuid, uuid) TO authenticated, service_role;