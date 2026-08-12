import { useEffect, useState } from "react";
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
  const [failover, setFailover] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // Automatic tile failover reports which source it switched to, and tells us
  // when every source has failed. GPS tracking keeps running either way.
  useEffect(() => {
    const onSwitch = (e: Event) => {
      const to = (e as CustomEvent<{ to?: string }>).detail?.to;
      setExhausted(false);
      setFailover(to ?? "a backup provider");
      setDismissed(false);
    };
    const onExhausted = () => { setExhausted(true); setDismissed(false); };
    window.addEventListener("map-tiles-failover", onSwitch);
    window.addEventListener("map-tiles-exhausted", onExhausted);
    return () => {
      window.removeEventListener("map-tiles-failover", onSwitch);
      window.removeEventListener("map-tiles-exhausted", onExhausted);
    };
  }, []);

  const showFailover = exhausted || !!failover;
  if ((status.status !== "error" && !showFailover) || dismissed) return null;

  const title = exhausted
    ? "Base map unavailable — tracking still active"
    : failover
      ? `Base map switched to ${failover}`
      : "Google tiles unavailable";
  const detail = exhausted
    ? "All tile providers are unreachable. Markers, routes and live tracking continue to update."
    : failover
      ? "The primary tile source failed, so a backup provider is being used."
      : (status.status === "error" ? status.message : "");

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
        <div className="font-medium">{title}</div>
        <div className="text-xs opacity-90">{detail}</div>
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
