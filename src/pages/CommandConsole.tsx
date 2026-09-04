/**
 * COMMAND CONSOLE — single operational picture for Regional and Sector commands.
 *
 *   • Live alerts      — open, high-severity signals streaming in from every module.
 *   • Incident list    — searchable / filterable register of everything logged.
 *   • Status dashboards— readiness roll-up per Regional and Sector command.
 *
 * Access is gated by the `command-console` RBAC module; the feed itself is
 * additionally scoped to the signed-in officer's branch of the hierarchy.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OnDutyNowPanel } from "@/components/roster/OnDutyNowPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  MonitorDot, Siren, ShieldAlert, RefreshCw, Radio, ListFilter, Gauge, ExternalLink, Network, Inbox, LayoutDashboard, ShoppingCart, Footprints, CalendarClock, Clock, Users, Building2, Fuel,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import CommandInboxTab from "@/components/command/CommandInboxTab";
import CommandDashboardTab from "@/components/command/CommandDashboardTab";
import CyberIncidentsTab from "@/components/command/CyberIncidentsTab";
import ProcurementTab from "@/components/command/ProcurementTab";
import { FuelRequestsTab } from "@/components/command/FuelRequestsTab";
import PatrolLogTab from "@/components/command/PatrolLogTab";
import PatrolPlanTab from "@/components/command/PatrolPlanTab";
import UnitRosterTab from "@/components/command/UnitRosterTab";
import StaffRosterTab from "@/components/command/StaffRosterTab";

import { useOrgScope } from "@/hooks/useOrgScope";
import {
  useCommandConsoleFeed, useBranchFilter, rollupByCommand,
  CONSOLE_SOURCE_LABELS, CONSOLE_SEVERITIES,
  type ConsoleIncident, type ConsoleSeverity, type ConsoleSource,
} from "@/hooks/useCommandConsole";
import { ORG_UNIT_TYPE_LABELS, flattenOrgTree, orgUnitPath } from "@/lib/org-hierarchy";
import { formatDateTime } from "@/lib/date-format";

const SEVERITY_CLASS: Record<ConsoleSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  info: "border-muted bg-muted text-muted-foreground",
};

function Kpi({
  icon: Icon, label, value, hint, tone,
}: { icon: any; label: string; value: string | number; hint?: string; tone?: "default" | "danger" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`rounded-md p-2 ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
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

function SeverityBadge({ severity }: { severity: ConsoleSeverity }) {
  return (
    <Badge variant="outline" className={`capitalize ${SEVERITY_CLASS[severity]}`}>
      {severity}
    </Badge>
  );
}

export default function CommandConsole() {
  const { isAdminOrSupervisor } = useAuth();
  const { units, tree, scope, homeUnitId, loading: orgLoading } = useOrgScope();
  const [branch, setBranch] = useState<string | "all">("all");
  const [source, setSource] = useState<ConsoleSource | "all">("all");
  const [severity, setSeverity] = useState<ConsoleSeverity | "all">("all");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");

  // Tab selection lives in the URL so dashboard KPIs can deep-link (?tab=roster).
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "dashboard";
  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };


  const { items, isLoading, isFetching, error, refetch, dataUpdatedAt } =
    useCommandConsoleFeed(true);

  const branchIds = useBranchFilter(units, branch);

  // Feed limited to the officer's own hierarchy reach, then to the picked branch.
  const scoped = useMemo(
    () =>
      items.filter(
        (i) =>
          scope.hasAccess(i.orgUnitId) &&
          (!branchIds || (i.orgUnitId ? branchIds.has(i.orgUnitId) : false)),
      ),
    [items, scope, branchIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((i) => {
      if (source !== "all" && i.source !== source) return false;
      if (severity !== "all" && i.severity !== severity) return false;
      if (state === "open" && !i.open) return false;
      if (state === "closed" && i.open) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.detail ?? "").toLowerCase().includes(q) ||
        (i.location ?? "").toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q)
      );
    });
  }, [scoped, source, severity, state, search]);

  const open = scoped.filter((i) => i.open);
  const critical = open.filter((i) => i.severity === "critical");
  const panic = open.filter((i) => i.source === "fleet" && i.title.toLowerCase().includes("panic"));
  const last24h = scoped.filter(
    (i) => i.occurredAt && Date.now() - new Date(i.occurredAt).getTime() < 86_400_000,
  );

  const liveAlerts = useMemo(
    () =>
      [...open]
        .sort(
          (a, b) =>
            CONSOLE_SEVERITIES.indexOf(a.severity) - CONSOLE_SEVERITIES.indexOf(b.severity) ||
            new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime(),
        )
        .slice(0, 40),
    [open],
  );

  const regional = useMemo(
    () => rollupByCommand(scoped, units, ["national", "regional"]),
    [scoped, units],
  );
  const sector = useMemo(
    () => rollupByCommand(scoped, units, ["sector", "district"]),
    [scoped, units],
  );

  const branchOptions = useMemo(
    () =>
      flattenOrgTree(tree).filter(
        (n) => ["national", "regional", "sector", "district"].includes(n.type) && scope.hasAccess(n.id),
      ),
    [tree, scope],
  );

  const unitName = (id: string | null) =>
    id ? orgUnitPath(units, id) || "—" : "Unattributed";

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MonitorDot className="h-6 w-6 text-primary" aria-hidden="true" />
            Command Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Live alerts, the incident register and readiness dashboards for Regional and Sector commands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live · {dataUpdatedAt ? formatDateTime(dataUpdatedAt) : "syncing"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Could not load part of the console feed: {error.message}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={ShieldAlert} label="Open incidents" value={open.length}
          hint={`${scoped.length} logged (30 days)`} tone={open.length > 0 ? "danger" : "default"} />
        <Kpi icon={Siren} label="Critical / unresolved" value={critical.length}
          tone={critical.length > 0 ? "danger" : "default"} />
        <Kpi icon={Radio} label="Active SOS" value={panic.length}
          tone={panic.length > 0 ? "danger" : "default"} />
        <Kpi icon={ListFilter} label="Logged in 24 h" value={last24h.length} />
        <Kpi icon={Network} label="Commands reporting"
          value={new Set(scoped.map((i) => i.orgUnitId).filter(Boolean)).size} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Select value={branch} onValueChange={(v) => setBranch(v as typeof branch)}>
            <SelectTrigger className="w-[260px]" aria-label="Command">
              <SelectValue placeholder="All commands in my reach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All commands in my reach</SelectItem>
              {branchOptions.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {"— ".repeat(n.depth)}{n.name} · {ORG_UNIT_TYPE_LABELS[n.type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="w-[170px]" aria-label="Source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(Object.keys(CONSOLE_SOURCE_LABELS) as ConsoleSource[]).map((s) => (
                <SelectItem key={s} value={s}>{CONSOLE_SOURCE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
            <SelectTrigger className="w-[160px]" aria-label="Severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {CONSOLE_SEVERITIES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={state} onValueChange={(v) => setState(v as typeof state)}>
            <SelectTrigger className="w-[150px]" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open only</SelectItem>
              <SelectItem value="closed">Closed only</SelectItem>
              <SelectItem value="all">Any status</SelectItem>
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incidents, locations…"
            className="w-[240px]"
            aria-label="Search incidents"
          />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="mr-1 h-4 w-4" aria-hidden="true" />Dashboard
            </TabsTrigger>
            <TabsTrigger value="live">
              <Radio className="mr-1 h-4 w-4" aria-hidden="true" />Live alerts
              {open.length > 0 && <Badge variant="outline" className="ml-2">{open.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <ListFilter className="mr-1 h-4 w-4" aria-hidden="true" />Incident list
            </TabsTrigger>
            <TabsTrigger value="inbox">
              <Inbox className="mr-1 h-4 w-4" aria-hidden="true" />Inbox
            </TabsTrigger>
            <TabsTrigger value="cyber">
              <ShieldAlert className="mr-1 h-4 w-4" aria-hidden="true" />Cyber
            </TabsTrigger>
            <TabsTrigger value="patrols">
              <Footprints className="mr-1 h-4 w-4" aria-hidden="true" />Patrol log
            </TabsTrigger>
            <TabsTrigger value="patrol-plans">
              <CalendarClock className="mr-1 h-4 w-4" aria-hidden="true" />Patrol plans
            </TabsTrigger>
            <TabsTrigger value="roster">
              <Users className="mr-1 h-4 w-4" aria-hidden="true" />Staff roster
            </TabsTrigger>
            <TabsTrigger value="on-duty">
              <Clock className="mr-1 h-4 w-4" aria-hidden="true" />On duty now
            </TabsTrigger>
            <TabsTrigger value="units">
              <Building2 className="mr-1 h-4 w-4" aria-hidden="true" />Unit roster
            </TabsTrigger>
            <TabsTrigger value="procurement">
              <ShoppingCart className="mr-1 h-4 w-4" aria-hidden="true" />Procurement
            </TabsTrigger>
            <TabsTrigger value="fuel-requests">
              <Fuel className="mr-1 h-4 w-4" aria-hidden="true" />Fuel requests
            </TabsTrigger>
            <TabsTrigger value="status">
              <Gauge className="mr-1 h-4 w-4" aria-hidden="true" />Status dashboards
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Command dashboard (attendance, vehicles, fuel, alerts) ────── */}
        <TabsContent value="dashboard" className="mt-4">
          <CommandDashboardTab
            branchName={branch === "all" ? undefined : orgUnitPath(units, branch) || undefined}
          />
        </TabsContent>

        {/* ── Live duty schedule ───────────────────────────────────────── */}
        <TabsContent value="on-duty" className="mt-4">
          <OnDutyNowPanel />
        </TabsContent>

        {/* ── Cyber incidents ──────────────────────────────────────────── */}
        <TabsContent value="cyber" className="mt-4">
          <CyberIncidentsTab units={units} tree={tree} canManage={isAdminOrSupervisor} />
        </TabsContent>

        {/* ── Patrol log (date, time, district, incidents, photos) ────── */}
        <TabsContent value="patrols" className="mt-4">
          <PatrolLogTab units={units} canReview={isAdminOrSupervisor} homeUnitId={homeUnitId} />
        </TabsContent>

        {/* ── Patrol plans (create, assign, close; linked to fleet) ───── */}
        <TabsContent value="patrol-plans" className="mt-4">
          <PatrolPlanTab units={units} canManage={isAdminOrSupervisor} homeUnitId={homeUnitId} />
        </TabsContent>

        {/* ── Procurement: request → approve → receive → audit ──────────── */}
        {/* ── Staff roster (roles, branch, contacts, photos) ───────────── */}
        <TabsContent value="roster" className="mt-4">
          <StaffRosterTab
            orgUnitId={branch === "all" ? undefined : branch}
            branchName={branch === "all" ? undefined : orgUnitPath(units, branch) || undefined}
          />
        </TabsContent>

        {/* ── Unit roster (unit, commander, rank, posting, contact) ────── */}
        <TabsContent value="units" className="mt-4">
          <UnitRosterTab />
        </TabsContent>

        <TabsContent value="procurement" className="mt-4">
          <ProcurementTab />
        </TabsContent>

        {/* ── Fuel requests: raise → approve → issue → audit ──────────── */}
        <TabsContent value="fuel-requests" className="mt-4">
          <FuelRequestsTab
            canApprove={isAdminOrSupervisor}
            branchName={branch === "all" ? undefined : orgUnitPath(units, branch) || undefined}
          />
        </TabsContent>



        {/* ── Live alerts ───────────────────────────────────────────────── */}
        <TabsContent value="live" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open signals, highest severity first</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading || orgLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading live feed…</p>
              ) : liveAlerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing outstanding — all commands in scope are clear.
                </p>
              ) : (
                liveAlerts.map((a) => <AlertRow key={a.key} item={a} unitName={unitName} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Incident list ─────────────────────────────────────────────── */}
        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Incident register · {filtered.length} record{filtered.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Logged</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Incident</TableHead>
                      <TableHead>Command</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Module</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No incidents match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.slice(0, 300).map((i) => (
                        <TableRow key={i.key}>
                          <TableCell className="whitespace-nowrap text-xs">{formatDateTime(i.occurredAt)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{CONSOLE_SOURCE_LABELS[i.source]}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            <div className="truncate font-medium capitalize">{i.title}</div>
                            {(i.detail || i.location) && (
                              <div className="truncate text-xs text-muted-foreground">
                                {[i.location, i.detail].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {unitName(i.orgUnitId)}
                          </TableCell>
                          <TableCell><SeverityBadge severity={i.severity} /></TableCell>
                          <TableCell>
                            <Badge variant={i.open ? "default" : "secondary"} className="capitalize">
                              {i.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to={i.href}>
                                Open <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inbox ─────────────────────────────────────────────────────── */}
        <TabsContent value="inbox" className="mt-4">
          <CommandInboxTab units={units} tree={tree} canManage={isAdminOrSupervisor} />
        </TabsContent>

        {/* ── Status dashboards ─────────────────────────────────────────── */}
        <TabsContent value="status" className="mt-4 space-y-4">
          <StatusBoard title="Regional commands" rows={regional} />
          <StatusBoard title="Sector & district commands" rows={sector} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AlertRow({
  item, unitName,
}: { item: ConsoleIncident; unitName: (id: string | null) => string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${
        item.severity === "critical" ? "border-destructive/40 bg-destructive/5" : "bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{CONSOLE_SOURCE_LABELS[item.source]}</Badge>
          <SeverityBadge severity={item.severity} />
          <span className="truncate font-medium capitalize">{item.title}</span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {[formatDateTime(item.occurredAt), unitName(item.orgUnitId), item.location, item.detail]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={item.href}>Respond</Link>
      </Button>
    </div>
  );
}

function StatusBoard({
  title, rows,
}: { title: string; rows: ReturnType<typeof rollupByCommand> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No commands at this level are in scope.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Command</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Critical</TableHead>
                  <TableHead className="text-right">Logged</TableHead>
                  <TableHead>Breakdown</TableHead>
                  <TableHead>Last signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.orgUnitId ?? "unassigned"}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">{r.type}</div>
                    </TableCell>
                    <TableCell className="w-[160px]">
                      <Progress value={r.readiness} className="h-2" />
                      <div className="mt-1 text-xs text-muted-foreground">{r.readiness}%</div>
                    </TableCell>
                    <TableCell className="text-right">{r.open}</TableCell>
                    <TableCell className="text-right">
                      {r.critical > 0
                        ? <span className="font-semibold text-destructive">{r.critical}</span>
                        : 0}
                    </TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(CONSOLE_SOURCE_LABELS) as ConsoleSource[])
                          .filter((s) => r.bySource[s] > 0)
                          .map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">
                              {CONSOLE_SOURCE_LABELS[s]} {r.bySource[s]}
                            </Badge>
                          ))}
                        {r.total === 0 && <span className="text-xs text-muted-foreground">Clear</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.latestAt ? formatDateTime(r.latestAt) : "—"}
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
