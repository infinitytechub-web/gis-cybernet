import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { MyLeaveHistory } from "@/components/leave/MyLeaveHistory";
import { LeaveAdminDashboard } from "@/components/leave/LeaveAdminDashboard";
import { LeaveBalanceDashboard } from "@/components/leave/LeaveBalanceDashboard";
import { LeaveUsageDashboard } from "@/components/leave/LeaveUsageDashboard";

export default function LeaveRequests() {
  const { isAdminOrSupervisor } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-secondary">Leave / Pass Requests</h1>
        <Button variant="outline" asChild>
          <Link to="/leave/calendar">
            <CalendarDays className="mr-2 h-4 w-4" />
            Leave calendar
          </Link>
        </Button>
      </div>

      {/* Staff: submit form + own history */}
      <LeaveRequestForm />
      <MyLeaveHistory />

      {/* Balance dashboard — own balance for staff, whole command for the command tier */}
      <LeaveBalanceDashboard />

      {/* Approved days rolled up by region, station and leave type */}
      <LeaveUsageDashboard />


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
