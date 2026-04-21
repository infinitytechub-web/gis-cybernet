-- Composite index to support keyset pagination (created_at DESC, id DESC)
-- on the underlying table used by front_desk_visa_extensions_view.
CREATE INDEX IF NOT EXISTS idx_visa_extensions_created_at_id_desc
  ON public.visa_extensions (created_at DESC, id DESC);