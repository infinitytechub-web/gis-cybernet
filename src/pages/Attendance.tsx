import { useAuth } from "@/hooks/useAuth";
import { CheckInOut } from "@/components/attendance/CheckInOut";
import { AdminAttendanceLog } from "@/components/attendance/AdminAttendanceLog";
import { SyncHistoryLog } from "@/components/attendance/SyncHistoryLog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Attendance() {
  const { isAdmin, user } = useAuth();

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

      {/* Admins also see the full attendance log with reports */}
      {isAdmin && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-secondary">Attendance Log</h2>
          <AdminAttendanceLog />
        </div>
      )}
    </div>
  );
}
