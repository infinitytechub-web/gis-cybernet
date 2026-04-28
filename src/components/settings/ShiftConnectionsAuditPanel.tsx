import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Link2,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  Download,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { downloadCSVString } from "@/lib/download-utils";

interface ConnectionRow {
  id: string;
  profile_id: string;
  platform: string;
  platform_username: string | null;
  is_connected: boolean;
  offline_mode: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileLite {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
}

const ALL = "__all__";

function esc(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ShiftConnectionsAuditPanel() {
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [isPurging, setIsPurging] = useState(false);

  const { data: connections = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-shift-connections"],
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await supabase
        .from("shift_platform_connections" as any)
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ConnectionRow[];
    },
    refetchInterval: 30_000,
  });

  const profileIds = useMemo(
    () => Array.from(new Set(connections.map((c) => c.profile_id))),
    [connections],
  );
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-shift-connection-profiles", profileIds.sort().join(",")],
    enabled: profileIds.length > 0,
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name")
        .in("id", profileIds);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const platformOptions = useMemo(() => {
    const counts = new Map<string, number>();
    connections.forEach((c) => counts.set(c.platform, (counts.get(c.platform) ?? 0) + 1));
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [connections]);

  const filtered = useMemo(() => {
    let out = connections;
    if (platformFilter !== ALL) out = out.filter((c) => c.platform === platformFilter);
    if (statusFilter !== ALL) {
      const wantConnected = statusFilter === "connected";
      out = out.filter((c) => c.is_connected === wantConnected);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((c) => {
        const p = profileMap.get(c.profile_id);
        const name = p ? `${p.first_name} ${p.last_name} ${p.staff_id}`.toLowerCase() : "";
        return (
          c.platform.toLowerCase().includes(q) ||
          (c.platform_username ?? "").toLowerCase().includes(q) ||
          name.includes(q)
        );
      });
    }
    return out;
  }, [connections, platformFilter, statusFilter, search, profileMap]);

  const stats = useMemo(() => {
    let connected = 0;
    let offline = 0;
    const platforms = new Set<string>();
    const staff = new Set<string>();
    filtered.forEach((c) => {
      platforms.add(c.platform);
      staff.add(c.profile_id);
      if (c.is_connected) connected++;
      if (c.offline_mode) offline++;
    });
    return {
      total: filtered.length,
      connected,
      offline,
      platforms: platforms.size,
      staff: staff.size,
    };
  }, [filtered]);

  const handleExportCsv = () => {
    const headers = [
      "Connected At",
      "Last Sync",
      "Staff ID",
      "Staff Name",
      "Platform",
      "Platform Username",
      "Status",
      "Offline Mode",
    ];
    const lines = [headers.join(",")];
    for (const c of filtered) {
      const p = profileMap.get(c.profile_id);
      lines.push(
        [
          c.created_at,
          c.last_sync_at ?? "",
          p?.staff_id ?? "",
          p ? `${p.first_name} ${p.last_name}`.trim() : "",
          c.platform,
          c.platform_username ?? "",
          c.is_connected ? "Connected" : "Disconnected",
          c.offline_mode ? "Yes" : "No",
        ]
          .map(esc)
          .join(","),
      );
    }
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    downloadCSVString(lines.join("\n"), `shift-connections_${stamp}.csv`);
    toast.success(`Exported ${filtered.length} connection${filtered.length === 1 ? "" : "s"}.`);
  };

  const handlePurgeAll = async () => {
    setIsPurging(true);
    try {
      const { data, error } = await supabase.rpc("admin_purge_shift_connections" as any);
      if (error) throw error;
      const deleted = typeof data === "number" ? data : 0;
      toast.success(`Purged ${deleted} shift platform connection${deleted === 1 ? "" : "s"}.`);
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to purge connections.");
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" /> Shift Platform Connections — Audit Tray
            </CardTitle>
            <CardDescription>
              All device connections to third-party shift platforms (TrackTik, Deputy, Sling, etc.)
              recorded across staff profiles. Admin-only: export CSV or purge every connection.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={connections.length === 0 || isPurging}
                  className="gap-1.5"
                >
                  {isPurging ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Purge all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Purge all shift platform connections?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove <strong>all {connections.length}</strong>{" "}
                    device-to-platform connection records across every staff member.
                    Staff will need to re-link their accounts. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handlePurgeAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Purge all connections
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Tile label="Total records" value={stats.total} />
          <Tile label="Connected" value={stats.connected} />
          <Tile label="Offline mode" value={stats.offline} />
          <Tile label="Platforms" value={stats.platforms} />
          <Tile label="Staff" value={stats.staff} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Platform:</span>
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="All platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All platforms ({platformOptions.length})</SelectItem>
              {platformOptions.map(([id, count]) => (
                <SelectItem key={id} value={id}>
                  {id} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="connected">Connected only</SelectItem>
              <SelectItem value="disconnected">Disconnected only</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, Staff ID, platform, or username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No shift platform connections match the current filters.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Platform Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Connected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const p = profileMap.get(c.profile_id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">
                        {p ? (
                          <div>
                            <div className="font-medium">
                              {p.first_name} {p.last_name}
                            </div>
                            <div className="font-mono text-muted-foreground">{p.staff_id}</div>
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {c.profile_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{c.platform}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.platform_username ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {c.is_connected ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 w-fit"
                            >
                              <Wifi className="h-3 w-3" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground w-fit">
                              <WifiOff className="h-3 w-3" /> Disconnected
                            </Badge>
                          )}
                          {c.offline_mode && (
                            <Badge variant="secondary" className="text-[10px] w-fit">
                              Offline mode
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {c.last_sync_at ? (
                          <div>
                            <div>{format(new Date(c.last_sync_at), "PPp")}</div>
                            <div className="text-muted-foreground">
                              {formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true })}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {format(new Date(c.created_at), "PPp")}
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
