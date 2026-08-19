/**
 * UNIT DASHBOARD — one command/unit at a time.
 *
 * Shows the staff posted to a unit (and the units beneath it), the detainees
 * they booked and the cases they are running, plus the unit's vehicles. The
 * unit filter is server-authorised: the `unit_dashboard` function refuses any
 * unit outside the signed-in user's own branch unless they are command tier or
 * an administrator, so a staff member only ever sees their own unit's data.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, Lock, Gavel, Truck, ShieldAlert, Footprints } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrgScope } from "@/hooks/useOrgScope";
import { useUnitDashboard } from "@/hooks/useUnitDashboard";
import { COMMAND_TIER_ROLES } from "@/lib/role-labels";
import { ORG_UNIT_TYPE_LABELS, orgUnitPath, type OrgUnitType } from "@/lib/org-hierarchy";
import { formatDate, formatDateTime } from "@/lib/date-format";

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UnitDashboard() {
  const { role } = useAuth();
  const { units, scope, homeUnitId, loading: scopeLoading } = useOrgScope();
  const isCommandTier = !!role && (COMMAND_TIER_ROLES as string[]).includes(role);

  /** Units this user may open — command tier sees the whole hierarchy. */
  const selectableUnits = useMemo(() => {
    const list = isCommandTier ? units : units.filter((u) => scope.scopeIds.has(u.id));
    return [...list].sort((a, b) => orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id)));
  }, [units, scope, isCommandTier]);

  const [unitId, setUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (unitId || selectableUnits.length === 0) return;
    const preferred = homeUnitId && selectableUnits.some((u) => u.id === homeUnitId)
      ? homeUnitId
      : selectableUnits[0].id;
    setUnitId(preferred);
  }, [unitId, selectableUnits, homeUnitId]);

  const query = useUnitDashboard(unitId);
  const data = query.data;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Unit Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Assigned staff, detainees, cases and vehicles for a single command unit.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="unit-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
            Unit filter
          </label>
          <Select value={unitId ?? undefined} onValueChange={setUnitId}>
            <SelectTrigger id="unit-filter" aria-label="Unit filter">
              <SelectValue placeholder={scopeLoading ? "Loading units…" : "Select a unit"} />
            </SelectTrigger>
            <SelectContent>
              {selectableUnits.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {orgUnitPath(units, u.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {!scopeLoading && selectableUnits.length === 0 && (
        <Alert>
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>No unit posting on record</AlertTitle>
          <AlertDescription>
            You are not posted to a command unit yet, so there is no unit data to show. Ask your
            command to assign you in Command Structure.
          </AlertDescription>
        </Alert>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Unit data unavailable</AlertTitle>
          <AlertDescription>
            {(query.error as Error)?.message?.includes("authorised")
              ? "You are not authorised to view this unit — only your own unit and the units beneath it are available."
              : (query.error as Error)?.message}
          </AlertDescription>
        </Alert>
      )}

      {query.isLoading && <Skeleton className="h-24 w-full" />}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{data.unit.code ?? "—"}</Badge>
            <span className="text-sm font-medium">{data.unit.name}</span>
            <Badge variant="secondary">
              {ORG_UNIT_TYPE_LABELS[data.unit.type as OrgUnitType] ?? data.unit.type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {data.unit_ids.length} unit{data.unit_ids.length === 1 ? "" : "s"} in this branch
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Assigned staff" value={data.staff_total} hint={`${data.staff_active} active`} />
            <Kpi icon={Lock} label="Detainees" value={data.detainees.length} hint={`${data.detainees_in_custody} in custody`} />
            <Kpi icon={Gavel} label="Cases" value={data.cases.length} hint={`${data.cases_open} open`} />
            <Kpi icon={Truck} label="Vehicles" value={data.vehicles.length} />
            <Kpi
              icon={Footprints}
              label="Patrols (30 days)"
              value={data.patrols_recent}
              hint={`${data.patrol_incidents_recent} incidents recorded`}
            />
          </div>

          <Tabs defaultValue="staff">
            <div className="overflow-x-auto">
              <TabsList>
                <TabsTrigger value="staff">Staff ({data.staff.length})</TabsTrigger>
                <TabsTrigger value="detainees">Detainees ({data.detainees.length})</TabsTrigger>
                <TabsTrigger value="cases">Cases ({data.cases.length})</TabsTrigger>
                <TabsTrigger value="vehicles">Vehicles ({data.vehicles.length})</TabsTrigger>
                <TabsTrigger value="patrols">Patrols ({data.patrols.length})</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="staff" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Staff posted to this unit</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Name</th><th>Staff ID</th><th>Rank</th>
                        <th>Department</th><th>Unit</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.map((s) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="py-2">{s.full_name ?? "—"}</td>
                          <td>{s.staff_id ?? "—"}</td>
                          <td>{s.rank ?? "—"}</td>
                          <td>{s.department ?? "—"}</td>
                          <td>{s.unit_name ?? "—"}</td>
                          <td><Badge variant="outline">{s.status ?? "—"}</Badge></td>
                        </tr>
                      ))}
                      {data.staff.length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No staff posted to this unit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="detainees" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Detainees booked by this unit</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Detainee</th><th>Nationality</th><th>Type of offense</th>
                        <th>Cell</th><th>Intake</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.detainees.map((d) => (
                        <tr key={d.id} className="border-t border-border">
                          <td className="py-2">{d.name}</td>
                          <td>{d.nationality ?? "—"}</td>
                          <td>{d.crime_type ?? "—"}</td>
                          <td>{d.cell_number ?? "—"}</td>
                          <td>{formatDateTime(d.intake_at)}</td>
                          <td><Badge variant="outline">{d.status ?? "—"}</Badge></td>
                        </tr>
                      ))}
                      {data.detainees.length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No detainee records for this unit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cases" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Cases and operations</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Reference</th><th>Type</th><th>Location</th>
                        <th>Date</th><th>Arrests</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cases.map((c) => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-2">{c.log_reference ?? "—"}</td>
                          <td>{c.operation_type ?? "—"}</td>
                          <td>{c.location ?? "—"}</td>
                          <td>{formatDate(c.operation_date)}</td>
                          <td>{c.arrests_count ?? 0}</td>
                          <td><Badge variant="outline">{c.status ?? "—"}</Badge></td>
                        </tr>
                      ))}
                      {data.cases.length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No cases for this unit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vehicles" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Unit vehicles</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-2">Registration</th><th>Call sign</th><th>Status</th><th>Last report</th></tr>
                    </thead>
                    <tbody>
                      {data.vehicles.map((v) => (
                        <tr key={v.id} className="border-t border-border">
                          <td className="py-2">{v.registration_number}</td>
                          <td>{v.call_sign ?? "—"}</td>
                          <td><Badge variant="outline">{v.status ?? "—"}</Badge></td>
                          <td>{formatDateTime(v.last_seen_at)}</td>
                        </tr>
                      ))}
                      {data.vehicles.length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No vehicles attached to this unit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patrols" className="mt-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Unit patrol log</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Reference</th><th>Date</th><th>Time</th><th>District</th>
                        <th>Leader</th><th>Strength</th><th>Incidents</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.patrols.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="py-2 font-mono text-xs">{p.patrol_reference}</td>
                          <td>{formatDate(p.patrol_date)}</td>
                          <td className="whitespace-nowrap">
                            {(p.start_time ?? "").slice(0, 5)}
                            {p.end_time ? ` – ${p.end_time.slice(0, 5)}` : ""}
                          </td>
                          <td>{p.district_name ?? "—"}</td>
                          <td>{p.leader_name || "—"}</td>
                          <td>{p.personnel_count ?? 0}</td>
                          <td>{p.incidents_count ?? 0}</td>
                          <td><Badge variant="outline" className="capitalize">{p.status ?? "—"}</Badge></td>
                        </tr>
                      ))}
                      {data.patrols.length === 0 && (
                        <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No patrols logged for this unit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
