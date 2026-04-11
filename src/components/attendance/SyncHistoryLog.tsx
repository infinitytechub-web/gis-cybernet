import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, CheckCircle2, Clock, XCircle, ArrowDownUp } from "lucide-react";
import { format } from "date-fns";

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

  if (isLoading || !history?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <History className="h-4 w-4" />
          Sync History
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
                  <Badge variant="outline" className={`text-xs shrink-0 ${config.className}`}>
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.synced_at), "MMM d, HH:mm")}
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
