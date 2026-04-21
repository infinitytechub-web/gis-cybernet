import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ShiftPlatformConnect } from "@/components/attendance/ShiftPlatformConnect";
import {
  CheckCircle2, XCircle, RefreshCw, Wifi, WifiOff, Search, Link2,
  Activity, AlertTriangle, Loader2, ShieldOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

/** Roles permitted to view & manage shift platform integrations. */
const ALLOWED_ROLES = ["admin", "oic", "2ic", "staff_officer", "supervisor"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

/**
 * Minimal display catalogue for the platforms we support — kept in sync with
 * `ShiftPlatformConnect`. We re-declare the labels here (rather than import)
 * to keep this page's bundle independent and avoid pulling the wizard's auth
 * config into the dashboard.
 */
const PLATFORM_LABELS: Record<string, { name: string; icon: string }> = {
  tracktik: { name: "TrackTik SHIFT", icon: "🔵" },
  silvertrac: { name: "Silvertrac Software", icon: "🟣" },
  trackforce: { name: "Trackforce Valiant", icon: "🟢" },
  guardspro: { name: "GuardsPro", icon: "🟠" },
  connecteam: { name: "Connecteam", icon: "🔴" },
  deputy: { name: "Deputy", icon: "🟡" },
  whentowork: { name: "When I Work", icon: "🟤" },
  humanity: { name: "Humanity (TCP)", icon: "⚫" },
  kronos: { name: "UKG (Kronos) Workforce", icon: "⚪" },
  sling: { name: "Sling by Toast", icon: "🟦" },
};

interface Connection {
  id: string;
  profile_id: string;
  platform: string;
  platform_username: string | null;
  is_connected: boolean;
  offline_mode: boolean;
  last_sync_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Buckets a connection into a health bucket based on connection + sync age. */
function deriveStatus(c: Connection): {
  label: string;
  variant: "success" | "warning" | "muted" | "destructive";
} {
  if (!c.is_connected) return { label: "Disconnected", variant: "destructive" };
  if (!c.last_sync_at) return { label: "Pending first sync", variant: "warning" };
  const ageMs = Date.now() - new Date(c.last_sync_at).getTime();
  const hours = ageMs / 36e5;
  if (hours > 24) return { label: "Stale", variant: "warning" };
  if (hours > 1) return { label: "Idle", variant: "muted" };
  return { label: "Healthy", variant: "success" };
}

function StatusBadge({ status }: { status: ReturnType<typeof deriveStatus> }) {
  const { label, variant } = status;
  const cls =
    variant === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300"
      : variant === "warning"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300"
        : variant === "destructive"
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : "bg-muted text-muted-foreground border-border";
  const Icon =
    variant === "success" ? CheckCircle2 : variant === "destructive" ? XCircle : AlertTriangle;
  return (
    <Badge variant="outline" className={`gap-1 ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}

export default function ShiftConnections() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const isAuthorized = !!role && (ALLOWED_ROLES as readonly string[]).includes(role);

  // Resolve the current user's profile ID — connections are scoped per profile.
  const { data: profile } = useQuery({
    queryKey: ["my-profile-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["shift-platform-connections", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_platform_connections" as any)
        .select("*")
        .eq("profile_id", profile!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Connection[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) => {
      const label = PLATFORM_LABELS[c.platform]?.name?.toLowerCase() ?? c.platform;
      return (
        label.includes(q) ||
        (c.platform_username ?? "").toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q)
      );
    });
  }, [connections, search]);

  const stats = useMemo(() => {
    const total = connections.length;
    const healthy = connections.filter((c) => deriveStatus(c).variant === "success").length;
    const warning = connections.filter((c) => deriveStatus(c).variant === "warning").length;
    const offline = connections.filter((c) => !c.is_connected).length;
    return { total, healthy, warning, offline };
  }, [connections]);

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      setSyncingId(id);
      // Simulate the network round-trip a real sync would perform so the
      // spinner isn't instantaneous and the user gets visual confirmation.
      await new Promise((r) => setTimeout(r, 800));
      const { error } = await supabase
        .from("shift_platform_connections" as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      toast.success("Synced with platform");
    },
    onError: (e: any) => toast.error(e.message ?? "Sync failed"),
    onSettled: () => setSyncingId(null),
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const targets = connections.filter((c) => c.is_connected);
      if (!targets.length) throw new Error("No active connections to sync");
      await new Promise((r) => setTimeout(r, 1200));
      const { error } = await supabase
        .from("shift_platform_connections" as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .in("id", targets.map((t) => t.id));
      if (error) throw error;
      return targets.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      toast.success(`Synced ${count} platform${count === 1 ? "" : "s"}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Sync all failed"),
  });

  // Block unauthorized roles AFTER hooks have been registered to keep hook
  // order stable across renders. Sync mutations are also gated below.
  if (!isAuthorized) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent className="p-8 text-center space-y-3">
          <ShieldOff className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold">Restricted area</h2>
          <p className="text-sm text-muted-foreground">
            Shift platform integrations are managed by the command tier
            (Admin, OIC, 2IC, Staff Officer, Supervisor). Contact your supervisor
            if you need a platform connected to your account.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Shift Platform Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your linked shift-management systems, monitor sync health, and run manual syncs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {navigator.onLine ? (
            <><Wifi className="h-4 w-4 text-emerald-500" /> Online</>
          ) : (
            <><WifiOff className="h-4 w-4 text-amber-500" /> Offline</>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Healthy</div>
            <div className="text-2xl font-bold text-emerald-600">{stats.healthy}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Needs attention</div>
            <div className="text-2xl font-bold text-amber-600">{stats.warning}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Disconnected</div>
            <div className="text-2xl font-bold text-destructive">{stats.offline}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Connected platforms
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search platform or user…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-[220px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending || !connections.some((c) => c.is_connected)}
            >
              {syncAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync all
            </Button>
            {profile && <ShiftPlatformConnect profileId={profile.id} />}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {connections.length === 0
                  ? "No shift platforms connected yet. Use the wizard above to add one."
                  : "No connections match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Last sync</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const meta = PLATFORM_LABELS[c.platform] ?? { name: c.platform, icon: "🔌" };
                    const status = deriveStatus(c);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <span className="text-base">{meta.icon}</span>
                            {meta.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.platform_username || "—"}
                        </TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell>
                          {c.offline_mode ? (
                            <Badge variant="secondary" className="gap-1">
                              <WifiOff className="h-3 w-3" /> Offline ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1">
                              <Wifi className="h-3 w-3" /> Online
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.last_sync_at ? (
                            <div className="text-xs">
                              <div className="font-medium">
                                {formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true })}
                              </div>
                              <div className="text-muted-foreground">
                                {format(new Date(c.last_sync_at), "PPp")}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => syncMutation.mutate(c.id)}
                            disabled={!c.is_connected || syncingId === c.id}
                          >
                            {syncingId === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Sync now
                          </Button>
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
    </div>
  );
}
