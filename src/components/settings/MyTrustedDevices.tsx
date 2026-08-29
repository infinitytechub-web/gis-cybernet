// src/components/settings/MyTrustedDevices.tsx
// Self-service view of the devices the signed-in user remembered for 2FA
// step-up: expiry, last use, and revocation with a reason. Every revocation is
// written to the security audit log server-side.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MonitorSmartphone, RefreshCw, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/date-format";
import { clearTrustedDevice } from "@/lib/mfa-trusted-device";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

interface MyDeviceRow {
  id: string;
  label: string | null;
  user_agent: string | null;
  trusted_hours: number;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  revoked_by_self: boolean | null;
  is_active: boolean;
}

function browserLabel(ua: string | null) {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
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

export default function MyTrustedDevices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [target, setTarget] = useState<MyDeviceRow | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, error, refetch, isRefetching } = useQuery<MyDeviceRow[]>({
    queryKey: ["my-trusted-devices", includeRevoked],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mfa_my_trusted_devices" as never, {
        _include_revoked: includeRevoked,
      } as never);
      if (error) throw error;
      return (data as unknown as MyDeviceRow[]) ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mfa_revoke_trusted_device" as never, {
        _device_id: target!.id,
        _reason: reason.trim(),
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      clearTrustedDevice();
      toast({
        title: "Device revoked",
        description: "You will be asked for a fresh verification code on the next sensitive action.",
      });
      setTarget(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["my-trusted-devices"] });
    },
    onError: (e: any) =>
      toast({ title: "Could not revoke", description: e.message, variant: "destructive" }),
  });

  const rows = data ?? [];
  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MonitorSmartphone className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
              Trusted devices
            </CardTitle>
            <CardDescription className="text-xs">
              Browsers where you chose “Remember this device” for two-factor step-up. Revoke any
              device you no longer use — the next sensitive action will ask for a fresh code.
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
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Switch id="my-include-revoked" checked={includeRevoked} onCheckedChange={setIncludeRevoked} />
          <Label htmlFor="my-include-revoked" className="text-xs">Include revoked devices</Label>
        </div>

        {error && <p className="text-xs text-destructive">{(error as any).message}</p>}

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your devices…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">
            No remembered devices{includeRevoked ? "" : " — nothing is currently trusted"}.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.label || browserLabel(r.user_agent)}</span>
                  {r.revoked_at ? (
                    <Badge variant="destructive" className="text-[10px]">Revoked</Badge>
                  ) : r.is_active ? (
                    <Badge variant="outline" className="text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Expired</Badge>
                  )}
                </div>
                <div className="mt-1 grid gap-1 text-muted-foreground sm:grid-cols-3">
                  <span>Trusted for {r.trusted_hours}h</span>
                  <span>Expires: {formatDateTime(r.expires_at)}</span>
                  <span>Last used: {r.last_used_at ? formatDateTime(r.last_used_at) : "Never"}</span>
                </div>
                {r.revoked_at && (
                  <div className="mt-1 text-muted-foreground">
                    Revoked {formatDateTime(r.revoked_at)}
                    {r.revoked_by_self ? " by you" : " by an administrator"}
                    {r.revoke_reason ? ` — ${r.revoke_reason}` : ""}
                  </div>
                )}
                {!r.revoked_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 gap-1 text-[11px]"
                    onClick={() => { setReason(""); setTarget(r); }}
                  >
                    <ShieldOff className="h-3 w-3" /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {target ? `${target.label || browserLabel(target.user_agent)} — trusted until ${formatDateTime(target.expires_at)}.` : ""}
              {" "}You will need a fresh verification code on this device next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="my-revoke-reason" className="text-xs">Reason (required, min 5 characters)</Label>
            <Textarea
              id="my-revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Lost access to this laptop"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length < 5 || revoke.isPending}
              onClick={(e) => { e.preventDefault(); revoke.mutate(); }}
            >
              Revoke device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
