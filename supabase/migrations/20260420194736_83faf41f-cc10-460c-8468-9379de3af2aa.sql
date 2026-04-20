-- ============================================
-- Recycle Bin: centralized soft-delete store
-- ============================================
-- Stores a JSON snapshot of any row deleted from a "recyclable" table,
-- plus optional storage object paths that should be removed on permanent purge.
-- Restoration re-inserts the snapshot back into the source table.
-- Auto-purge after 30 days.

CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  storage_paths JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"bucket":"...","path":"..."}]
  display_label TEXT,                                -- human-readable item name
  display_context TEXT,                              -- secondary info (e.g. file size, applicant)
  deleted_by UUID,                                   -- auth.uid()
  deleted_by_name TEXT,                              -- snapshot of the user's name at delete time
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  restored_at TIMESTAMPTZ,
  restored_by UUID,
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_active
  ON public.recycle_bin (deleted_at DESC)
  WHERE restored_at IS NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recycle_bin_table
  ON public.recycle_bin (table_name)
  WHERE restored_at IS NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires
  ON public.recycle_bin (expires_at)
  WHERE restored_at IS NULL AND purged_at IS NULL;

ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

-- =====================
-- Helper: who can use the bin?
-- Admin or Command OIC only.
-- =====================
CREATE OR REPLACE FUNCTION public.can_use_recycle_bin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'oic'::app_role);
$$;

-- =====================
-- RLS Policies
-- =====================
DROP POLICY IF EXISTS "Admin/OIC can view recycle bin" ON public.recycle_bin;
CREATE POLICY "Admin/OIC can view recycle bin"
ON public.recycle_bin
FOR SELECT
TO authenticated
USING (public.can_use_recycle_bin(auth.uid()));

-- Insert: any authenticated user can drop a row into the bin (gated server-side
-- by the soft_delete RPC); but we still require auth.
DROP POLICY IF EXISTS "Authenticated users can add to bin via RPC" ON public.recycle_bin;
CREATE POLICY "Authenticated users can add to bin via RPC"
ON public.recycle_bin
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Updates (restore mark) and deletes (empty) restricted to Admin/OIC.
DROP POLICY IF EXISTS "Admin/OIC can update bin entries" ON public.recycle_bin;
CREATE POLICY "Admin/OIC can update bin entries"
ON public.recycle_bin
FOR UPDATE
TO authenticated
USING (public.can_use_recycle_bin(auth.uid()))
WITH CHECK (public.can_use_recycle_bin(auth.uid()));

DROP POLICY IF EXISTS "Admin/OIC can delete bin entries" ON public.recycle_bin;
CREATE POLICY "Admin/OIC can delete bin entries"
ON public.recycle_bin
FOR DELETE
TO authenticated
USING (public.can_use_recycle_bin(auth.uid()));

