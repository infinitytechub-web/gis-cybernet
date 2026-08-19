/**
 * District patrol areas.
 *
 * Every Ghanaian district (official ADM2 boundaries, 260 districts) is held in
 * `ghana_districts` as a reference outline. Commands activate the districts they
 * actually patrol, which copies the boundary into `fleet_geofences` so uptime
 * and zone-compliance reporting is measured against real administrative areas
 * instead of hand-drawn practice shapes.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Loader2, Search } from "lucide-react";
import {
  useGhanaDistricts,
  useActivateDistrictZones,
  useDeactivateDistrictZones,
} from "@/hooks/useFleet";
import type { FleetGeofence } from "@/lib/fleet";

interface Props {
  geofences: FleetGeofence[];
  canManage: boolean;
}

export function DistrictZonesCard({ geofences, canManage }: Props) {
  const districtsQuery = useGhanaDistricts();
  const activate = useActivateDistrictZones();
  const deactivate = useDeactivateDistrictZones();

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);

  const districts = districtsQuery.data ?? [];

  const activeByDistrict = useMemo(() => {
    const map = new Map<string, FleetGeofence>();
    for (const g of geofences) if (g.district_id) map.set(g.district_id, g);
    return map;
  }, [geofences]);

  const regions = useMemo(
    () => Array.from(new Set(districts.map((d) => d.region))).sort(),
    [districts],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return districts.filter(
      (d) =>
        (region === "all" || d.region === region) &&
        (term === "" || d.name.toLowerCase().includes(term) || d.region.toLowerCase().includes(term)),
    );
  }, [districts, region, search]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const busy = activate.isPending || deactivate.isPending;

  const runActivate = () =>
    activate.mutate(selected, { onSuccess: () => setSelected([]) });
  const runDeactivate = () =>
    deactivate.mutate({ districtIds: selected, remove: true }, { onSuccess: () => setSelected([]) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
          District patrol areas
        </CardTitle>
        <CardDescription>
          Official district boundaries for all {districts.length || "—"} Ghanaian districts.
          Activate the districts your command patrols to include them in geofence
          compliance reporting. {activeByDistrict.size} active.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <div className="space-y-1">
            <Label htmlFor="gd-search">Search district</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="gd-search"
                className="pl-8"
                placeholder="e.g. Ga West, Tamale, Sekondi"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gd-region">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="gd-region"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canManage && selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-medium">{selected.length} selected</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={runActivate} disabled={busy}>
                {activate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                Activate as patrol areas
              </Button>
              <Button size="sm" variant="outline" onClick={runDeactivate} disabled={busy}>
                {deactivate.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                Remove patrol areas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])} disabled={busy}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-[360px] space-y-1 overflow-y-auto rounded-md border p-2">
          {districtsQuery.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading districts…</p>
          )}
          {!districtsQuery.isLoading && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No district matches that search.</p>
          )}
          {filtered.map((d) => {
            const zone = activeByDistrict.get(d.id);
            return (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-muted/60"
              >
                <Checkbox
                  checked={selected.includes(d.id)}
                  onCheckedChange={() => toggle(d.id)}
                  disabled={!canManage}
                  aria-label={`Select ${d.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.region} Region · {d.category}
                  </span>
                </span>
                {zone ? (
                  <Badge
                    variant="outline"
                    className={
                      zone.active
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-muted text-muted-foreground border-border"
                    }
                  >
                    {zone.active ? "Patrol area" : "Inactive"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Not in use</Badge>
                )}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
