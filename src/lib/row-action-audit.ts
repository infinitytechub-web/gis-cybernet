/**
 * Row-action audit logger.
 *
 * Writes a row into public.front_desk_audit_log for Edit, Delete, Download,
 * Print, and Email actions so the Front Desk Audit Log tab surfaces who did
 * what, when, and to which record. Email sends are audited server-side in the
 * send-record-email edge function; we only log the client-initiated Open here.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RecordKind } from "@/lib/record-pdf";

export type RowAction =
  | "edit_open"
  | "download_pdf"
  | "print"
  | "email_open"
  | "delete_soft";

export async function logRowAction(
  action: RowAction,
  kind: RecordKind,
  record: { id?: string; applicant_name?: string | null; status?: string | null },
  extra?: Record<string, unknown>,
) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid || !record?.id) return;

    await supabase.from("front_desk_audit_log").insert({
      action,
      entity_type: kind,
      entity_id: record.id,
      performed_by: uid,
      details: {
        applicant_name: record.applicant_name ?? null,
        status: record.status ?? null,
        at: new Date().toISOString(),
        ...(extra ?? {}),
      },
    });
  } catch {
    // best-effort — never block the UX on audit failure
  }
}
