import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LogIn, LogOut, Clock, CheckCircle2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ShiftPlatformConnect } from "./ShiftPlatformConnect";
import { SyncHistoryLog } from "./SyncHistoryLog";
import { getMyClientIp } from "@/lib/client-ip";
import { captureDigitalAddress } from "@/lib/digital-address";

export function CheckInOut() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, shift_group")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: todayRecord, isLoading } = useQuery({
    queryKey: ["my-attendance", today, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("*")
        .eq("profile_id", profile!.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Auto-sync helper: push attendance data to connected shift platform + log history
  const syncToPlatform = useCallback(async (action: "check_in" | "check_out", timestamp: string) => {
    if (!profile) return;
    try {
      const { data: connections } = await supabase
        .from("shift_platform_connections" as any)
        .select("*")
        .eq("profile_id", profile.id)
        .eq("is_connected", true);

      const conn = (connections as any[])?.[0];
      if (!conn) return;

      const isOnline = navigator.onLine;
      if (!isOnline && !conn.offline_mode) return;

      const syncStatus = !isOnline && conn.offline_mode ? "queued" : "success";

      // Update last_sync_at on connection
      await supabase
        .from("shift_platform_connections" as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq("id", conn.id);

      // Log sync history entry
      await supabase
        .from("platform_sync_history" as any)
        .insert({
          profile_id: profile.id,
          platform: conn.platform,
          action,
          sync_status: syncStatus,
          synced_at: timestamp,
        } as any);

      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      queryClient.invalidateQueries({ queryKey: ["sync-history"] });

      const platformNames: Record<string, string> = {
        tracktik: "TrackTik SHIFT",
        silvertrac: "Silvertrac Software",
        trackforce: "Trackforce Valiant",
        guardspro: "GuardsPro",
        connecteam: "Connecteam",
      };
      const name = platformNames[conn.platform] || conn.platform;

      if (syncStatus === "queued") {
        toast.info(`${action === "check_in" ? "Check-in" : "Check-out"} queued for ${name} (offline)`);
      } else {
        toast.success(`Synced ${action === "check_in" ? "check-in" : "check-out"} to ${name}`);
      }
    } catch (err: any) {
      // Log failed sync
      try {
        const { data: connections } = await supabase
          .from("shift_platform_connections" as any)
          .select("platform")
          .eq("profile_id", profile.id)
          .eq("is_connected", true);
        const conn = (connections as any[])?.[0];
        if (conn) {
          await supabase.from("platform_sync_history" as any).insert({
            profile_id: profile.id,
            platform: conn.platform,
            action,
            sync_status: "failed",
            synced_at: timestamp,
            error_message: err?.message || "Unknown error",
          } as any);
          queryClient.invalidateQueries({ queryKey: ["sync-history"] });
        }
      } catch {
        // Silent
      }
    }
  }, [profile, queryClient]);

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      // Best-effort public IP + digital address capture — never block check-in on failure
      let ip: string | null = null;
      try { ip = await getMyClientIp(); } catch { ip = null; }
      const loc = await captureDigitalAddress();
      const { error } = await supabase.from("attendances").insert({
        profile_id: profile!.id,
        date: today,
        check_in: now,
        status: "present",
        notes: notes || null,
        ...(ip ? { check_in_ip: ip } : {}),
        ...(loc.lat != null ? { check_in_lat: loc.lat } : {}),
        ...(loc.lng != null ? { check_in_lng: loc.lng } : {}),
        ...(loc.address ? { check_in_address: loc.address } : {}),
      } as any);
      if (error) throw error;
      return now;
    },
    onSuccess: (timestamp) => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setNotes("");
      toast.success("Checked in successfully");
      syncToPlatform("check_in", timestamp);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      let ip: string | null = null;
      try { ip = await getMyClientIp(); } catch { ip = null; }
      const loc = await captureDigitalAddress();
      const { error } = await supabase
        .from("attendances")
        .update({
          check_out: now,
          notes: notes || todayRecord?.notes || null,
          ...(ip ? { check_out_ip: ip } : {}),
          ...(loc.lat != null ? { check_out_lat: loc.lat } : {}),
          ...(loc.lng != null ? { check_out_lng: loc.lng } : {}),
          ...(loc.address ? { check_out_address: loc.address } : {}),
        } as any)
        .eq("id", todayRecord!.id);
      if (error) throw error;
      return now;
    },
    onSuccess: (timestamp) => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setNotes("");
      toast.success("Checked out successfully");
      syncToPlatform("check_out", timestamp);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <Clock className="h-5 w-5 text-primary" />
          My Attendance — {format(new Date(), "PPP")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Shift Platform Integration */}
        {profile && <ShiftPlatformConnect profileId={profile.id} />}
        {/* Status display */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm text-muted-foreground">
            Staff: <span className="font-medium text-foreground">{profile?.first_name} {profile?.last_name}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Shift: <Badge variant="outline">{profile?.shift_group ?? "—"}</Badge>
          </div>
          {todayRecord && (
            <Badge variant="secondary" className={
              todayRecord.status === "present" ? "bg-emerald-100 text-emerald-800" :
              todayRecord.status === "late" ? "bg-amber-100 text-amber-800" :
              "bg-muted text-muted-foreground"
            }>
              {todayRecord.status}
            </Badge>
          )}
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Check In</div>
            <div className="text-lg font-semibold text-foreground">
              {todayRecord?.check_in ? format(new Date(todayRecord.check_in), "HH:mm:ss") : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Check Out</div>
            <div className="text-lg font-semibold text-foreground">
              {todayRecord?.check_out ? format(new Date(todayRecord.check_out), "HH:mm:ss") : "—"}
            </div>
          </div>
        </div>

        {/* Notes */}
        {!hasCheckedOut && (
          <Textarea
            placeholder="Add notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none"
            rows={2}
          />
        )}

        {/* Action buttons */}
        {!hasCheckedIn ? (
          <Button
            onClick={() => checkInMutation.mutate()}
            disabled={checkInMutation.isPending}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="h-5 w-5" />
            {checkInMutation.isPending ? "Checking in..." : "Check In"}
          </Button>
        ) : !hasCheckedOut ? (
          <Button
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            variant="destructive"
            className="w-full gap-2"
            size="lg"
          >
            <LogOut className="h-5 w-5" />
            {checkOutMutation.isPending ? "Checking out..." : "Check Out"}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-emerald-600 py-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Attendance completed for today</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
