import { Activity, Shield, ShieldCheck, Users, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import DashboardSection from "@/components/dashboard/DashboardSection";
import AdminQuickSearchWidget from "@/components/dashboard/AdminQuickSearchWidget";
import SecurityThreatsWidget from "@/components/dashboard/SecurityThreatsWidget";
import SecurityPolicyWidget from "@/components/dashboard/SecurityPolicyWidget";
import SystemHealthCheckWidget from "@/components/dashboard/SystemHealthCheckWidget";
import { useSystemHealthData } from "@/hooks/useDashboardData";
import { useRbac } from "@/hooks/useRbac";

/**
 * Administration & security band — Admin / OIC / 2IC only. Everything here is
 * audit-sensitive or security configuration, so it is never rendered (and its
 * queries never run) for other roles.
 */
export default function AdminSecurityBand() {
  const { can } = useRbac();
  const { systemHealth, healthWidgetEnabled } = useSystemHealthData(true);

  return (
    <DashboardSection
      id="administration"
      title="Administration & security"
      description="Restricted to System Administrators, OIC and 2IC."
      icon={ShieldCheck}
      restricted
    >
      <AdminQuickSearchWidget />
      {can("ip-blocks") && <SecurityThreatsWidget />}
      {can("session-management") && <SecurityPolicyWidget />}
      {healthWidgetEnabled && can("settings") && <SystemHealthCheckWidget />}

      {systemHealth && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              System integrity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" aria-hidden="true" /> Login accounts
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {systemHealth.withAccounts}
                  <span className="text-sm font-normal text-muted-foreground">/{systemHealth.totalProfiles}</span>
                </div>
                <Progress value={systemHealth.loginCoverage} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">{systemHealth.loginCoverage}% coverage</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" aria-hidden="true" /> Role assignments
                </div>
                <div className="text-xl font-bold tabular-nums">{systemHealth.roleAssignments}</div>
                <p className="text-[10px] text-muted-foreground">{systemHealth.departments} depts · {systemHealth.ranks} ranks</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wifi className="h-3 w-3" aria-hidden="true" /> Data completeness
                </div>
                <div className="text-xl font-bold tabular-nums">{systemHealth.dataCompleteness}%</div>
                <Progress value={systemHealth.dataCompleteness} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">profiles filled</p>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Missing data</div>
                <div className="space-y-0.5 text-xs">
                  {systemHealth.missingDept > 0 && <p className="text-warning">{systemHealth.missingDept} no department</p>}
                  {systemHealth.missingRank > 0 && <p className="text-warning">{systemHealth.missingRank} no rank</p>}
                  {systemHealth.missingPhone > 0 && <p className="text-warning">{systemHealth.missingPhone} no phone</p>}
                  {systemHealth.missingDept === 0 && systemHealth.missingRank === 0 && systemHealth.missingPhone === 0 && (
                    <p className="text-success">All complete</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardSection>
  );
}
