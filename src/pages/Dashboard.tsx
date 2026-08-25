import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBuildRelease } from "@/hooks/useBuildRelease";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { roleLabel } from "@/lib/role-labels";
import StaffDashboard from "@/components/dashboard/StaffDashboard";
import CommandDashboard from "@/components/dashboard/CommandDashboard";

/**
 * Dashboard — one fixed information hierarchy, two role compositions:
 *
 *   Header → Key figures → Action needed → Operations →
 *   Workforce analytics → Information
 *
 * Staff and lower-privileged roles get the personal composition only. Command
 * tier adds oversight and the operational queues it owns.
 *
 * High-risk surfaces are deliberately NOT part of any dashboard composition:
 * security/intrusion metrics, system-integrity and performance data, access
 * control configuration, tactical GPS operations, dispatch traffic, individual
 * appraisal ratings and full department allocations live in the Admin Console
 * (Admin / OIC / 2IC only). General staff see aggregated figures instead.
 */
export default function Dashboard() {
  const { role, isAdminOrSupervisor } = useAuth();
  const { company_name } = useBranding();
  const build = useBuildRelease();
  const isAdminTier = role === "admin" || role === "oic" || role === "2ic";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company_name}
            <span aria-hidden="true" className="mx-1.5 opacity-40">·</span>
            Signed in as {roleLabel(role)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminTier && (
            <Link
              to="/admin-console"
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Security &amp; restricted data
            </Link>
          )}
          <Badge variant="outline" className="font-mono text-[10px] whitespace-nowrap sm:text-xs" title={build.tooltip}>
            {build.versionId}
          </Badge>
        </div>
      </header>

      {isAdminOrSupervisor ? <CommandDashboard /> : <StaffDashboard />}
    </div>
  );
}

