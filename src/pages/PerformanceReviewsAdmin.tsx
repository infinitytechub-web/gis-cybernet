import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Plus, ClipboardCheck } from "lucide-react";
import { AdminHrHeader } from "@/components/admin/AdminHrHeader";
import { AppraisalQueue } from "@/components/appraisals/AppraisalQueue";
import { loadAdminHrContext } from "@/lib/admin-hr";
import { Button } from "@/components/ui/button";

export default function PerformanceReviewsAdmin() {
  const { user } = useAuth();
  const context = useQuery({ queryKey: ["admin-hr-context", "performance-admin", user?.id], enabled: !!user, queryFn: () => loadAdminHrContext("performance-admin"), refetchInterval: 30_000, retry: false });
  return <div className="space-y-5 p-4 md:p-6"><AdminHrHeader title="Performance reviews" />
    {context.isLoading && <p role="status">Checking review access…</p>}
    {context.isError && <div role="alert" className="text-destructive">Performance reviews could not be loaded or access has changed. <Button variant="outline" onClick={() => void context.refetch()}>Retry</Button></div>}
    {context.data && !context.isError && <><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/appraisals?tab=new"><Plus className="mr-2 h-4 w-4" />New appraisal</Link></Button><Button asChild variant="outline"><Link to="/appraisals/coverage"><ClipboardCheck className="mr-2 h-4 w-4" />Coverage report</Link></Button></div><AppraisalQueue /></>}
  </div>;
}