/**
 * COMMAND DASHBOARD — readiness per command branch.
 *
 * Staff attendance for today, vehicle readiness, fuel levels and open alerts.
 * Every figure comes from the `command_dashboard` RPC, which resolves the
 * signed-in officer's branch reach server-side.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Truck, Fuel, Siren, ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { ORG_UNIT_TYPE_LABELS, type OrgUnitType } from "@/lib/org-hierarchy";
import {
  useCommandDashboard, attendanceRate, vehicleReadiness, totalOpenAlerts,
  type CommandBranchRollup,
} from "@/hooks/useCommandDashboard";

function pct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}

function toneFor(v: number | null) {
  if (v === null) return "text-muted-foreground";
  if (v >= 85) return "text-success";
  if (v >= 60) return "text-warning";
  return "text-destructive";
}

function Kpi({
  icon: Icon, label, value, hint,
}: { icon: typeof Users; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommandDashboardTab({ branchName }: { branchName?: string }) {
  const { data, isLoading, error } = useCommandDashboard(30);
  const branches = data?.branches ?? [];

  const totals = useMemo(() => {
    const t = branches.reduce(
      (acc, b) => {
        acc.staff += b.staff_total;
        acc.present += b.present + b.late;
        acc.vehicles += b.vehicles_total;
        acc.ready += Math.max(0, b.vehicles_active - b.vehicles_immobilized - b.vehicles_offline);
        acc.lowFuel += b.low_fuel;
        acc.fuelSum += (b.avg_fuel_pct ?? 0) * (b.vehicles_total || 0);
        acc.fuelWeight += b.avg_fuel_pct === null ? 0 : b.vehicles_total || 0;
        acc.openAlerts += totalOpenAlerts(b);
        acc.critical += b.critical_alerts;
        acc.openCyber += b.open_cyber;
        acc.procTotal += b.proc_total ?? 0;
        acc.procPending += b.proc_pending ?? 0;
        acc.procApproved += b.proc_approved ?? 0;
        acc.procReceived += b.proc_received ?? 0;
        acc.procCommitted += Number(b.proc_committed ?? 0);
        acc.procItemsReceived += Number(b.proc_items_received ?? 0);
        return acc;
      },
      {
        staff: 0, present: 0, vehicles: 0, ready: 0, lowFuel: 0, fuelSum: 0, fuelWeight: 0,
        openAlerts: 0, critical: 0, openCyber: 0,
        procTotal: 0, procPending: 0, procApproved: 0, procReceived: 0,
        procCommitted: 0, procItemsReceived: 0,
      },
    );
    return {
      ...t,
      attendance: t.staff ? Math.round((t.present / t.staff) * 100) : null,
      readiness: t.vehicles ? Math.round((t.ready / t.vehicles) * 100) : null,
      avgFuel: t.fuelWeight ? Math.round(t.fuelSum / t.fuelWeight) : null,
    };
  }, [branches]);

  const rows: CommandBranchRollup[] = useMemo(
    () =>
      [...branches].sort(
        (a, b) => totalOpenAlerts(b) - totalOpenAlerts(a) || a.name.localeCompare(b.name),
      ),
    [branches],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Command dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {branchName ? `${branchName} · ` : ""}
            {branches.length} command{branches.length === 1 ? "" : "s"} in my reach
            {data?.as_of ? ` · as of ${formatDateTime(data.as_of)}` : ""}
          </p>
        </div>
        {totals.critical > 0 && (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
            {totals.critical} critical outstanding
          </Badge>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Could not load the dashboard: {(error as Error).message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Users}
          label="Staff attendance today"
          value={isLoading ? "…" : pct(totals.attendance)}
          hint={`${totals.present} of ${totals.staff} posted staff checked in`}
        />
        <Kpi
          icon={Truck}
          label="Vehicle readiness"
          value={isLoading ? "…" : pct(totals.readiness)}
          hint={`${totals.ready} of ${totals.vehicles} vehicles fit for tasking`}
        />
        <Kpi
          icon={Fuel}
          label="Average fuel level"
          value={isLoading ? "…" : pct(totals.avgFuel)}
          hint={`${totals.lowFuel} vehicle${totals.lowFuel === 1 ? "" : "s"} below threshold`}
        />
        <Kpi
          icon={Siren}
          label="Open alerts"
          value={isLoading ? "…" : String(totals.openAlerts)}
          hint={`${totals.openCyber} cyber · ${totals.critical} critical`}
        />
        <Kpi
          icon={ShoppingCart}
          label="Procurement requests"
          value={isLoading ? "…" : String(totals.procTotal)}
          hint={`${totals.procPending} awaiting approval · ${money(totals.procCommitted)} committed`}
        />
        <Kpi
          icon={ClipboardCheck}
          label="Approved for receipt"
          value={isLoading ? "…" : String(totals.procApproved)}
          hint={`${totals.procPending} still pending a decision`}
        />
        <Kpi
          icon={PackageCheck}
          label="Requests received"
          value={isLoading ? "…" : String(totals.procReceived)}
          hint={`${totals.procItemsReceived} unit${totals.procItemsReceived === 1 ? "" : "s"} taken into stock`}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Readiness per branch</CardTitle>
          <CardDescription>
            Attendance is for today; vehicles, fuel, alerts and procurement cover the last{" "}
            {data?.days ?? 30} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Command</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead>Fuel</TableHead>
                  <TableHead>Open alerts</TableHead>
                  <TableHead>Cyber</TableHead>
                  <TableHead>Procurement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Loading readiness…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No commands in your reach yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((b) => {
                    const att = attendanceRate(b);
                    const ready = vehicleReadiness(b);
                    return (
                      <TableRow key={b.org_unit_id}>
                        <TableCell>
                          <div className="font-medium">{b.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {ORG_UNIT_TYPE_LABELS[b.unit_type as OrgUnitType] ?? b.unit_type}
                          </div>
                        </TableCell>
                        <TableCell className="w-[160px]">
                          <div className={`text-sm font-medium ${toneFor(att)}`}>{pct(att)}</div>
                          <Progress value={att ?? 0} className="mt-1 h-1.5" />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {b.present} present · {b.late} late · {b.absent} absent · {b.staff_total} posted
                          </div>
                        </TableCell>
                        <TableCell className="w-[160px]">
                          <div className={`text-sm font-medium ${toneFor(ready)}`}>{pct(ready)}</div>
                          <Progress value={ready ?? 0} className="mt-1 h-1.5" />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {b.vehicles_active} active · {b.vehicles_maintenance} maint. ·{" "}
                            {b.vehicles_offline} offline
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{pct(b.avg_fuel_pct === null ? null : Math.round(b.avg_fuel_pct))}</div>
                          {b.low_fuel > 0 && (
                            <Badge variant="outline" className="mt-1 border-warning/40 bg-warning/10 text-xs">
                              {b.low_fuel} low
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{totalOpenAlerts(b)}</div>
                          <div className="text-xs text-muted-foreground">
                            {b.open_alerts} command · {b.open_fleet_alerts} fleet
                          </div>
                          {b.critical_alerts > 0 && (
                            <Badge variant="outline" className="mt-1 border-destructive/40 bg-destructive/10 text-xs text-destructive">
                              {b.critical_alerts} critical
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            {b.open_cyber} open
                          </div>
                          <div className="text-xs text-muted-foreground">{b.cyber_total} logged</div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
