import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PROVIDER_LABELS,
  getProviderMode,
  setProviderMode,
  subscribeProviderPreference,
  type MapProviderMode,
} from "@/lib/map-provider-preference";

const MODES: MapProviderMode[] = ["auto", "google", "osm", "esri", "opentopo"];

const EFFECTIVE_LABELS: Record<string, string> = {
  Streets: "Google",
  Satellite: "Google",
  Hybrid: "Google",
  Terrain: "Google",
  "Streets (OSM)": "OpenStreetMap",
  "Satellite (Esri)": "Esri",
  "Terrain (OTM)": "OpenTopoMap",
};

interface Props {
  className?: string;
}

/**
 * User-visible tile provider switcher. "Auto" prefers Google and falls back to
 * OSM / Esri when Google tiles fail; any explicit choice is pinned and
 * remembered across reloads (see map-provider-preference).
 */
export function MapProviderSwitcher({ className }: Props) {
  const [mode, setMode] = useState<MapProviderMode>(() => getProviderMode());
  const [effective, setEffective] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeProviderPreference((pref) => setMode(pref.mode));
    const onEffective = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (name) setEffective(EFFECTIVE_LABELS[name] ?? name);
    };
    window.addEventListener("map-provider-effective", onEffective);
    return () => {
      unsub();
      window.removeEventListener("map-provider-effective", onEffective);
    };
  }, []);

  const suffix = mode === "auto" && effective ? ` — ${effective}` : "";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MapIcon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      <label htmlFor="map-provider-select" className="text-xs text-muted-foreground whitespace-nowrap">
        Map provider
      </label>
      <Select value={mode} onValueChange={(v) => setProviderMode(v as MapProviderMode)}>
        <SelectTrigger id="map-provider-select" className="h-8 w-[210px] text-xs">
          <SelectValue placeholder="Auto (recommended)">
            {`${PROVIDER_LABELS[mode]}${suffix}`}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MODES.map((m) => (
            <SelectItem key={m} value={m} className="text-xs">
              {PROVIDER_LABELS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default MapProviderSwitcher;
