
-- 1. Normalize/dedupe staff arrays on every proposal write
CREATE OR REPLACE FUNCTION public.normalize_rotation_proposal_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_scope text;
  v_ids uuid[];
  v_clean_ids uuid[];
  v_staff_ids text[];
  v_names text[];
BEGIN
  v_scope := COALESCE(NEW.pattern->>'scope', 'unit_wide');
  IF v_scope <> 'reassignment' THEN
    RETURN NEW;
  END IF;

  -- Pull staff_profile_ids array from JSON, dedupe, drop NULLs
  SELECT ARRAY(
    SELECT DISTINCT (j)::uuid
    FROM jsonb_array_elements_text(COALESCE(NEW.pattern->'staff_profile_ids','[]'::jsonb)) AS j
    WHERE j IS NOT NULL AND j <> ''
  ) INTO v_ids;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    -- Whole-group reassignment: ensure arrays exist as empty
    NEW.pattern := jsonb_set(
      jsonb_set(
        jsonb_set(NEW.pattern, '{staff_profile_ids}', '[]'::jsonb, true),
        '{staff_ids}', '[]'::jsonb, true),
      '{staff_names}', '[]'::jsonb, true);
    RETURN NEW;
  END IF;

  -- Filter to existing profiles only and rebuild parallel arrays in sorted order
  SELECT
    array_agg(p.id ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST),
    array_agg(COALESCE(p.staff_id,'') ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST),
    array_agg(
      trim(both ' ,' from
        COALESCE(p.last_name,'') || ', ' || COALESCE(p.first_name,'')
      )
      ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST
    )
  INTO v_clean_ids, v_staff_ids, v_names
  FROM public.profiles p
  WHERE p.id = ANY(v_ids);

  NEW.pattern := jsonb_set(
    jsonb_set(
      jsonb_set(NEW.pattern,
        '{staff_profile_ids}', to_jsonb(COALESCE(v_clean_ids, ARRAY[]::uuid[])), true),
      '{staff_ids}', to_jsonb(COALESCE(v_staff_ids, ARRAY[]::text[])), true),
    '{staff_names}', to_jsonb(COALESCE(v_names, ARRAY[]::text[])), true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_rotation_proposal_staff ON public.rotation_change_proposals;
CREATE TRIGGER trg_normalize_rotation_proposal_staff
  BEFORE INSERT OR UPDATE OF pattern ON public.rotation_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.normalize_rotation_proposal_staff();

-- 2. Tighten conflict check: detect staff-level intersections on overlapping dates
CREATE OR REPLACE FUNCTION public.check_rotation_proposal_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_scope text;
  v_target_group text;
  v_date_from date;
  v_date_to date;
  v_my_ids uuid[];
  v_conflict record;
BEGIN
  IF NEW.status NOT IN ('pending','approved') THEN
    RETURN NEW;
  END IF;

  v_scope := COALESCE(NEW.pattern->>'scope', 'unit_wide');

  IF v_scope = 'reassignment' THEN
    v_target_group := COALESCE(NEW.pattern->>'target_group', 'ALL');
    v_date_from := COALESCE((NEW.pattern->>'date_from')::date, NEW.effective_from);
    v_date_to := COALESCE((NEW.pattern->>'date_to')::date, NEW.effective_from);

    SELECT ARRAY(
      SELECT DISTINCT (j)::uuid
      FROM jsonb_array_elements_text(COALESCE(NEW.pattern->'staff_profile_ids','[]'::jsonb)) AS j
      WHERE j IS NOT NULL AND j <> ''
    ) INTO v_my_ids;

    -- (a) Group-level overlap (only when this proposal targets a whole group)
    IF v_my_ids IS NULL OR array_length(v_my_ids,1) IS NULL THEN
      SELECT id, title, pattern->>'target_group' AS tg,
             pattern->>'date_from' AS df, pattern->>'date_to' AS dt
        INTO v_conflict
        FROM public.rotation_change_proposals
       WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND status IN ('pending','approved','applied')
         AND COALESCE(pattern->>'scope','unit_wide') = 'reassignment'
         AND (
              jsonb_array_length(COALESCE(pattern->'staff_profile_ids','[]'::jsonb)) = 0
         )
         AND (
              pattern->>'target_group' = v_target_group
           OR pattern->>'target_group' = 'ALL'
           OR v_target_group = 'ALL'
         )
         AND daterange(
               COALESCE((pattern->>'date_from')::date, effective_from),
               COALESCE((pattern->>'date_to')::date, effective_from),
               '[]'
             ) && daterange(v_date_from, v_date_to, '[]')
       LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION
          'Rotation reassignment conflicts with proposal "%" (group %, % to %). Withdraw or wait for that decision before submitting.',
          v_conflict.title, v_conflict.tg, v_conflict.df, v_conflict.dt
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- (b) Staff-level overlap: any active proposal whose staff list intersects ours on overlapping dates
      SELECT id, title,
             pattern->>'date_from' AS df, pattern->>'date_to' AS dt,
             ARRAY(SELECT (j)::uuid FROM jsonb_array_elements_text(COALESCE(pattern->'staff_profile_ids','[]'::jsonb)) AS j) AS ids
        INTO v_conflict
        FROM public.rotation_change_proposals
       WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND status IN ('pending','approved','applied')
         AND COALESCE(pattern->>'scope','unit_wide') = 'reassignment'
         AND daterange(
               COALESCE((pattern->>'date_from')::date, effective_from),
               COALESCE((pattern->>'date_to')::date, effective_from),
               '[]'
             ) && daterange(v_date_from, v_date_to, '[]')
         AND (
              -- other proposal also targets specific staff that intersect ours
              (jsonb_array_length(COALESCE(pattern->'staff_profile_ids','[]'::jsonb)) > 0
               AND EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements_text(pattern->'staff_profile_ids') o(j)
                 WHERE (o.j)::uuid = ANY(v_my_ids)
               ))
              OR
              -- other proposal is whole-group and covers the same group as any of our staff
              (jsonb_array_length(COALESCE(pattern->'staff_profile_ids','[]'::jsonb)) = 0
               AND (
                 pattern->>'target_group' = 'ALL'
                 OR EXISTS (
                   SELECT 1 FROM public.profiles p
                   WHERE p.id = ANY(v_my_ids)
                     AND p.shift_group = pattern->>'target_group'
                 )
               ))
         )
       LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION
          'Rotation reassignment conflicts with proposal "%" (% to %): one or more selected staff are already targeted by an active proposal in this date range.',
          v_conflict.title, v_conflict.df, v_conflict.dt
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

  ELSE
    SELECT id, title, effective_from
      INTO v_conflict
      FROM public.rotation_change_proposals
     WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND status IN ('pending','approved','applied')
       AND COALESCE(pattern->>'scope','unit_wide') <> 'reassignment'
       AND ABS(EXTRACT(EPOCH FROM (effective_from - NEW.effective_from)) / 86400) < 30
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'A cycle-pattern proposal "%" with effective date % is already in flight within 30 days of this one.',
        v_conflict.title, v_conflict.effective_from
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
