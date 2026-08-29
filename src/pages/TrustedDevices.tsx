// src/pages/TrustedDevices.tsx
// Admin / OIC / 2IC review of "remembered" 2FA step-up devices: who trusted
// which browser, when it was created, when it expires, and revocation with a
// mandatory reason. Every action is written to the security audit log server-side.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MonitorSmartphone, RefreshCw, Search, ShieldAlert, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/date-format";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeviceRow {
  id: string;
  user_id: string;
  staff_name: string | null;
  staff_identifier: string | null;
  label: string | null;
  user_agent: string | null;
  trusted_hours: number;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by_name: string | null;
  revoke_reason: string | null;
  is_active: boolean;
}

function browserLabel(ua: string | null) {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

export default function TrustedDevices() {
  usePageMeta({
    title: "Trusted 2FA Devices | Cybernet HRM",
    description:
      "Review and revoke devices staff have remembered for two-factor step-up verification.",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [target, setTarget] = useState<DeviceRow | null>(null);
  const [bulkTarget, setBulkTarget] = useState<DeviceRow | null>(null);
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionReasons, setSelectionReasons] = useState<Record<string, string>>({});
  const [applyToAll, setApplyToAll] = useState("");

  const { data, isLoading, error, refetch, isRefetching } = useQuery<DeviceRow[]>({
    queryKey: ["mfa-trusted-devices", includeRevoked],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mfa_trusted_devices_feed" as never, {
        _user_id: null,
        _include_revoked: includeRevoked,
        _limit: 500,
      } as never);
      if (error) throw error;
      return (data as unknown as DeviceRow[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.staff_name, r.staff_identifier, r.label, r.user_agent]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["mfa-trusted-devices"] });
    setReason("");
    setTarget(null);
    setBulkTarget(null);
  };

  const revocableRows = useMemo(() => rows.filter((r) => !r.revoked_at), [rows]);
  const selectedRows = useMemo(
    () => (data ?? []).filter((r) => selectedIds.includes(r.id)),
    [data, selectedIds],
  );
  const allSelected = revocableRows.length > 0 && revocableRows.every((r) => selectedIds.includes(r.id));
  const affectedStaff = useMemo(
    () => Array.from(new Set(selectedRows.map((r) => r.staff_name || "Unknown staff"))),
    [selectedRows],
  );
  const missingReasons = selectedRows.filter(
    (r) => (selectionReasons[r.id] ?? "").trim().length < 5,
  ).length;

  const toggleRow = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? revocableRows.map((r) => r.id) : []);

  const openSelectionDialog = () => {
    setSelectionReasons(Object.fromEntries(selectedIds.map((id) => [id, ""])));
    setApplyToAll("");
    setSelectionOpen(true);
  };

  const revokeSelected = useMutation({
    mutationFn: async () => {
      const items = selectedRows.map((r) => ({
        device_id: r.id,
        reason: (selectionReasons[r.id] ?? "").trim(),
      }));
      const { data, error } = await supabase.rpc("mfa_revoke_trusted_devices_bulk" as never, {
        _items: items,
      } as never);
      if (error) throw error;
      return (data as unknown as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({
        title: "Devices revoked",
        description: `${count} device(s) revoked. Each revocation was written to the security audit log.`,
      });
      setSelectionOpen(false);
      setSelectedIds([]);
      setSelectionReasons({});
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Bulk revoke failed", description: e.message, variant: "destructive" }),
  });


  const revokeOne = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mfa_revoke_trusted_device" as never, {
        _device_id: target!.id,
        _reason: reason.trim(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Device revoked", description: "The next step-up will require a fresh code." });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not revoke", description: e.message, variant: "destructive" }),
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("mfa_revoke_all_trusted_devices" as never, {
        _user_id: bulkTarget!.user_id,
        _reason: reason.trim(),
      } as never);
      if (error) throw error;
      return (data as unknown as number) ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: "Devices revoked", description: `${count} device(s) revoked for this staff member.` });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not revoke", description: e.message, variant: "destructive" }),
  });

  const activeCount = (data ?? []).filter((r) => r.is_active).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Trusted 2FA Devices</h1>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
                Remembered devices
              </CardTitle>
              <CardDescription>
                Devices where staff chose “Remember this device” after a two-factor check. Revoking a
                device forces a fresh authenticator code on the next sensitive action.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px]">{activeCount} active</Badge>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching} className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Label htmlFor="device-search" className="sr-only">Search devices</Label>
              <Input
                id="device-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff, ID or browser…"
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="include-revoked" checked={includeRevoked} onCheckedChange={setIncludeRevoked} />
              <Label htmlFor="include-revoked" className="text-xs">Include revoked</Label>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4" /> {(error as any).message}
            </p>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No remembered devices{includeRevoked ? "" : " — nothing is currently trusted"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Trusted</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.staff_name || "Unknown staff"}</div>
                        <div className="text-xs text-muted-foreground">{r.staff_identifier || "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.label || browserLabel(r.user_agent)}</div>
                        <div className="max-w-[240px] truncate text-muted-foreground" title={r.user_agent ?? ""}>
                          {r.user_agent || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.trusted_hours}h</TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.expires_at)}</TableCell>
                      <TableCell className="text-xs">
                        {r.last_used_at ? formatDateTime(r.last_used_at) : "Never"}
                      </TableCell>
                      <TableCell>
                        {r.revoked_at ? (
                          <div>
                            <Badge variant="destructive" className="text-[11px]">Revoked</Badge>
                            <div className="mt-1 max-w-[200px] text-[11px] text-muted-foreground">
                              {r.revoked_by_name ? `by ${r.revoked_by_name}` : ""}
                              {r.revoke_reason ? ` — ${r.revoke_reason}` : ""}
                            </div>
                          </div>
                        ) : r.is_active ? (
                          <Badge variant="outline" className="text-[11px]">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">Expired</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!r.revoked_at && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-[11px]"
                              onClick={() => { setReason(""); setTarget(r); }}
                            >
                              <ShieldOff className="h-3 w-3" /> Revoke
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px]"
                              onClick={() => { setReason(""); setBulkTarget(r); }}
                            >
                              Revoke all
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!target || !!bulkTarget} onOpenChange={(o) => { if (!o) { setTarget(null); setBulkTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkTarget ? "Revoke all remembered devices" : "Revoke this device"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkTarget
                ? `Every remembered device for ${bulkTarget.staff_name || "this staff member"} will be revoked.`
                : `${target?.staff_name || "This staff member"} will be asked for a fresh authenticator code on the next sensitive action.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason" className="text-xs">Reason (required, min 5 characters)</Label>
            <Textarea
              id="revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Shared workstation — trust withdrawn"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length < 5 || revokeOne.isPending || revokeAll.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (bulkTarget) revokeAll.mutate();
                else revokeOne.mutate();
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
