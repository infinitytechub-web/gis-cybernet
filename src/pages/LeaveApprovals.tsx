import { Navigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { LeaveApprovalQueue } from "@/components/leave/LeaveApprovalQueue";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/hooks/useAuth";

export default function LeaveApprovals() {
  const { isAdminOrSupervisor } = useAuth();
  if (!isAdminOrSupervisor) return <Navigate to="/command-portal" replace />;
  return <div className="space-y-6"><PageHeader title="Leave Approvals" subtitle="Review leave requests inside your authorized command scope." icon={ClipboardCheck} /><LeaveApprovalQueue /></div>;
}