/** Connectivity + offline GPS queue indicator for the fleet console. */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useFleetOfflineSync } from "@/hooks/useFleetOfflineSync";

export function FleetOfflineStatus() {
  const { pending, online, syncing, sync } = useFleetOfflineSync(true);

  if (online && pending === 0) {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        <Wifi className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Live link
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={online
          ? "border-warning/30 bg-warning/10 text-warning-foreground"
          : "border-destructive/30 bg-destructive/10 text-destructive"}
      >
        <CloudOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {online ? "Syncing offline data" : "Offline — storing locally"}
        {pending > 0 && ` · ${pending} fix(es) queued`}
      </Badge>
      {online && pending > 0 && (
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      )}
    </div>
  );
}
