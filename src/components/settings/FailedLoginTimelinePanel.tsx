import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, RefreshCw, Loader2, Search, Globe, IdCard, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface AttemptRow {
  id: string;
  staff_id: string;
  ip_address: string | null;
  attempted_at: string;
}

interface BurstGroup {
  key: string;
  groupedBy: "staff_id" | "ip_address";
  identifier: string;
  count: number;
  first: string;
  last: string;
  attempts: AttemptRow[];
}

const RANGES = [
  { label: "Last hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
];

export function FailedLoginTimelinePanel() {
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["failed-login-timeline", hours],
    queryFn: async (): Promise<AttemptRow[]> => {
      const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("failed_login_attempts")
        .select("id, staff_id, ip_address, attempted_at")
        .gte("attempted_at", cutoff)
        .order("attempted_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.staff_id.toLowerCase().includes(q) ||
        (r.ip_address ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const uniqueStaff = new Set(filtered.map((r) => r.staff_id));
    const uniqueIp = new Set(filtered.map((r) => r.ip_address).filter(Boolean) as string[]);
    return { total: filtered.length, uniqueStaff: uniqueStaff.size, uniqueIp: uniqueIp.size };
  }, [filtered]);

  // Group bursts: 5+ attempts within any 60-second window per identifier
  const groupBursts = (groupBy: "staff_id" | "ip_address"): BurstGroup[] => {
    const map = new Map<string, AttemptRow[]>();
    filtered.forEach((r) => {
      const key = groupBy === "staff_id" ? r.staff_id : r.ip_address;
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    const groups: BurstGroup[] = [];
    map.forEach((attempts, identifier) => {
      // attempts are already sorted desc; sort asc for sliding window
      const sorted = [...attempts].sort(
        (a, b) => new Date(a.attempted_at).getTime() - new Date(b.attempted_at).getTime(),
      );
      let i = 0;
      while (i < sorted.length) {
        const windowStart = new Date(sorted[i].attempted_at).getTime();
        let j = i;
        while (
          j < sorted.length &&
          new Date(sorted[j].attempted_at).getTime() - windowStart <= 60_000
        ) {
          j++;
        }
        const burst = sorted.slice(i, j);
        if (burst.length >= 5) {
          groups.push({
            key: `${groupBy}:${identifier}:${burst[0].id}`,
            groupedBy: groupBy,
            identifier,
            count: burst.length,
            first: burst[0].attempted_at,
            last: burst[burst.length - 1].attempted_at,
            attempts: [...burst].reverse(),
          });
          i = j;
        } else {
          i++;
        }
      }
    });

    return groups.sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  };

  const staffBursts = useMemo(() => groupBursts("staff_id"), [filtered]);
  const ipBursts = useMemo(() => groupBursts("ip_address"), [filtered]);

  const renderBursts = (groups: BurstGroup[], emptyMsg: string) => {
    if (groups.length === 0) {
      return (
        <div className="text-center py-10 text-sm text-muted-foreground">{emptyMsg}</div>
      );
    }
    return (
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key} className="rounded-lg border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-destructive/5 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-mono text-sm font-semibold">{g.identifier}</span>
                <Badge variant="outline" className="text-destructive border-destructive/30">
                  {g.count} attempts in {Math.max(1, Math.round((new Date(g.last).getTime() - new Date(g.first).getTime()) / 1000))}s
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(g.first), "PPp")} → {format(new Date(g.last), "p")}
                <span className="ml-2">({formatDistanceToNow(new Date(g.last), { addSuffix: true })})</span>
              </div>
            </div>
            <ol className="relative border-l-2 border-border ml-6 my-3 space-y-2">
              {g.attempts.map((a) => (
                <li key={a.id} className="ml-4 pl-3 py-1">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {format(new Date(a.attempted_at), "PPp")}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <IdCard className="h-3 w-3 text-muted-foreground" /> {a.staff_id}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Globe className="h-3 w-3 text-muted-foreground" />{" "}
                      {a.ip_address ?? <span className="italic text-muted-foreground">unknown</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  };

  const renderAllAttempts = () => {
    if (filtered.length === 0) {
      return (
        <div className="text-center py-10 text-sm text-muted-foreground">
          ✓ No failed login attempts in this time window.
        </div>
      );
    }
    return (
      <ol className="relative border-l-2 border-border ml-6 space-y-2">
        {filtered.map((a) => (
          <li key={a.id} className="ml-4 pl-3 py-1">
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-chart-4 ring-2 ring-background" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground tabular-nums">
                {format(new Date(a.attempted_at), "PPp")}
              </span>
              <span className="text-muted-foreground">
                ({formatDistanceToNow(new Date(a.attempted_at), { addSuffix: true })})
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <IdCard className="h-3 w-3 text-muted-foreground" /> {a.staff_id}
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Globe className="h-3 w-3 text-muted-foreground" />{" "}
                {a.ip_address ?? <span className="italic text-muted-foreground">unknown</span>}
              </span>
            </div>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-destructive" /> Failed Login Audit Timeline
            </CardTitle>
            <CardDescription>
              Chronological audit of failed login attempts grouped by Staff ID and IP. A "burst" is 5+ attempts within 60 seconds.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.hours} value={String(r.hours)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Total attempts" value={stats.total} />
          <StatTile label="Unique Staff IDs" value={stats.uniqueStaff} />
          <StatTile label="Unique IPs" value={stats.uniqueIp} />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by Staff ID or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…
          </div>
        ) : (
          <Tabs defaultValue="staff-bursts">
            <TabsList>
              <TabsTrigger value="staff-bursts" className="gap-1.5">
                <IdCard className="h-3.5 w-3.5" /> Staff ID bursts
                <Badge variant="secondary" className="ml-1">{staffBursts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ip-bursts" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" /> IP bursts
                <Badge variant="secondary" className="ml-1">{ipBursts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5">
                <History className="h-3.5 w-3.5" /> All attempts
                <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="staff-bursts" className="mt-4">
              {renderBursts(staffBursts, "✓ No repeated-burst patterns by Staff ID in this window.")}
            </TabsContent>
            <TabsContent value="ip-bursts" className="mt-4">
              {renderBursts(ipBursts, "✓ No repeated-burst patterns by IP address in this window.")}
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              {renderAllAttempts()}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
