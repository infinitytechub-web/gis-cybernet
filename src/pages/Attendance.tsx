import { useAuth } from "@/hooks/useAuth";
import { CheckInOut } from "@/components/attendance/CheckInOut";
import { AdminAttendanceLog } from "@/components/attendance/AdminAttendanceLog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Attendance() {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Attendance</h1>
        <Badge variant="outline">{format(new Date(), "PPP")}</Badge>
      </div>

      {/* Staff always sees their own check-in/out card */}
      <CheckInOut />

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
