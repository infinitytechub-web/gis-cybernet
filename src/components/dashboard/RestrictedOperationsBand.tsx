import { useNavigate } from "react-router-dom";
import { Building2, Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardSection from "@/components/dashboard/DashboardSection";
import LiveGpsMapWidget from "@/components/dashboard/LiveGpsMapWidget";
import InterlinkWidget from "@/components/dashboard/InterlinkWidget";
import StaffAppraisalsWidget from "@/components/dashboard/StaffAppraisalsWidget";
import LowStockWidget from "@/components/dashboard/LowStockWidget";
import OnlineNowPanel from "@/components/dashboard/OnlineNowPanel";
import { useOversightDashboardData } from "@/hooks/useDashboardData";
import { useRbac } from "@/hooks/useRbac";

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--success))",
  "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--info))",
];

/**
 * Restricted operations band — Admin / OIC / 2IC only, rendered inside the
 * Admin Console and never on the general dashboard.
 *
 * Holds the strategic and need-to-know surfaces: geolocated GPS operations,
 * interlink / dispatch traffic, individual appraisal ratings, full department
 * allocations and sensitive supply alerts. Its queries do not run for any
 * other role because the component is not mounted.
 */
export default function RestrictedOperationsBand() {
  const navigate = useNavigate();
  const { can } = useRbac();
  const { deptDistribution, counts } = useOversightDashboardData(true);
  const active = counts?.activeStaff ?? 0;

  return (
    <DashboardSection
      id="restricted-operations"
      title="Restricted operations"
      description="Tactical maps, dispatch traffic, individual ratings and full allocations. Restricted to System Administrators, OIC and 2IC."
      icon={Radar}
      restricted
    >
      {can("fleet") && <LiveGpsMapWidget />}
      {can("interlink") && <InterlinkWidget />}
      {can("appraisals") && <StaffAppraisalsWidget />}
      {can("stores") && <LowStockWidget />}

      {can("staff") && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Staff allocation by department
              <Badge variant="outline" className="ml-auto text-[10px]">{deptDistribution.length} depts</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[280px] overflow-y-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Department</TableHead>
                  <TableHead className="w-16 text-right text-xs">Count</TableHead>
                  <TableHead className="hidden text-xs sm:table-cell">Distribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptDistribution.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">No allocations recorded</TableCell></TableRow>
                ) : (
                  deptDistribution.map((dept, i) => {
                    const maxVal = deptDistribution[0]?.value || 1;
                    const pct = Math.round((dept.value / (active || 1)) * 100);
                    return (
                      <TableRow key={dept.name} className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => navigate(`/directory?dept=${dept.id}`)}>
                        <TableCell className="py-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline">{dept.name}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-semibold">{dept.value}</TableCell>
                        <TableCell className="hidden py-1.5 sm:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${(dept.value / maxVal) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            </div>
                            <span className="w-8 text-[10px] text-muted-foreground">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div id="online-now" className="scroll-mt-20"><OnlineNowPanel /></div>
    </DashboardSection>
  );
}
