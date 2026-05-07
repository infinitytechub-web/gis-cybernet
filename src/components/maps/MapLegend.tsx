import { Layers, Satellite, Map as MapIcon, Mountain } from "lucide-react";

/**
 * Map legend — themed to match the security suite (deep cyan + white).
 */
export function MapLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-cyan-300/40 bg-white/95 dark:bg-[hsl(195_60%_10%)]/90 backdrop-blur p-3 text-xs shadow-sm space-y-2 ${className}`}
      role="note"
      aria-label="Map view modes"
    >
      <div className="font-semibold text-[hsl(195_85%_24%)] dark:text-cyan-200 uppercase tracking-wide text-[11px]">
        Map views
      </div>
      <ul className="space-y-1 text-muted-foreground">
        <li className="flex items-center gap-2">
          <MapIcon className="h-3.5 w-3.5 text-[hsl(195_85%_30%)] dark:text-cyan-300" aria-hidden />
          <span><span className="text-foreground font-medium">Streets</span> — roads, labels & POIs</span>
        </li>
        <li className="flex items-center gap-2">
          <Satellite className="h-3.5 w-3.5 text-[hsl(195_85%_30%)] dark:text-cyan-300" aria-hidden />
          <span><span className="text-foreground font-medium">Satellite</span> — pure aerial imagery</span>
        </li>
        <li className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-[hsl(195_85%_30%)] dark:text-cyan-300" aria-hidden />
          <span><span className="text-foreground font-medium">Hybrid</span> — satellite + road labels</span>
        </li>
        <li className="flex items-center gap-2">
          <Mountain className="h-3.5 w-3.5 text-[hsl(195_85%_30%)] dark:text-cyan-300" aria-hidden />
          <span><span className="text-foreground font-medium">Terrain</span> — elevation & relief</span>
        </li>
      </ul>
    </div>
  );
}
