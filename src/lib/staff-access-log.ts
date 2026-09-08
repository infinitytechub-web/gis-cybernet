/**
 * Staff access logging.
 *
 * Records who opened a staff record and what they did with it (view, edit,
 * delete, download, print, document vault) plus who reached their own staff
 * portal. Writes go through the `log_staff_access` RPC, which always stamps
 * the entry with the signed-in account server-side, so the actor cannot be
 * spoofed from the client. Failures are swallowed on purpose: auditing must
 * never block the action the user asked for.
 */
import { supabase } from "@/integrations/supabase/client";

export type StaffAccessAction =
  | "view"
  | "edit"
  | "create"
  | "delete"
  | "download"
  | "print"
  | "vault"
  | "portal";

export async function logStaffAccess(
  action: StaffAccessAction,
  targetProfileId?: string | null,
  detail?: string,
) {
  try {
    await (supabase as any).rpc("log_staff_access", {
      _action: action,
      _target_profile_id: targetProfileId ?? null,
      _detail: detail ?? null,
      _path: typeof window !== "undefined" ? window.location.pathname : null,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    /* auditing is best-effort */
  }
}
