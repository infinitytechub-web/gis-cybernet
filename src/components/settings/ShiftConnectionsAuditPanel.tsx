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
  IdCard,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PowerOff, FileJson, FileSpreadsheet } from "lucide-react";

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
  const [openRow, setOpenRow] = useState<ConnectionRow | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["admin-shift-connection-history", openRow?.profile_id, openRow?.platform],
    enabled: !!openRow,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_sync_history" as any)
        .select("id, action, sync_status, synced_at, error_message")
        .eq("profile_id", openRow!.profile_id)
        .eq("platform", openRow!.platform)
        .order("synced_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{
        id: string;
        action: string;
        sync_status: string;
        synced_at: string;
        error_message: string | null;
      }>;
    },
  });

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

  const handleDisconnectDevice = async () => {
    if (!openRow) return;
    setIsDisconnecting(true);
    try {
      const { error } = await supabase
        .from("shift_platform_connections" as any)
        .update({ is_connected: false, offline_mode: false, updated_at: new Date().toISOString() })
        .eq("id", openRow.id);
      if (error) throw error;
      toast.success(`Disconnected ${openRow.platform} for this staff profile.`);
      setOpenRow({ ...openRow, is_connected: false, offline_mode: false });
      setConfirmDisconnect(false);
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to disconnect device.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleExportConnection = (fmt: "csv" | "json") => {
    if (!openRow) return;
    const p = profileMap.get(openRow.profile_id);
    const stamp = format(new Date(), "yyyyMMdd-HHmm");
    const tag = (p?.staff_id ?? openRow.profile_id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
    const baseName = `connection_${tag}_${openRow.platform}_${stamp}`;

    if (fmt === "json") {
      const payload = {
        exported_at: new Date().toISOString(),
        staff: p
          ? { id: p.id, staff_id: p.staff_id, first_name: p.first_name, last_name: p.last_name }
          : { id: openRow.profile_id },
        platform: {
          name: openRow.platform,
          username: openRow.platform_username,
          is_connected: openRow.is_connected,
          offline_mode: openRow.offline_mode,
          connected_at: openRow.created_at,
          last_sync_at: openRow.last_sync_at,
          updated_at: openRow.updated_at,
        },
        sync_history: history,
      };
      downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        `${baseName}.json`,
      );
    } else {
      const lines: string[] = [];
      lines.push("Section,Field,Value");
      lines.push(["Staff", "Staff ID", p?.staff_id ?? ""].map(esc).join(","));
      lines.push(["Staff", "Name", p ? `${p.first_name} ${p.last_name}`.trim() : ""].map(esc).join(","));
      lines.push(["Staff", "Profile ID", openRow.profile_id].map(esc).join(","));
      lines.push(["Platform", "Name", openRow.platform].map(esc).join(","));
      lines.push(["Platform", "Username", openRow.platform_username ?? ""].map(esc).join(","));
      lines.push(["Platform", "Status", openRow.is_connected ? "Connected" : "Disconnected"].map(esc).join(","));
      lines.push(["Platform", "Offline mode", openRow.offline_mode ? "Yes" : "No"].map(esc).join(","));
      lines.push(["Platform", "Connected at", openRow.created_at].map(esc).join(","));
      lines.push(["Platform", "Last sync", openRow.last_sync_at ?? ""].map(esc).join(","));
      lines.push("");
      lines.push("Sync History");
      lines.push(["Synced At", "Action", "Status", "Error"].map(esc).join(","));
      for (const h of history) {
        lines.push([h.synced_at, h.action, h.sync_status, h.error_message ?? ""].map(esc).join(","));
      }
      downloadCSVString(lines.join("\n"), `${baseName}.csv`);
    }
    toast.success(`Exported connection as ${fmt.toUpperCase()}.`);
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
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenRow(c)}
                    >
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

      <Sheet open={!!openRow} onOpenChange={(v) => { if (!v) setOpenRow(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {openRow && (() => {
            const p = profileMap.get(openRow.profile_id);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-4 w-4 text-primary" /> Connection details
                  </SheetTitle>
                  <SheetDescription>
                    Staff/device pairing and recent sync history for this shift platform link.
                  </SheetDescription>
                </SheetHeader>

                {/* Drawer actions */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={historyLoading}>
                        <Download className="h-3.5 w-3.5" /> Export this connection
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleExportConnection("csv")} className="gap-2">
                        <FileSpreadsheet className="h-4 w-4" /> Download as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportConnection("json")} className="gap-2">
                        <FileJson className="h-4 w-4" /> Download as JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        disabled={!openRow.is_connected || isDisconnecting}
                      >
                        {isDisconnecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PowerOff className="h-3.5 w-3.5" />
                        )}
                        Disconnect device
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect this device?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will disable the <strong>{openRow.platform}</strong> connection for{" "}
                          <strong>
                            {p ? `${p.first_name} ${p.last_name} (${p.staff_id})` : "this staff profile"}
                          </strong>
                          . They will need to re-link the platform to resume syncing. The connection
                          record and its history will be preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDisconnectDevice}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="space-y-4 mt-4">
                  {/* Staff card */}
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Staff
                    </div>
                    {p ? (
                      <>
                        <div className="font-medium">{p.first_name} {p.last_name}</div>
                        <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                          <IdCard className="h-3 w-3" /> {p.staff_id}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs font-mono text-muted-foreground">
                        Profile {openRow.profile_id.slice(0, 8)}…
                      </div>
                    )}
                  </div>

                  {/* Connection card */}
                  <div className="rounded-lg border p-3 space-y-2 text-sm">
                    <Field label="Platform" value={openRow.platform} mono />
                    <Field
                      label="Platform username"
                      value={openRow.platform_username ?? "—"}
                      mono={!!openRow.platform_username}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Status</span>
                      {openRow.is_connected ? (
                        <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                          <Wifi className="h-3 w-3" /> Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <WifiOff className="h-3 w-3" /> Disconnected
                        </Badge>
                      )}
                    </div>
                    {openRow.offline_mode && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Mode</span>
                        <Badge variant="secondary" className="text-[10px]">Offline mode</Badge>
                      </div>
                    )}
                    <Field
                      label="Last seen"
                      value={
                        openRow.last_sync_at
                          ? `${format(new Date(openRow.last_sync_at), "PPp")} (${formatDistanceToNow(new Date(openRow.last_sync_at), { addSuffix: true })})`
                          : "Never"
                      }
                    />
                    <Field
                      label="Connected at"
                      value={format(new Date(openRow.created_at), "PPp")}
                    />
                  </div>

                  {/* Sync history */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-primary" /> Connection history
                      </h3>
                      {!historyLoading && (
                        <Badge variant="secondary" className="text-[10px]">{history.length}</Badge>
                      )}
                    </div>
                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
                      </div>
                    ) : history.length === 0 ? (
                      <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                        No sync history recorded for this connection yet.
                      </div>
                    ) : (
                      <ol className="space-y-2 relative border-l border-border pl-4">
                        {history.map((h) => {
                          const ok = h.sync_status === "success";
                          return (
                            <li key={h.id} className="relative">
                              <span
                                className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                                  ok ? "bg-emerald-500" : "bg-destructive"
                                }`}
                              />
                              <div className="rounded-md border bg-card px-3 py-2 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium capitalize">{h.action}</span>
                                  {ok ? (
                                    <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                                      <CheckCircle2 className="h-3 w-3" /> {h.sync_status}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
                                      <XCircle className="h-3 w-3" /> {h.sync_status}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-muted-foreground">
                                  {format(new Date(h.synced_at), "PPp")} · {formatDistanceToNow(new Date(h.synced_at), { addSuffix: true })}
                                </div>
                                {h.error_message && (
                                  <div className="text-destructive">{h.error_message}</div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
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
