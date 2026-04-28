import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, RefreshCw, Loader2, Search, Heart, Scissors, Filter } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface PresenceEventRow {
  id: string;
  user_id: string;
  event_type: "heartbeat" | "prune";
  current_page: string | null;
  last_active_at: string;
  pruned_at: string | null;
  window_minutes: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
}

const RANGES = [
  { label: "Last hour", hours: 1 },
  { label: "Last 6 hours", hours: 6 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
];
const ALL = "__all__";

export function PresenceEventsPanel() {
  const [hours, setHours] = useState(24);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const { data: events = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["presence-events", hours],
    queryFn: async (): Promise<PresenceEventRow[]> => {
      const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("presence_events")
        .select("*")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as PresenceEventRow[];
    },
    refetchInterval: 30_000,
  });

  // Resolve user profiles for display
  const userIds = useMemo(() => Array.from(new Set(events.map((e) => e.user_id))), [events]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["presence-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, staff_id, first_name, last_name")
        .in("user_id", userIds);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    let out = events;
    if (typeFilter !== ALL) out = out.filter((e) => e.event_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((e) => {
        const p = profileMap.get(e.user_id);
        const name = p ? `${p.first_name} ${p.last_name} ${p.staff_id}`.toLowerCase() : "";
        return (
          e.user_id.toLowerCase().includes(q) ||
          (e.current_page ?? "").toLowerCase().includes(q) ||
          name.includes(q)
        );
      });
    }
    return out;
  }, [events, typeFilter, search, profileMap]);

  const stats = useMemo(() => {
    let heartbeats = 0;
    let prunes = 0;
    const users = new Set<string>();
    filtered.forEach((e) => {
      users.add(e.user_id);
      if (e.event_type === "heartbeat") heartbeats++;
      else prunes++;
    });
    return { heartbeats, prunes, uniqueUsers: users.size, total: filtered.length };
  }, [filtered]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" /> Presence Event Log
            </CardTitle>
            <CardDescription>
              Heartbeat and prune events recorded per user (admin troubleshooting for the “Online Now” panel).
              Rows older than 7 days are auto-purged.
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Total events" value={stats.total} />
          <Tile label="Heartbeats" value={stats.heartbeats} />
          <Tile label="Prunes" value={stats.prunes} />
          <Tile label="Unique users" value={stats.uniqueUsers} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Type:</span>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All events</SelectItem>
              <SelectItem value="heartbeat">Heartbeats only</SelectItem>
              <SelectItem value="prune">Prunes only</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, Staff ID, user ID, or route…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading presence events…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No presence events match the current filters.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Pruned At</TableHead>
                  <TableHead>Window</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const p = profileMap.get(e.user_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div>{format(new Date(e.created_at), "PPp")}</div>
                        <div className="text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.event_type === "heartbeat" ? (
                          <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                            <Heart className="h-3 w-3" /> Heartbeat
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
                            <Scissors className="h-3 w-3" /> Prune
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p ? (
                          <div>
                            <div className="font-medium">{p.first_name} {p.last_name}</div>
                            <div className="font-mono text-muted-foreground">{p.staff_id}</div>
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">{e.user_id.slice(0, 8)}…</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{e.current_page ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(e.last_active_at), "PPp")}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {e.pruned_at ? format(new Date(e.pruned_at), "PPp") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.window_minutes != null ? `${e.window_minutes} min` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
