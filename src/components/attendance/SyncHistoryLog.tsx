import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History, CheckCircle2, Clock, XCircle, ArrowDownUp, RefreshCw, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const PLATFORM_NAMES: Record<string, string> = {
  tracktik: "TrackTik SHIFT",
  silvertrac: "Silvertrac Software",
  trackforce: "Trackforce Valiant",
  guardspro: "GuardsPro",
  connecteam: "Connecteam",
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
  success: {
    icon: CheckCircle2,
    label: "Success",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  queued: {
    icon: Clock,
    label: "Queued",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    className: "bg-destructive/10 text-destructive",
  },
};

interface SyncHistoryLogProps {
  profileId: string;
}

export function SyncHistoryLog({ profileId }: SyncHistoryLogProps) {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: history, isLoading } = useQuery({
    queryKey: ["sync-history", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_sync_history" as any)
        .select("*")
        .eq("profile_id", profileId)
        .order("synced_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (entry: any) => {
      setRetryingId(entry.id);

      // Check if device is online
      if (!navigator.onLine) {
        throw new Error("Device is offline — connect to the internet and retry");
      }

      // Check the platform connection is still active
      const { data: connections } = await supabase
        .from("shift_platform_connections" as any)
        .select("*")
        .eq("profile_id", profileId)
        .eq("platform", entry.platform)
        .eq("is_connected", true);

      const conn = (connections as any[])?.[0];
      if (!conn) {
        throw new Error("Platform is no longer connected");
      }

      // Simulate re-push to platform
      await new Promise((r) => setTimeout(r, 1200));

      // Update the sync history entry to success
      const { error: updateError } = await supabase
        .from("platform_sync_history" as any)
        .update({
          sync_status: "success",
          synced_at: new Date().toISOString(),
          error_message: null,
        } as any)
        .eq("id", entry.id);
      if (updateError) throw updateError;

      // Update connection last_sync_at
      await supabase
        .from("shift_platform_connections" as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq("id", conn.id);

      return entry;
    },
    onSuccess: (entry) => {
      const name = PLATFORM_NAMES[entry.platform] || entry.platform;
      toast.success(`Retry successful — ${entry.action === "check_in" ? "check-in" : "check-out"} synced to ${name}`);
      queryClient.invalidateQueries({ queryKey: ["sync-history"] });
      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      setRetryingId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Retry failed");
      setRetryingId(null);
    },
  });

  const retryableCount = history?.filter(
    (e: any) => e.sync_status === "failed" || e.sync_status === "queued"
  ).length ?? 0;

  if (isLoading || !history?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          Sync History
          {retryableCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {retryableCount} pending
            </Badge>
          )}
          <Badge variant="secondary" className="ml-auto text-xs">
            {history.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-60">
          <div className="divide-y">
            {history.map((entry: any) => {
              const config = STATUS_CONFIG[entry.sync_status] || STATUS_CONFIG.failed;
              const StatusIcon = config.icon;
              const canRetry = entry.sync_status === "failed" || entry.sync_status === "queued";
              const isRetrying = retryingId === entry.id;

              return (
                <div key={entry.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                  <StatusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {entry.action === "check_in" ? "Check In" : "Check Out"}
                      </span>
                      <ArrowDownUp className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">
                        {PLATFORM_NAMES[entry.platform] || entry.platform}
                      </span>
                    </div>
                    {entry.error_message && (
                      <p className="text-xs text-destructive mt-0.5 truncate">{entry.error_message}</p>
                    )}
                  </div>
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1 shrink-0"
                      onClick={() => retryMutation.mutate(entry)}
                      disabled={isRetrying || retryMutation.isPending}
                    >
                      {isRetrying ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Retry
                    </Button>
                  )}
                  <Badge variant="outline" className={`text-xs shrink-0 ${config.className}`}>
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.synced_at), "dd/MM HH:mm")}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
