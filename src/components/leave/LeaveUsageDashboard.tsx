/**
 * LEAVE USAGE DASHBOARD
 *
 * Reads the `leave_usage_by_location` RPC, which totals approved and pending
 * leave days grouped by region, station and leave type for a given year. The
 * RPC scopes visibility itself (command tier sees their reach, staff see only
 * their own record).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarRange, MapPinned, RefreshCw, Search } from "lucide-react";

const db = supabase as any;

const ALL = "all";

const TYPE_LABELS: Record<string, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  compassionate: "Compassionate leave",
  pass: "Pass",
  study: "Study leave",
};

type UsageRow = {
  region_name: string;
  station_name: string;
  leave_type: string;
  approved_days: number;
  pending_days: number;
  staff_count: number;
  request_count: number;
  latitude: number | null;
  longitude: number | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function LeaveUsageDashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [groupBy, setGroupBy] = useState<"region" | "station" | "type">("region");
  const [type, setType] = useState<string>(ALL);
  const [region, setRegion] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["leave-usage-by-location", year],
    queryFn: async (): Promise<UsageRow[]> => {
      const { data, error } = await db.rpc("leave_usage_by_location", { _year: year });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const regions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.region_name).filter(Boolean))).sort(),
    [rows],
  );
  const types = useMemo(
    () => Array.from(new Set(rows.map((r) => r.leave_type).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== ALL && r.leave_type !== type) return false;
      if (region !== ALL && r.region_name !== region) return false;
      if (!q) return true;
      return `${r.region_name} ${r.station_name} ${r.leave_type}`.toLowerCase().includes(q);
    });
  }, [rows, type, region, search]);

  const totals = useMemo(() => {
    const approved = filtered.reduce((s, r) => s + num(r.approved_days), 0);
    const pending = filtered.reduce((s, r) => s + num(r.pending_days), 0);
    const requests = filtered.reduce((s, r) => s + num(r.request_count), 0);
    const stations = new Set(filtered.map((r) => r.station_name)).size;
    const located = new Set(
      filtered.filter((r) => r.latitude != null && r.longitude != null).map((r) => r.station_name),
    ).size;
    return { approved, pending, requests, stations, located };
  }, [filtered]);

  const chartData = useMemo(() => {
    const map = new Map<string, { label: string; approved: number; pending: number }>();
    for (const r of filtered) {
      const key =
        groupBy === "region"
          ? r.region_name || "Unassigned"
          : groupBy === "station"
            ? r.station_name || "Unassigned"
            : TYPE_LABELS[r.leave_type] ?? r.leave_type;
      const entry = map.get(key) ?? { label: key, approved: 0, pending: 0 };
      entry.approved += num(r.approved_days);
      entry.pending += num(r.pending_days);
      map.set(key, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => b.approved - a.approved || a.label.localeCompare(b.label))
      .slice(0, 12);
  }, [filtered, groupBy]);

  const tableRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          a.region_name.localeCompare(b.region_name) ||
          a.station_name.localeCompare(b.station_name) ||
          a.leave_type.localeCompare(b.leave_type),
      ),
    [filtered],
  );

  const years = useMemo(
    () => [currentYear + 1, currentYear, currentYear - 1, currentYear - 2],
    [currentYear],
  );

  return (
    <Card className="mt-6">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Leave dashboard — approved days by region, station and type
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger aria-label="Year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger aria-label="Region">
              <SelectValue placeholder="All regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Leave type">
              <SelectValue placeholder="All leave types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All leave types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search region or station"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search leave usage"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Approved days" value={totals.approved} />
          <StatCard label="Awaiting decision" value={totals.pending} muted />
          <StatCard label="Requests in year" value={totals.requests} muted />
          <StatCard
            label="Stations covered"
            value={totals.stations}
            hint={`${totals.located} on the map`}
            muted
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Group chart by</span>
            {(["region", "station", "type"] as const).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={groupBy === g ? "default" : "outline"}
                onClick={() => setGroupBy(g)}
              >
                {g === "type" ? "Leave type" : g === "region" ? "Region" : "Station / unit"}
              </Button>
            ))}
          </div>
          <div className="h-72 w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {isLoading ? "Loading leave records…" : "No leave records for this selection."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--popover-foreground))",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="approved" name="Approved days" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Awaiting" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Region</TableHead>
                  <TableHead>Station / unit</TableHead>
                  <TableHead>Leave type</TableHead>
                  <TableHead className="text-right">Approved days</TableHead>
                  <TableHead className="text-right">Awaiting</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead>On map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      {isLoading ? "Loading…" : "Nothing to show for this selection."}
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((r, i) => (
                    <TableRow key={`${r.region_name}-${r.station_name}-${r.leave_type}-${i}`}>
                      <TableCell className="font-medium">{r.region_name}</TableCell>
                      <TableCell>{r.station_name}</TableCell>
                      <TableCell>{TYPE_LABELS[r.leave_type] ?? r.leave_type}</TableCell>
                      <TableCell className="text-right font-semibold">{num(r.approved_days)}</TableCell>
                      <TableCell className="text-right">{num(r.pending_days)}</TableCell>
                      <TableCell className="text-right">{num(r.staff_count)}</TableCell>
                      <TableCell>
                        {r.latitude != null && r.longitude != null ? (
                          <Badge variant="secondary" className="gap-1">
                            <MapPinned className="h-3 w-3" /> Located
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No coordinates</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: number;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${muted ? "text-foreground" : "text-primary"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
