import { Badge } from "@/components/ui/badge";
import { useBuildRelease } from "@/hooks/useBuildRelease";
import { useAuth } from "@/hooks/useAuth";
import { useBranding } from "@/hooks/useBranding";
import { roleLabel } from "@/lib/role-labels";
import StaffDashboard from "@/components/dashboard/StaffDashboard";
import CommandDashboard from "@/components/dashboard/CommandDashboard";
import AdminSecurityBand from "@/components/dashboard/AdminSecurityBand";

/**
 * Dashboard — one fixed information hierarchy, three role compositions:
 *
 *   Header → Key figures → Action needed → (Administration) → Operations →
 *   Workforce analytics → Information
 *
 * Staff and lower-privileged roles get the personal composition only. Command
 * tier adds oversight and operational queues. Admin / OIC / 2IC additionally
 * get the restricted administration & security band.
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
        <Badge variant="outline" className="font-mono text-[10px] whitespace-nowrap sm:text-xs" title={build.tooltip}>
          {build.versionId}
        </Badge>
      </header>

      {isAdminOrSupervisor ? (
        <CommandDashboard>{isAdminTier && <AdminSecurityBand />}</CommandDashboard>
      ) : (
        <StaffDashboard />
      )}
    </div>
  );
}
