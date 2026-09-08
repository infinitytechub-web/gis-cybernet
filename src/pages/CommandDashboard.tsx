import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserMinus,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadBlob } from "@/lib/download-utils";

interface CommandUnit {
  id: string;
  name: string | null;
  type: string | null;
  officer_count: number | null;
}

interface DashboardOfficer {
  id: string;
  staff_id: string | null;
  name: string | null;
  rank: string | null;
  shift_group: string | null;
  status: string | null;
  position_title: string | null;
  portal_visits: number | null;
  last_portal_at: string | null;
}

interface DashboardData {
  allowed: boolean;
  reason?: string;
  unit?: { id: string; name: string | null; type: string | null } | null;
  month_start?: string;
  totals?: {
    officers: number;
    active: number;
    positions: number;
    vacancies: number;
    portal_reached: number;
  };
  officers?: DashboardOfficer[];
  ranks?: { rank: string; level: number | null; officers: number }[];
  vacancies?: { id: string; title: string | null; level: string | null; notes: string | null }[];
  posted_positions?: {
    id: string;
    title: string | null;
    level: string | null;
    holder: string | null;
    holder_rank: string | null;
    start_date: string | null;
  }[];
}

const DENIAL_TEXT: Record<string, string> = {
  no_profile: "Your account is not linked to a staff record yet.",
  not_authorized: "You have not been posted to a command, or viewing is switched off for your role.",
  no_command: "You have not been posted to a command yet.",
  out_of_scope: "That command is outside the scope allowed for your role.",
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Live command dashboard — one command at a time.
 *
 * Both the command list and the snapshot come from server functions that
 * resolve the signed-in officer's own posting and permission-matrix scope, so a
 * command that is out of scope returns nothing even if its id is typed in.
 */
export default function CommandDashboard() {
  const [unitId, setUnitId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["command-dashboard-units"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("command_dashboard_units");
      if (error) throw error;
      return (data ?? []) as CommandUnit[];
    },
  });

  const units = unitsQuery.data ?? [];
  const selectedUnit = unitId ?? units[0]?.id ?? null;

  const dashQuery = useQuery({
    queryKey: ["command-dashboard-live", selectedUnit],
    enabled: !unitsQuery.isLoading,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("command_dashboard_live", {
        _org_unit_id: selectedUnit,
      });
      if (error) throw error;
      return (data ?? { allowed: false, reason: "not_authorized" }) as DashboardData;
    },
  });

  const data = dashQuery.data;
  const officers = data?.officers ?? [];

  const filteredOfficers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return officers;
    return officers.filter((o) =>
      [o.name, o.staff_id, o.rank, o.position_title, o.shift_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [officers, search]);

  const reachedOfficers = useMemo(
    () => officers.filter((o) => (o.portal_visits ?? 0) > 0),
    [officers],
  );

  const exportCsv = () => {
    const rows = [
      ["Staff ID", "Officer", "Rank", "Posted position", "Shift", "Status", "Portal visits this month", "Last portal visit"],
      ...filteredOfficers.map((o) => [
        o.staff_id ?? "",
        o.name ?? "",
        o.rank ?? "",
        o.position_title ?? "",
        o.shift_group ?? "",
        o.status ?? "",
        String(o.portal_visits ?? 0),
        o.last_portal_at ? new Date(o.last_portal_at).toISOString() : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      `command-dashboard-${(data?.unit?.name ?? "command").replace(/\s+/g, "-").toLowerCase()}.csv`,
    );
  };

  if (unitsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading commands…
      </div>
    );
  }

  if (dashQuery.error) {
    return (
      <Card className="m-4 border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Could not load the command dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {(dashQuery.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (data && !data.allowed) {
    return (
      <Card className="m-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> No command dashboard available
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {DENIAL_TEXT[data.reason ?? ""] ?? "You are not authorised to view this dashboard."}
        </CardContent>
      </Card>
    );
  }

  const totals = data?.totals;
  const fillRate =
    totals && totals.positions > 0
      ? Math.round(((totals.positions - totals.vacancies) / totals.positions) * 100)
      : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live picture of one command: officers on strength, unfilled posts, posted ranks and who
            reached their portal this month.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {units.length > 1 && (
            <Select value={selectedUnit ?? undefined} onValueChange={setUnitId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select a command" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.officer_count ? `(${u.officer_count})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" onClick={() => dashQuery.refetch()} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${dashQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Officers on strength
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals?.officers ?? 0}</div>
            <p className="text-xs text-muted-foreground">{totals?.active ?? 0} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserMinus className="h-4 w-4" /> Vacancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals?.vacancies ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              of {totals?.positions ?? 0} posts{fillRate !== null ? ` · ${fillRate}% filled` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" /> Posted ranks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.ranks?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">distinct ranks in this command</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> Reached the portal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totals?.portal_reached ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              this month{totals?.officers ? ` of ${totals.officers} officers` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="officers">
        <TabsList>
          <TabsTrigger value="officers">Officers</TabsTrigger>
          <TabsTrigger value="vacancies">Vacancies</TabsTrigger>
          <TabsTrigger value="ranks">Posted ranks</TabsTrigger>
          <TabsTrigger value="portal">Portal this month</TabsTrigger>
        </TabsList>

        <TabsContent value="officers" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search officer, staff ID, rank or post"
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filteredOfficers.length}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Officer</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Posted position</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Portal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOfficers.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name || "—"}</TableCell>
                    <TableCell>{o.staff_id ?? "—"}</TableCell>
                    <TableCell>{o.rank ?? "—"}</TableCell>
                    <TableCell>{o.position_title ?? "—"}</TableCell>
                    <TableCell>{o.shift_group ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === "active" ? "default" : "secondary"}>
                        {o.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(o.portal_visits ?? 0) > 0 ? (
                        <span className="text-xs">
                          {o.portal_visits}× · {fmtDateTime(o.last_portal_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredOfficers.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No officers to show.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="vacancies" className="mt-4">
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Vacant post</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.vacancies ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.title ?? "—"}</TableCell>
                    <TableCell className="capitalize">{(v.level ?? "—").replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-muted-foreground">{v.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!(data?.vacancies ?? []).length && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No vacant posts recorded for this command.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ranks" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Officers by rank</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.ranks ?? []).map((r) => {
                const max = Math.max(...(data?.ranks ?? []).map((x) => x.officers), 1);
                return (
                  <div key={r.rank} className="flex items-center gap-3">
                    <span className="w-56 shrink-0 truncate text-sm">{r.rank}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(r.officers / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-sm font-medium">{r.officers}</span>
                  </div>
                );
              })}
              {!(data?.ranks ?? []).length && (
                <p className="text-sm text-muted-foreground">No ranks recorded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filled posts</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Holder</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.posted_positions ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title ?? "—"}</TableCell>
                      <TableCell className="capitalize">{(p.level ?? "—").replace(/_/g, " ")}</TableCell>
                      <TableCell>{p.holder || "—"}</TableCell>
                      <TableCell>{p.holder_rank ?? "—"}</TableCell>
                      <TableCell>
                        {p.start_date ? new Date(p.start_date).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(data?.posted_positions ?? []).length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No filled posts recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portal" className="mt-4">
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Officer</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Visits this month</TableHead>
                  <TableHead>Last visit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reachedOfficers.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name || "—"}</TableCell>
                    <TableCell>{o.rank ?? "—"}</TableCell>
                    <TableCell>{o.portal_visits}</TableCell>
                    <TableCell>{fmtDateTime(o.last_portal_at)}</TableCell>
                  </TableRow>
                ))}
                {!reachedOfficers.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No officer in this command has opened the portal this month.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
