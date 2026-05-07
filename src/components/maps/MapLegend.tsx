import { Layers, Satellite, Map as MapIcon, Mountain, ShieldCheck } from "lucide-react";

/**
 * Small legend shown alongside maps to explain the four base-layer modes
 * and which roles can view recorded route tracking.
 */
export function MapLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md border bg-background/95 backdrop-blur p-3 text-xs shadow-sm space-y-2 ${className}`}
      role="note"
      aria-label="Map view modes and access"
    >
      <div className="font-semibold text-foreground">Map views</div>
      <ul className="space-y-1 text-muted-foreground">
        <li className="flex items-center gap-2">
          <MapIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span><span className="text-foreground font-medium">Streets</span> — roads, labels & POIs</span>
        </li>
        <li className="flex items-center gap-2">
          <Satellite className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span><span className="text-foreground font-medium">Satellite</span> — pure aerial imagery</span>
        </li>
        <li className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span><span className="text-foreground font-medium">Hybrid</span> — satellite + road labels</span>
        </li>
        <li className="flex items-center gap-2">
          <Mountain className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span><span className="text-foreground font-medium">Terrain</span> — elevation & relief</span>
        </li>
      </ul>
      <div className="pt-1 border-t flex items-start gap-2 text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" aria-hidden />
        <span>
          <span className="text-foreground font-medium">Route tracking:</span> visible to the route owner and Command tier (Admin, OIC, 2IC, Staff Officer, Supervisor).
        </span>
      </div>
    </div>
  );
}
