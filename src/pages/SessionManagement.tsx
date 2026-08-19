import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, MonitorSmartphone, RefreshCw, ShieldAlert, Trash2, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getStoredSessionKey } from "@/hooks/useSessionRegistry";
import { formatDateTime } from "@/lib/date-format";
import { buildId, buildTooltip } from "@/lib/build-version";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SecurityHero } from "@/components/security/SecurityHero";

const ACTIVE_WINDOW_MINUTES = 5;

type SessionRow = {
  id: string;
  user_id: string;
  session_key: string;
  device_fingerprint: string | null;
  user_agent: string | null;
  ip_address: string | null;
  current_page: string | null;
  started_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  actor_id: string | null;
  target_user_id: string | null;
  sessions_affected: number;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
};

type StaffRow = {
  user_id: string | null;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  session_start: "Session started",
  logout_session: "Session logged out",
  logout_all: "All sessions signed out",
  fleet_panic: "Fleet panic / SOS",
};


/** Compact, human-readable device label from a user-agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Browser";
  const os =
    /Windows/.test(ua) ? "Windows" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} · ${os}`;
}

export default function SessionManagement() {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const canManageAll = isAdmin || isAdminOrSupervisor;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "ended" | "all">("active");
  const [reason, setReason] = useState("");
  const [confirmSingle, setConfirmSingle] = useState<SessionRow | null>(null);
  const [confirmAll, setConfirmAll] = useState<{ userId: string; label: string } | null>(null);

  const myKey = getStoredSessionKey();

  const sessionsQuery = useQuery({
    queryKey: ["user-sessions"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id,user_id,session_key,device_fingerprint,user_agent,ip_address,current_page,started_at,last_seen_at,revoked_at,revoke_reason")
        .order("last_seen_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["session-action-audit"],
    enabled: canManageAll,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_action_audit")
        .select("id,action,actor_id,target_user_id,sessions_affected,reason,ip_address,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const staffQuery = useQuery({
    queryKey: ["session-staff-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,staff_id,first_name,last_name")
        .not("user_id", "is", null)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const staffByUser = useMemo(() => {
    const map = new Map<string, StaffRow>();
    (staffQuery.data ?? []).forEach((s) => { if (s.user_id) map.set(s.user_id, s); });
    return map;
  }, [staffQuery.data]);

  const nameFor = (userId: string | null) => {
    if (!userId) return "System";
    const s = staffByUser.get(userId);
    if (!s) return userId.slice(0, 8);
    return `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || (s.staff_id ?? userId.slice(0, 8));
  };
  const staffIdFor = (userId: string | null) => (userId ? staffByUser.get(userId)?.staff_id ?? "—" : "—");

  const isLive = (row: SessionRow) =>
    !row.revoked_at && Date.now() - new Date(row.last_seen_at).getTime() < ACTIVE_WINDOW_MINUTES * 60_000;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sessionsQuery.data ?? []).filter((r) => {
      if (statusFilter === "active" && r.revoked_at) return false;
      if (statusFilter === "ended" && !r.revoked_at) return false;
      if (!term) return true;
      const hay = [
        nameFor(r.user_id), staffIdFor(r.user_id), r.ip_address ?? "",
        deviceLabel(r.user_agent), r.current_page ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [sessionsQuery.data, search, statusFilter, staffByUser]);

  const stats = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    const active = all.filter((r) => !r.revoked_at);
    return {
      live: active.filter(isLive).length,
      active: active.length,
      users: new Set(active.map((r) => r.user_id)).size,
      ended: all.filter((r) => r.revoked_at).length,
    };
  }, [sessionsQuery.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["session-action-audit"] });
  };

  const revokeOne = useMutation({
    mutationFn: async (row: SessionRow) => {
      const { error } = await supabase.rpc("revoke_session", {
        _session_id: row.id,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Session ended", description: "The device will be signed out within a minute." });
      setReason("");
      setConfirmSingle(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not end session", description: e.message, variant: "destructive" }),
  });

  const revokeAll = useMutation({
    mutationFn: async (target: { userId: string; keepCurrent: boolean }) => {
      const { data, error } = await supabase.rpc("revoke_all_user_sessions", {
        _user_id: target.userId,
        _reason: reason.trim() || null,
        _keep_session_key: target.keepCurrent ? myKey : null,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: "Sessions signed out", description: `${count} active session(s) ended.` });
      setReason("");
      setConfirmAll(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not sign out sessions", description: e.message, variant: "destructive" }),
  });

  const prune = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("prune_stale_sessions", { _older_than_days: 30 });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: "Cleanup complete", description: `${count} stale session record(s) removed.` });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Cleanup failed", description: e.message, variant: "destructive" }),
  });

  const canEnd = (row: SessionRow) => canManageAll || row.user_id === user?.id;

  return (
    <div className="space-y-6">
      <SecurityHero
        icon={MonitorSmartphone}
        title="Session Management"
        subtitle="Monitor active sessions and sign devices out. Every action is written to an immutable audit trail."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground"
              title={buildTooltip()}
            >
              Build {buildId()}
            </span>
            <Button variant="secondary" size="sm" onClick={() => { void sessionsQuery.refetch(); void auditQuery.refetch(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            {canManageAll && (
              <Button variant="secondary" size="sm" onClick={() => prune.mutate()} disabled={prune.isPending}>
                {prune.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Clear stale records
              </Button>
            )}
          </div>
        }
      />

      {!canManageAll && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Limited view</AlertTitle>
          <AlertDescription>
            You can see and end only your own sessions. Full session oversight is restricted to Admin, OIC, 2IC,
            Staff Officer and Supervisor roles.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Live now", value: stats.live, hint: `Active in last ${ACTIVE_WINDOW_MINUTES} min` },
          { label: "Open sessions", value: stats.active, hint: "Not yet signed out" },
          { label: "Staff signed in", value: stats.users, hint: "Distinct accounts" },
          { label: "Ended sessions", value: stats.ended, hint: "Logged out or revoked" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">{s.hint}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Ending a session revokes it immediately; the affected device is signed out on its next heartbeat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_1fr]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search staff, staff ID, IP or device"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search sessions"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Open sessions</SelectItem>
                <SelectItem value="ended">Ended sessions</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="session-reason" className="text-xs">Reason (recorded in the audit trail)</Label>
              <Textarea
                id="session-reason"
                rows={1}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Device reported lost"
                className="min-h-[38px]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionsQuery.isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell></TableRow>
                )}
                {!sessionsQuery.isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No sessions match the current filters.
                  </TableCell></TableRow>
                )}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{nameFor(row.user_id)}</div>
                      <div className="text-xs text-muted-foreground">{staffIdFor(row.user_id)}</div>
                    </TableCell>
                    <TableCell>
                      <div>{deviceLabel(row.user_agent)}</div>
                      {row.session_key === myKey && (
                        <Badge variant="outline" className="mt-1">This device</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.ip_address ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.current_page ?? "—"}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.started_at)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(row.last_seen_at)}</TableCell>
                    <TableCell>
                      {row.revoked_at ? (
                        <Badge variant="destructive">Ended</Badge>
                      ) : isLive(row) ? (
                        <Badge className="bg-success text-success-foreground">Live</Badge>
                      ) : (
                        <Badge variant="secondary">Idle</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!row.revoked_at || !canEnd(row)}
                        onClick={() => setConfirmSingle(row)}
                      >
                        <LogOut className="mr-1 h-3.5 w-3.5" /> Log out
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canEnd(row)}
                        onClick={() => setConfirmAll({ userId: row.user_id, label: nameFor(row.user_id) })}
                      >
                        Sign out all
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canManageAll && (
        <Card>
          <CardHeader>
            <CardTitle>Session audit trail</CardTitle>
            <CardDescription>Append-only record of session starts and forced sign-outs.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead>Affected staff</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No session activity recorded yet.
                  </TableCell></TableRow>
                )}
                {(auditQuery.data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{formatDateTime(a.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={a.action === "session_start" ? "secondary" : "destructive"}>
                        {ACTION_LABEL[a.action] ?? a.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{nameFor(a.actor_id)}</TableCell>
                    <TableCell>{nameFor(a.target_user_id)}</TableCell>
                    <TableCell>{a.sessions_affected}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirmSingle} onOpenChange={(o) => !o && setConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSingle ? `${nameFor(confirmSingle.user_id)} will be signed out on ${deviceLabel(confirmSingle.user_agent)}.` : ""}
              {confirmSingle?.session_key === myKey ? " This is the device you are using right now." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSingle && revokeOne.mutate(confirmSingle)}
              disabled={revokeOne.isPending}
            >
              {revokeOne.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmAll} onOpenChange={(o) => !o && setConfirmAll(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out from all active sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              Every open session for {confirmAll?.label} will be revoked. They will need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirmAll?.userId === user?.id && (
              <Button
                variant="outline"
                onClick={() => confirmAll && revokeAll.mutate({ userId: confirmAll.userId, keepCurrent: true })}
                disabled={revokeAll.isPending}
              >
                Keep this device
              </Button>
            )}
            <AlertDialogAction
              onClick={() => confirmAll && revokeAll.mutate({ userId: confirmAll.userId, keepCurrent: false })}
              disabled={revokeAll.isPending}
            >
              {revokeAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sign out all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
