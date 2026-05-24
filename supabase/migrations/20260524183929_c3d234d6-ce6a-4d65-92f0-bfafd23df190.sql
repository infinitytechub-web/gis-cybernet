CREATE OR REPLACE FUNCTION public.is_recyclable_table(_table TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _table = ANY (ARRAY[
    'announcements','announcement_files','holidays','departments','staff_documents','command_vault_files',
    'report_uploads','report_schedules','procurement_documents','shift_assignments',
    'misd_unit_assignments','certifications','equipment_issuance','inventory_items',
    'inventory_categories','inventory_suppliers','detention_records','enforcement_operations',
    'operations','cyber_incidents','cyber_investigations','cyber_threat_intel','leave_requests',
    'postings_transfers','visa_applications','visa_extensions','permits','passport_applications',
    'official_applications','enquiry_applications','front_desk_audit_log',
    'night_guard_activity_log','platform_sync_history','staff_appraisals'
  ]);
$$;