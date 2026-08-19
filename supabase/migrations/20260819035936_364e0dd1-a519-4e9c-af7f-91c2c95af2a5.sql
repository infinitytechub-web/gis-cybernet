
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Storekeeper-tier authority helper
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_procurement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'oic'::app_role)
      OR public.has_role(_user_id, '2ic'::app_role)
      OR public.has_role(_user_id, 'procurement_officer'::app_role)
      OR public.has_role(_user_id, 'storekeeper'::app_role)
$$;

REVOKE ALL ON FUNCTION public.can_manage_procurement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_procurement(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Receiving fields on the existing request tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS received_by uuid,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS receive_notes text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.purchase_requisition_items
  ADD COLUMN IF NOT EXISTS received_qty numeric NOT NULL DEFAULT 0;

-- Storekeepers need read access to work the receiving queue.
DROP POLICY IF EXISTS "Storekeepers view requisitions" ON public.purchase_requisitions;
CREATE POLICY "Storekeepers view requisitions"
ON public.purchase_requisitions FOR SELECT TO authenticated
USING (public.can_manage_procurement(auth.uid()));

DROP POLICY IF EXISTS "Storekeepers view requisition items" ON public.purchase_requisition_items;
CREATE POLICY "Storekeepers view requisition items"
ON public.purchase_requisition_items FOR SELECT TO authenticated
USING (public.can_manage_procurement(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Immutable audit trail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_request_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procurement_request_events_req_idx
  ON public.procurement_request_events (requisition_id, created_at DESC);

GRANT SELECT ON public.procurement_request_events TO authenticated;
GRANT ALL ON public.procurement_request_events TO service_role;
ALTER TABLE public.procurement_request_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View procurement trail" ON public.procurement_request_events;
CREATE POLICY "View procurement trail"
ON public.procurement_request_events FOR SELECT TO authenticated
USING (
  public.can_manage_procurement(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.purchase_requisitions r
    WHERE r.id = procurement_request_events.requisition_id
      AND r.requested_by = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.block_procurement_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Procurement trail entries are immutable';
END;
$$;

DROP TRIGGER IF EXISTS procurement_events_immutable ON public.procurement_request_events;
CREATE TRIGGER procurement_events_immutable
BEFORE UPDATE OR DELETE ON public.procurement_request_events
FOR EACH ROW EXECUTE FUNCTION public.block_procurement_event_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Request photos (private bucket register)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.procurement_request_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  kind text NOT NULL DEFAULT 'request',
  content_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS procurement_request_photos_req_idx
  ON public.procurement_request_photos (requisition_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.procurement_request_photos TO authenticated;
GRANT ALL ON public.procurement_request_photos TO service_role;
ALTER TABLE public.procurement_request_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View procurement photos" ON public.procurement_request_photos;
CREATE POLICY "View procurement photos"
ON public.procurement_request_photos FOR SELECT TO authenticated
USING (
  public.can_manage_procurement(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.purchase_requisitions r
    WHERE r.id = procurement_request_photos.requisition_id
      AND r.requested_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Attach procurement photos" ON public.procurement_request_photos;
CREATE POLICY "Attach procurement photos"
ON public.procurement_request_photos FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.can_manage_procurement(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.purchase_requisitions r
      WHERE r.id = procurement_request_photos.requisition_id
        AND r.requested_by = auth.uid()
        AND r.status IN ('draft', 'submitted')
    )
  )
);

DROP POLICY IF EXISTS "Remove procurement photos" ON public.procurement_request_photos;
CREATE POLICY "Remove procurement photos"
ON public.procurement_request_photos FOR DELETE TO authenticated
USING (
  public.can_manage_procurement(auth.uid())
  OR (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.purchase_requisitions r
      WHERE r.id = procurement_request_photos.requisition_id
        AND r.requested_by = auth.uid()
        AND r.status IN ('draft', 'submitted')
    )
  )
);

-- Storage policies for the private procurement-photos bucket
DROP POLICY IF EXISTS "procurement photos read" ON storage.objects;
CREATE POLICY "procurement photos read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'procurement-photos' AND public.can_manage_procurement(auth.uid()));

DROP POLICY IF EXISTS "procurement photos upload" ON storage.objects;
CREATE POLICY "procurement photos upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'procurement-photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "procurement photos delete" ON storage.objects;
CREATE POLICY "procurement photos delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'procurement-photos' AND public.can_manage_procurement(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Workflow RPCs (each writes its own trail entry)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.procurement_actor_name(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), staff_id, 'Unknown')
    FROM public.profiles WHERE user_id = _uid LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.procurement_actor_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_actor_name(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.procurement_request_submit(_requisition_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.purchase_requisitions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_req.requested_by <> v_uid AND NOT public.can_manage_procurement(v_uid) THEN
    RAISE EXCEPTION 'Not permitted to submit this request';
  END IF;
  IF v_req.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft requests can be submitted';
  END IF;

  UPDATE public.purchase_requisitions
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = _requisition_id;

  INSERT INTO public.procurement_request_events
    (requisition_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES
    (_requisition_id, 'submitted', 'draft', 'submitted', _note, v_uid, public.procurement_actor_name(v_uid));
END;
$$;

CREATE OR REPLACE FUNCTION public.procurement_request_decide(
  _requisition_id uuid, _approve boolean, _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.purchase_requisitions;
  v_to text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_procurement(v_uid) THEN
    RAISE EXCEPTION 'Only the storekeeper tier can approve procurement requests';
  END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted requests can be approved or rejected';
  END IF;
  IF NOT _approve AND coalesce(btrim(_note), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting a request';
  END IF;

  v_to := CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;

  UPDATE public.purchase_requisitions
     SET status = v_to,
         approved_by = v_uid,
         approved_at = now(),
         rejection_reason = CASE WHEN _approve THEN NULL ELSE _note END,
         updated_at = now()
   WHERE id = _requisition_id;

  INSERT INTO public.procurement_request_events
    (requisition_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES
    (_requisition_id, v_to, 'submitted', v_to, _note, v_uid, public.procurement_actor_name(v_uid));
END;
$$;

-- _items: [{"id":"<item uuid>","received_qty":3}, ...]
CREATE OR REPLACE FUNCTION public.procurement_request_receive(
  _requisition_id uuid, _items jsonb DEFAULT '[]'::jsonb, _note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.purchase_requisitions;
  v_row jsonb;
  v_ordered numeric;
  v_received numeric;
  v_to text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_manage_procurement(v_uid) THEN
    RAISE EXCEPTION 'Only the storekeeper tier can record goods received';
  END IF;

  SELECT * INTO v_req FROM public.purchase_requisitions WHERE id = _requisition_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status NOT IN ('approved', 'partial') THEN
    RAISE EXCEPTION 'Only approved requests can be received';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) LOOP
    UPDATE public.purchase_requisition_items i
       SET received_qty = greatest(0, least((v_row->>'received_qty')::numeric, i.quantity))
     WHERE i.id = (v_row->>'id')::uuid
       AND i.requisition_id = _requisition_id;
  END LOOP;

  SELECT coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
    INTO v_ordered, v_received
    FROM public.purchase_requisition_items
   WHERE requisition_id = _requisition_id;

  v_to := CASE
            WHEN v_ordered > 0 AND v_received >= v_ordered THEN 'received'
            WHEN v_received > 0 THEN 'partial'
            ELSE v_req.status
          END;

  UPDATE public.purchase_requisitions
     SET status = v_to,
         received_by = v_uid,
         received_at = now(),
         receive_notes = coalesce(_note, receive_notes),
         updated_at = now()
   WHERE id = _requisition_id;

  INSERT INTO public.procurement_request_events
    (requisition_id, action, from_status, to_status, note, actor_id, actor_name)
  VALUES
    (_requisition_id, 'received', v_req.status, v_to,
     coalesce(_note, '') || format(' [%s of %s units]', v_received, v_ordered),
     v_uid, public.procurement_actor_name(v_uid));

  RETURN v_to;
END;
$$;

REVOKE ALL ON FUNCTION public.procurement_request_submit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_request_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_request_receive(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_request_submit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_request_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_request_receive(uuid, jsonb, text) TO authenticated;
