-- Ensure join keys are indexed (profiles.user_id is already unique-indexed; processed_by index added previously, kept here for safety)
CREATE INDEX IF NOT EXISTS idx_visa_extensions_processed_by ON public.visa_extensions (processed_by);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);

-- Front Desk listing view: visa extensions joined with processing staff member's name + staff_id
CREATE OR REPLACE VIEW public.front_desk_visa_extensions_view
WITH (security_invoker = true)
AS
SELECT
  v.id,
  v.applicant_name,
  v.passport_number,
  v.nationality,
  v.permit_type,
  v.fee_charged,
  v.current_visa_expiry,
  v.requested_extension_date,
  v.status,
  v.reason,
  v.notes,
  v.created_at,
  v.updated_at,
  v.processed_by,
  p.staff_id        AS processed_by_staff_id,
  p.first_name      AS processed_by_first_name,
  p.last_name       AS processed_by_last_name,
  NULLIF(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), '') AS processed_by_name
FROM public.visa_extensions v
LEFT JOIN public.profiles p ON p.user_id = v.processed_by;

-- Allow authenticated users (subject to underlying RLS via security_invoker) to read the view
GRANT SELECT ON public.front_desk_visa_extensions_view TO authenticated;