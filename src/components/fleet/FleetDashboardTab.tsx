/**
 * FLEET PERFORMANCE DASHBOARD — vehicle uptime, geofence compliance, fuel usage
 * and alert resolution rates over a selectable reporting window.
 *
 * All figures come from the authorised `fleet_dashboard` reporting service, so
 * aggregation happens in the database and the page stays responsive as the
 * fleet grows.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Fuel, MapPinned, BellRing, Gauge, AlertTriangle, CalendarClock, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/date-format";
import { usePatrolPlans, isPlanOpen } from "@/hooks/usePatrolPlans";
import { usePatrolLogs } from "@/hooks/usePatrolLogs";
import {
  usePatrolGpsActivity,
  PATROL_GPS_MATCH_LABELS,
  type PatrolGpsMatch,
} from "@/hooks/usePatrolGpsActivity";
import { ALERT_TYPE_LABELS, VEHICLE_STATUS_LABELS, type AlertType, type VehicleStatus } from "@/lib/fleet";

interface DashboardVehicle {
  vehicle_id: string;
  registration_number: string;
  call_sign: string | null;
  status: VehicleStatus;
  last_seen_at: string | null;
  uptime_pct: number | null;
  hours_online: number;
  days_reporting: number;
  distance_km: number;
  litres_used: number;
  fuel_level_pct: number | null;
  open_alerts: number;
  restricted_breaches: number;
}

interface FleetDashboardData {
  window_days: number;
  since: string;
  vehicles_total: number;
  uptime: {
    avg_uptime_pct: number;
    total_hours_online: number;
    vehicles_reporting: number;
    vehicles_silent: number;
    distance_km: number;
  };
  geofence: {
    events_total: number;
    restricted_breaches: number;
    authorised_events: number;
    compliance_pct: number;
    zones_active: number;
  };
  fuel: {
    litres_used: number;
    litres_refuelled: number;
    refuels: number;
    suspected_drains: number;
    litres_per_100km: number | null;
    avg_fuel_pct: number | null;
    low_fuel_vehicles: number;
  };
  alerts: {
    total: number;
    resolved: number;
    open: number;
    acknowledged: number;
    resolution_pct: number;
    avg_resolution_minutes: number | null;
    by_type: { alert_type: AlertType; total: number; resolved: number; open: number }[];
  };
  vehicles: DashboardVehicle[];
  daily: { day: string; reporting_vehicles: number; alerts: number; resolved: number }[];
}

const WINDOWS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${value}%`;
}

function toneFor(value: number | null | undefined, good: number, warn: number): string {
  if (value == null) return "text-muted-foreground";
  if (value >= good) return "text-success";
  if (value >= warn) return "text-warning-foreground";
  return "text-destructive";
}

function ddmmyyyy(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function KpiCard({
  icon: Icon, label, value, hint, valueClass,
}: { icon: any; label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className={`text-2xl font-semibold leading-none ${valueClass ?? ""}`}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  canManage: boolean;
}

export function FleetDashboardTab({ canManage }: Props) {
  const [days, setDays] = useState("7");

  const query = useQuery({
    queryKey: ["fleet", "dashboard", days],
    enabled: canManage,
    refetchInterval: 120_000,
    queryFn: async (): Promise<FleetDashboardData> => {
      const { data, error } = await supabase.rpc("fleet_dashboard", { _days: Number(days) });
      if (error) throw error;
      return data as unknown as FleetDashboardData;
    },
  });

  // Assigned-unit lookup so every registered vehicle can be traced to its unit.
  const unitsQuery = useQuery({
    queryKey: ["fleet", "dashboard", "vehicle-units"],
    enabled: canManage,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("fleet_vehicles")
        .select("id, org_unit_id, org_units:org_unit_id (name, code)")
        .limit(1000);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        const unit = row.org_units;
        if (unit?.name) map[row.id] = unit.code ? `${unit.name} (${unit.code})` : unit.name;
      }
      return map;
    },
  });


  if (!canManage) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Fleet performance reporting is limited to authorised fleet staff.
        </CardContent>
      </Card>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center" role="status" aria-busy="true">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading fleet performance figures…</span>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Fleet performance figures could not be loaded. Please try again.
        </CardContent>
      </Card>
    );
  }

  const d = query.data;
  const daily = d.daily.map((row) => ({ ...row, label: ddmmyyyy(row.day) }));
  const byType = d.alerts.by_type.map((row) => ({
    ...row,
    label: ALERT_TYPE_LABELS[row.alert_type] ?? row.alert_type,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fleet performance</h2>
          <p className="text-sm text-muted-foreground">
            Reporting period from {ddmmyyyy(d.since)} · {d.vehicles_total} vehicles on strength
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger aria-label="Reporting period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Activity}
          label="Average vehicle uptime"
          value={pct(d.uptime.avg_uptime_pct)}
          hint={`${d.uptime.vehicles_reporting} reporting · ${d.uptime.vehicles_silent} silent`}
          valueClass={toneFor(d.uptime.avg_uptime_pct, 85, 60)}
        />
        <KpiCard
          icon={MapPinned}
          label="Geofence compliance"
          value={pct(d.geofence.compliance_pct)}
          hint={`${d.geofence.restricted_breaches} restricted-zone breaches · ${d.geofence.zones_active} zones active`}
          valueClass={toneFor(d.geofence.compliance_pct, 95, 85)}
        />
        <KpiCard
          icon={Fuel}
          label="Fuel used"
          value={`${d.fuel.litres_used} L`}
          hint={
            d.fuel.litres_per_100km != null
              ? `${d.fuel.litres_per_100km} L/100 km · ${d.fuel.refuels} refuels`
              : `${d.fuel.refuels} refuels`
          }
        />
        <KpiCard
          icon={BellRing}
          label="Alert resolution rate"
          value={pct(d.alerts.resolution_pct)}
          hint={
            d.alerts.avg_resolution_minutes != null
              ? `${d.alerts.resolved}/${d.alerts.total} closed · avg ${d.alerts.avg_resolution_minutes} min`
              : `${d.alerts.resolved}/${d.alerts.total} closed`
          }
          valueClass={toneFor(d.alerts.resolution_pct, 90, 70)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uptime &amp; patrol activity</CardTitle>
            <CardDescription>Vehicles reporting positions each day, with alert volume.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="reporting_vehicles" name="Vehicles reporting"
                  stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="alerts" name="Alerts raised"
                  stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" name="Alerts closed"
                  stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alert resolution by type</CardTitle>
            <CardDescription>Closed against outstanding alerts for the period.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
            {byType.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No alerts raised in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="resolved" name="Closed" fill="hsl(var(--success))" stackId="a" />
                  <Bar dataKey="open" name="Outstanding" fill="hsl(var(--destructive))" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
              Fuel oversight
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Litres consumed</span><span>{d.fuel.litres_used} L</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Litres refuelled</span><span>{d.fuel.litres_refuelled} L</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Average tank level</span><span>{pct(d.fuel.avg_fuel_pct)}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicles below threshold</span>
              <span className={d.fuel.low_fuel_vehicles > 0 ? "text-warning-foreground" : ""}>{d.fuel.low_fuel_vehicles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Suspected siphoning</span>
              <span className={d.fuel.suspected_drains > 0 ? "text-destructive" : ""}>{d.fuel.suspected_drains}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-4 w-4 text-primary" aria-hidden="true" />
              Geofence compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Progress value={d.geofence.compliance_pct} aria-label="Geofence compliance" />
            <div className="flex justify-between"><span className="text-muted-foreground">Zone crossings logged</span><span>{d.geofence.events_total}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Authorised-zone activity</span><span>{d.geofence.authorised_events}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Restricted-zone breaches</span>
              <span className={d.geofence.restricted_breaches > 0 ? "text-destructive" : ""}>{d.geofence.restricted_breaches}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
              Alert handling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Progress value={d.alerts.resolution_pct} aria-label="Alert resolution rate" />
            <div className="flex justify-between"><span className="text-muted-foreground">Raised</span><span>{d.alerts.total}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Closed</span><span>{d.alerts.resolved}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Acknowledged</span><span>{d.alerts.acknowledged}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={d.alerts.open > 0 ? "text-destructive" : ""}>{d.alerts.open}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-vehicle performance</CardTitle>
          <CardDescription>Uptime, distance, fuel drawn and outstanding alerts by vehicle.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.vehicles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No vehicles on the register yet. Add your vehicles on the Vehicles tab.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Assigned unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Uptime</TableHead>
                    <TableHead className="text-right">Hours online</TableHead>
                    <TableHead className="text-right">Distance</TableHead>
                    <TableHead className="text-right">Fuel used</TableHead>
                    <TableHead className="text-right">Breaches</TableHead>
                    <TableHead className="text-right">Open alerts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.vehicles.map((v) => (
                    <TableRow key={v.vehicle_id}>
                      <TableCell className="font-medium">
                        {v.registration_number}
                        {v.call_sign && <span className="ml-2 text-xs text-muted-foreground">{v.call_sign}</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {unitsQuery.data?.[v.vehicle_id] ?? (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline">{VEHICLE_STATUS_LABELS[v.status] ?? v.status}</Badge>
                      </TableCell>
                      <TableCell className={`text-right ${toneFor(v.uptime_pct, 85, 60)}`}>{pct(v.uptime_pct)}</TableCell>
                      <TableCell className="text-right">{v.hours_online}</TableCell>
                      <TableCell className="text-right">{v.distance_km} km</TableCell>
                      <TableCell className="text-right">{v.litres_used} L</TableCell>
                      <TableCell className={`text-right ${v.restricted_breaches > 0 ? "text-destructive" : ""}`}>
                        {v.restricted_breaches}
                      </TableCell>
                      <TableCell className={`text-right ${v.open_alerts > 0 ? "text-destructive" : ""}`}>
                        {v.open_alerts}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SubmittedPatrolLogsCard days={Number(days)} />

      <PatrolGpsActivityCard days={Number(days)} />

      <PatrolPlanCommitments />
    </div>
  );
}

/** Submitted patrol log entries — district, strength and incidents, vehicle or foot. */
function SubmittedPatrolLogsCard({ days }: { days: number }) {
  const { data: logs = [], isLoading, isError } = usePatrolLogs(Math.max(days, 30));
  const submitted = logs.filter((l) => (l.status ?? "").toLowerCase() !== "draft");
  const rows = submitted.slice(0, 15);
  const personnel = submitted.reduce((s, l) => s + (l.personnel_count ?? 0), 0);
  const incidents = submitted.reduce((s, l) => s + (l.incidents_count ?? 0), 0);
  const withVehicle = submitted.filter((l) => l.vehicle_id).length;

  const statusTone = (status: string) =>
    ({
      submitted: "border-primary/40 text-primary",
      reviewed: "border-primary/40 text-primary",
      closed: "text-muted-foreground",
    })[(status ?? "").toLowerCase()] ?? "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
          Submitted patrol logs
        </CardTitle>
        <CardDescription>
          {submitted.length} submitted patrol{submitted.length === 1 ? "" : "s"} in the last{" "}
          {Math.max(days, 30)} days · {personnel} officers deployed · {incidents} incident
          {incidents === 1 ? "" : "s"} · {withVehicle} vehicle-borne, {submitted.length - withVehicle} on foot.
          Recorded in{" "}
          <Link to="/command-console?tab=patrols" className="underline">Command Console → Patrol log</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading patrol logs…</p>}
        {isError && <p className="text-sm text-destructive">Patrol logs could not be loaded.</p>}
        {!isLoading && !isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No submitted patrols in this period.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date / time</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Strength</TableHead>
                  <TableHead className="text-right">Incidents</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.patrol_reference}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(l.patrol_date)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {(l.start_time ?? "").slice(0, 5)}
                        {l.end_time ? `–${l.end_time.slice(0, 5)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      {l.district_name ?? "—"}
                      {!l.vehicle_id && (
                        <span className="ml-2 text-xs text-muted-foreground">foot patrol</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {(l.patrol_type ?? "—").replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-right">{l.personnel_count ?? 0}</TableCell>
                    <TableCell
                      className={`text-right ${(l.incidents_count ?? 0) > 0 ? "font-medium text-destructive" : ""}`}
                    >
                      {l.incidents_count ?? 0}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                      <span className="line-clamp-2">
                        {l.incidents || l.route_summary || l.observations || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(l.status)}>
                        <span className="capitalize">{l.status}</span>
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Patrol log entries wired to GPS: district and times proven by the vehicle's trail. */
function PatrolGpsActivityCard({ days }: { days: number }) {
  const { data, isLoading, isError } = usePatrolGpsActivity(Math.max(days, 30));
  const rows = (data?.patrols ?? []).slice(0, 15);
  const confirmed = (data?.patrols ?? []).filter((p) => p.gps_match === "confirmed").length;
  const tracked = (data?.patrols ?? []).filter((p) => p.vehicle_id).length;

  const matchTone: Record<PatrolGpsMatch, string> = {
    confirmed: "border-primary/40 text-primary",
    mismatch: "border-destructive/50 text-destructive",
    no_gps: "text-muted-foreground",
    no_vehicle: "text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinned className="h-4 w-4 text-primary" aria-hidden="true" />
          Patrol log vs GPS tracking
        </CardTitle>
        <CardDescription>
          Districts and times taken from each patrol's vehicle trail.{" "}
          {tracked > 0 && `${confirmed} of ${tracked} vehicle patrols GPS-confirmed. `}
          Entries are logged in{" "}
          <Link to="/command-console?tab=patrols" className="underline">Command Console → Patrol log</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading patrol GPS activity…</p>}
        {isError && <p className="text-sm text-destructive">Patrol GPS activity could not be loaded.</p>}
        {!isLoading && !isError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No patrol entries recorded in this period.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Logged district</TableHead>
                  <TableHead>GPS district(s)</TableHead>
                  <TableHead>GPS time on ground</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead>GPS check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.patrol_reference}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(p.patrol_date)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {(p.start_time ?? "").slice(0, 5)}
                        {p.end_time ? `–${p.end_time.slice(0, 5)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{p.logged_district ?? "—"}</TableCell>
                    <TableCell>
                      {p.gps_districts.length > 0 ? p.gps_districts.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {p.first_fix && p.last_fix
                        ? `${hhmm(p.first_fix)} – ${hhmm(p.last_fix)} (${p.fix_count} fixes)`
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.registration_number ?? "—"}
                      {p.call_sign && <span className="ml-2 text-xs text-muted-foreground">{p.call_sign}</span>}
                    </TableCell>
                    <TableCell className="text-right">{p.distance_km ? `${p.distance_km} km` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={matchTone[p.gps_match]}>
                        {PATROL_GPS_MATCH_LABELS[p.gps_match]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Local time of a GPS fix, HH:MM. */
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Open patrol plans that reserve a vehicle — the fleet view of the plan register. */
function PatrolPlanCommitments() {
  const { data: plans = [], isLoading } = usePatrolPlans(30);
  const rows = plans.filter((p) => p.vehicle_id && isPlanOpen(p.status)).slice(0, 12);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          Patrol plan commitments
        </CardTitle>
        <CardDescription>
          Open plans holding a vehicle. Manage them in{" "}
          <Link to="/command-console" className="underline">Command Console → Patrol plans</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading plans…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No open patrol plans hold a vehicle.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.plan_reference}</TableCell>
                    <TableCell>{p.title}</TableCell>
                    <TableCell>{formatDate(p.planned_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(p.start_time ?? "").slice(0, 5)}
                      {p.end_time ? ` – ${p.end_time.slice(0, 5)}` : ""}
                    </TableCell>
                    <TableCell>{p.district_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FleetDashboardTab;
