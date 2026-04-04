import { useAuth } from "@/hooks/useAuth";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { MyLeaveHistory } from "@/components/leave/MyLeaveHistory";
import { LeaveApprovalQueue } from "@/components/leave/LeaveApprovalQueue";

export default function LeaveRequests() {
  const { isAdmin, isSupervisor, isAdminOrSupervisor } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Leave / Pass Requests</h1>

      {/* Staff: submit form + own history */}
      <LeaveRequestForm />
      <MyLeaveHistory />

      {/* Admin/Supervisor: approval queue */}
      {isAdminOrSupervisor && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-secondary">
            Approval Queue {isSupervisor && !isAdmin && <span className="text-sm font-normal text-muted-foreground">(Your Department)</span>}
          </h2>
          <LeaveApprovalQueue />
        </div>
      )}
    </div>
  );
}
