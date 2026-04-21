import { supabase } from "@/integrations/supabase/client";

/**
 * Log a user-facing action (export, sensitive view, etc.) to the
 * admin-only system_audit_log. Failures are swallowed — auditing should
 * never block the UX.
 *
 * @param entityType  Logical entity ("attendance_compliance_report", "attendance_compliance_staff_detail", …)
 * @param action      Verb-led action ("exported", "viewed", "opened", …)
 * @param details     Free-form context (filters, format, target staff, etc.)
 * @param entityId    Optional UUID this action targeted (e.g. a staff profile id)
 */
export async function logAdminAudit(
  entityType: string,
  action: string,
  details: Record<string, unknown> = {},
  entityId?: string | null,
) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    await supabase.from("system_audit_log").insert({
      entity_type: entityType,
      action,
      entity_id: entityId ?? null,
      performed_by: uid,
      details: details as never,
    });
  } catch {
    // best-effort, do not throw
  }
}
