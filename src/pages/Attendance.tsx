import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CheckInOut } from "@/components/attendance/CheckInOut";
import { AdminAttendanceLog } from "@/components/attendance/AdminAttendanceLog";
import { SyncHistoryLog } from "@/components/attendance/SyncHistoryLog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * OAuth/SAML/OIDC callback bridge.
 *
 * When the shift-platform connection wizard opens a popup, the IdP redirects
 * back to `/attendance?shift_oauth=<platform>&state=<nonce>` (with provider
 * params like `code`, `error`, etc.). This effect detects that case, posts
 * the result back to the opener via `postMessage`, and closes the popup.
 *
 * The opener verifies the `state` matches the nonce it generated, preventing
 * cross-window confusion / CSRF.
 */
function useShiftOAuthCallbackBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = params.get("shift_oauth");
    if (!platform || !window.opener || window.opener === window) return;
    const state = params.get("state") ?? "";
    const error = params.get("error");
    const code = params.get("code");
    const status = error ? "error" : code || params.get("RelayState") ? "success" : "success";
    try {
      window.opener.postMessage(
        {
          type: "shift-auth-callback",
          platform,
          state,
          status,
          message: error ?? undefined,
        },
        window.location.origin,
      );
    } catch {
      /* opener may have navigated away — fail silent */
    }
    // Give the opener a tick to process before closing.
    setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 150);
  }, []);
}


export default function Attendance() {
  useShiftOAuthCallbackBridge();
  const { isAdminOrSupervisor, user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Attendance</h1>
        <Badge variant="outline">{format(new Date(), "PPP")}</Badge>
      </div>

      {/* Staff always sees their own check-in/out card */}
      <CheckInOut />

      {/* Sync history log */}
      {profile && <SyncHistoryLog profileId={profile.id} />}

      {/* Admins, OIC, 2IC, Staff Officer, and Supervisors see the full attendance log with reports */}
      {isAdminOrSupervisor && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-secondary">Attendance Log</h2>
          <AdminAttendanceLog />
        </div>
      )}
    </div>
  );
}