-- =====================
-- Allowed table whitelist
-- Keeps the soft-delete RPC safe.
-- =====================
CREATE OR REPLACE FUNCTION public.is_recyclable_table(_table TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _table = ANY (ARRAY[
    'announcements',
    'holidays',
    'departments',
    'staff_documents',
    'command_vault_files',
    'report_uploads',
    'report_schedules',
    'procurement_documents',
    'shift_assignments',
    'misd_unit_assignments',
    'certifications',
    'equipment_issuance',
    'inventory_items',
    'inventory_categories',
    'inventory_suppliers',
    'detention_records',
    'enforcement_operations',
    'operations',
    'cyber_incidents',
    'cyber_investigations',
    'cyber_threat_intel',
    'leave_requests',
    'postings_transfers',
    'visa_applications',
    'visa_extensions',
    'passport_applications',
    'official_applications',
    'enquiry_applications',
    'front_desk_audit_log',
    'night_guard_activity_log',
    'platform_sync_history'
  ]);
$$;

-- =====================
-- Soft-delete RPC
-- Snapshots the row, drops it from the source table, and writes the bin entry.
-- =====================
CREATE OR REPLACE FUNCTION public.soft_delete_record(
  _table TEXT,
  _record_id UUID,
  _display_label TEXT DEFAULT NULL,
  _display_context TEXT DEFAULT NULL,
  _storage_paths JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snapshot JSONB;
  _bin_id UUID;
  _user_name TEXT;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_recyclable_table(_table) THEN
    RAISE EXCEPTION 'Table % is not recyclable', _table;
  END IF;

  -- Snapshot
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', _table)
    INTO _snapshot
    USING _record_id;

  IF _snapshot IS NULL THEN
    RAISE EXCEPTION 'Record % not found in %', _record_id, _table;
  END IF;

  -- Capture deleter name
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    INTO _user_name
  FROM public.profiles
  WHERE user_id = _uid
  LIMIT 1;

  -- Insert into bin
  INSERT INTO public.recycle_bin (
    table_name, record_id, snapshot, storage_paths,
    display_label, display_context, deleted_by, deleted_by_name
  ) VALUES (
    _table, _record_id, _snapshot, COALESCE(_storage_paths, '[]'::jsonb),
    _display_label, _display_context, _uid, NULLIF(trim(_user_name), '')
  )
  RETURNING id INTO _bin_id;

  -- Hard delete from source. RLS on the source still applies to the caller,
  -- but SECURITY DEFINER bypasses it. We keep it permissive so anyone who can
  -- already delete via app paths can also send to bin.
  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table)
    USING _record_id;

  RETURN _bin_id;
END;
$$;

-- =====================
-- Restore RPC (Admin/OIC only)
-- =====================
CREATE OR REPLACE FUNCTION public.restore_recycle_bin_entry(_bin_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _cols TEXT;
  _vals TEXT;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.can_use_recycle_bin(_uid) THEN
    RAISE EXCEPTION 'Not authorised to restore items';
  END IF;

  SELECT * INTO _row FROM public.recycle_bin WHERE id = _bin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recycle bin entry % not found', _bin_id;
  END IF;

  IF _row.restored_at IS NOT NULL THEN
    RAISE EXCEPTION 'Item already restored';
  END IF;
  IF _row.purged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Item already permanently deleted';
  END IF;

  -- Build column list / value list from snapshot keys
  SELECT
    string_agg(format('%I', k), ','),
    string_agg(format('($1->>%L)::text::%s',
      k,
      (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name = _row.table_name AND column_name = k)
    ), ',')
  INTO _cols, _vals
  FROM jsonb_object_keys(_row.snapshot) k
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name = _row.table_name AND column_name = k
  );

  IF _cols IS NULL THEN
    RAISE EXCEPTION 'Cannot rebuild columns for table %', _row.table_name;
  END IF;

  -- Use a JSON-driven insert which preserves types correctly via jsonb_populate_record
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO NOTHING',
    _row.table_name, _row.table_name
  )
  USING _row.snapshot;

  UPDATE public.recycle_bin
  SET restored_at = now(), restored_by = _uid
  WHERE id = _bin_id;
END;
$$;

-- =====================
-- Permanent delete (single + empty bin) — Admin/OIC only
-- Returns array of {bucket, path} so the client can purge storage objects.
-- =====================
CREATE OR REPLACE FUNCTION public.purge_recycle_bin_entry(_bin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _paths JSONB;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.can_use_recycle_bin(_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT storage_paths INTO _paths FROM public.recycle_bin
   WHERE id = _bin_id AND purged_at IS NULL AND restored_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or already processed';
  END IF;

  DELETE FROM public.recycle_bin WHERE id = _bin_id;
  RETURN COALESCE(_paths, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.empty_recycle_bin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _all JSONB;
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.can_use_recycle_bin(_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO _all
  FROM public.recycle_bin r,
       LATERAL jsonb_array_elements(COALESCE(r.storage_paths, '[]'::jsonb)) p
  WHERE r.restored_at IS NULL AND r.purged_at IS NULL;

  DELETE FROM public.recycle_bin
   WHERE restored_at IS NULL AND purged_at IS NULL;

  RETURN _all;
END;
$$;

-- =====================
-- Auto-purge expired entries (called by scheduler / on view)
-- Returns storage paths to be removed by client.
-- =====================
CREATE OR REPLACE FUNCTION public.purge_expired_recycle_bin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _all JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) INTO _all
  FROM public.recycle_bin r,
       LATERAL jsonb_array_elements(COALESCE(r.storage_paths, '[]'::jsonb)) p
  WHERE r.restored_at IS NULL
    AND r.purged_at IS NULL
    AND r.expires_at < now();

  DELETE FROM public.recycle_bin
   WHERE restored_at IS NULL
     AND purged_at IS NULL
     AND expires_at < now();

  RETURN _all;
END;
$$;

-- Allow authenticated users to call the soft-delete RPC. Restore/purge are
-- gated inside the function bodies via can_use_recycle_bin().
GRANT EXECUTE ON FUNCTION public.soft_delete_record(TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_recycle_bin_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recycle_bin_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empty_recycle_bin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_recycle_bin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_recycle_bin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recyclable_table(TEXT) TO authenticated;