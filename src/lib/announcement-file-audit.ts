import { supabase } from "@/integrations/supabase/client";
import { getMyClientIp as getClientIp } from "@/lib/client-ip";

export type FileAuditAction = "upload" | "download" | "preview" | "permission_change" | "delete";

export async function logFileAudit(
  fileId: string | null,
  action: FileAuditAction,
  metadata: Record<string, unknown> = {},
) {
  try {
    const ip = await getClientIp();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    await supabase.rpc("log_announcement_file_audit", {
      _file_id: fileId,
      _action: action,
      _ip: ip,
      _user_agent: ua,
      _metadata: metadata as any,
    });
  } catch {
    // Silent — audit logging must not block UX
  }
}
