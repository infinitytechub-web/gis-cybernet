import { useAuth } from "@/hooks/useAuth";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { MyLeaveHistory } from "@/components/leave/MyLeaveHistory";
import { LeaveAdminDashboard } from "@/components/leave/LeaveAdminDashboard";

export default function LeaveRequests() {
  const { isAdminOrSupervisor } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Leave / Pass Requests</h1>

      {/* Staff: submit form + own history */}
      <LeaveRequestForm />
      <MyLeaveHistory />

      {/* Command tier (admin / OIC / 2IC / Staff Officer / Supervisor): dashboard + queue */}
      {isAdminOrSupervisor && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-secondary">Admin Dashboard</h2>
          <LeaveAdminDashboard />
        </div>
      )}
    </div>
  );
}
