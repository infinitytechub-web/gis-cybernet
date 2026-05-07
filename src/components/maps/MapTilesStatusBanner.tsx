import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useMapTilesPreflight } from "@/hooks/useMapTilesPreflight";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * Inline banner that warns when Google Map Tiles API is disabled or
 * unreachable. Hidden when tiles are healthy. Dismissible per session.
 */
export function MapTilesStatusBanner({ className }: Props) {
  const status = useMapTilesPreflight();
  const [dismissed, setDismissed] = useState(false);

  if (status.status !== "error" || dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-md border border-cyan-300/50",
        "bg-[hsl(195_85%_30%)]/10 px-3 py-2 text-sm text-[hsl(195_85%_22%)]",
        "dark:bg-[hsl(195_60%_10%)]/60 dark:text-cyan-100 dark:border-cyan-700/50",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="font-medium">Google tiles unavailable</div>
        <div className="text-xs opacity-90">{status.message}</div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="opacity-70 hover:opacity-100 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default MapTilesStatusBanner;
