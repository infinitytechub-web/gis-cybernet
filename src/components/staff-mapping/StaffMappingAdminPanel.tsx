/**
 * STAFF MAPPING ADMIN PANEL — administrators only.
 *
 * Two jobs:
 *  1. Stations: add a station / unit to the org-unit tree and set the map
 *     coordinates that place its pin on the Staff Mapping map.
 *  2. Dropdown lists: maintain the ranks table and the bio-data region and
 *     religion lists used across the personnel forms.
 *
 * Row level security on org_units, ranks and the biodata_* tables is the real
 * boundary; this screen is the convenience layer.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Loader2, MapPin, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBioDataOptionSets, type BioOptionSet } from "@/components/staff/biodata/useBioDataConfig";

const db = supabase as any;

const UNIT_TYPES = ["national", "regional", "sector", "district", "station", "unit"] as const;

type OrgUnit = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  parent_id: string | null;
  is_active: boolean | null;
  latitude: number | null;
  longitude: number | null;
};

type Rank = { id: string; name: string; abbreviation: string | null; level: number | null };

/** Editable option list backed by a bio-data option set (regions, religions…). */
function OptionListEditor({ set, onChanged }: { set: BioOptionSet | undefined; onChanged: () => void }) {
  const [value, setValue] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!set) throw new Error("This list does not exist yet");
      const label = value.trim();
      if (!label) throw new Error("Enter the name first");
      const { error } = await supabase.from("biodata_options").insert({
        set_id: set.id, value: label, label, sort_order: set.options.length + 1, active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { setValue(""); onChanged(); toast.success("Added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("biodata_options").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success("Removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Add an entry…"
          aria-label={`Add to ${set?.label ?? "list"}`}
        />
        <Button onClick={() => add.mutate()} disabled={add.isPending || !set}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {(set?.options ?? []).map((option) => (
          <li key={option.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
            <span>{option.label}</span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => remove.mutate(option.id)}
              aria-label={`Remove ${option.label}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </li>
        ))}
        {(set?.options ?? []).length === 0 && <li className="text-sm text-muted-foreground">No entries yet.</li>}
      </ul>
    </div>
  );
}

export function StaffMappingAdminPanel() {
  const qc = useQueryClient();
  const { data: optionSets = [] } = useBioDataOptionSets();

  const refreshLists = () => qc.invalidateQueries({ queryKey: ["biodata-option-sets"] });
  const refreshUnits = () => {
    qc.invalidateQueries({ queryKey: ["staff-mapping-units"] });
    qc.invalidateQueries({ queryKey: ["staff-mapping-rows"] });
  };

  const { data: units = [], isLoading: loadingUnits } = useQuery({
    queryKey: ["staff-mapping-units"],
    queryFn: async (): Promise<OrgUnit[]> => {
      const { data, error } = await db
        .from("org_units")
        .select("id,name,code,type,parent_id,is_active,latitude,longitude")
        .order("name");
      if (error) throw error;
      return (data ?? []) as OrgUnit[];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks-admin"],
    queryFn: async (): Promise<Rank[]> => {
      const { data, error } = await db.from("ranks").select("id,name,abbreviation,level").order("level");
      if (error) throw error;
      return (data ?? []) as Rank[];
    },
  });

  // ── Coordinate edits ──────────────────────────────────────────────────────
  const [coords, setCoords] = useState<Record<string, { lat: string; lng: string }>>({});
  const coordFor = (unit: OrgUnit) =>
    coords[unit.id] ?? {
      lat: unit.latitude === null || unit.latitude === undefined ? "" : String(unit.latitude),
      lng: unit.longitude === null || unit.longitude === undefined ? "" : String(unit.longitude),
    };

  const saveCoords = useMutation({
    mutationFn: async (unit: OrgUnit) => {
      const entry = coordFor(unit);
      const lat = entry.lat.trim() === "" ? null : Number(entry.lat);
      const lng = entry.lng.trim() === "" ? null : Number(entry.lng);
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw new Error("Latitude must be between -90 and 90");
      if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) throw new Error("Longitude must be between -180 and 180");
      const { error } = await db.from("org_units").update({ latitude: lat, longitude: lng }).eq("id", unit.id);
      if (error) throw error;
    },
    onSuccess: () => { refreshUnits(); toast.success("Coordinates saved"); },
    onError: (e: any) => toast.error(e.message ?? "Could not save the coordinates"),
  });

  // ── New station ───────────────────────────────────────────────────────────
  const [form, setForm] = useState({ name: "", code: "", type: "station", parentId: "", lat: "", lng: "" });
  const addUnit = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Enter the station name");
      if (!form.parentId) throw new Error("Choose the command this station reports to");
      const lat = form.lat.trim() === "" ? null : Number(form.lat);
      const lng = form.lng.trim() === "" ? null : Number(form.lng);
      if (lat !== null && !Number.isFinite(lat)) throw new Error("Latitude must be a number");
      if (lng !== null && !Number.isFinite(lng)) throw new Error("Longitude must be a number");
      const { error } = await db.from("org_units").insert({
        name: form.name.trim(),
        code: form.code.trim() || null,
        type: form.type,
        parent_id: form.parentId,
        latitude: lat,
        longitude: lng,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", code: "", type: "station", parentId: "", lat: "", lng: "" });
      refreshUnits();
      toast.success("Station added");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add the station"),
  });

  // ── Ranks ─────────────────────────────────────────────────────────────────
  const [rankForm, setRankForm] = useState({ name: "", abbreviation: "", level: "" });
  const addRank = useMutation({
    mutationFn: async () => {
      if (!rankForm.name.trim()) throw new Error("Enter the rank name");
      const level = rankForm.level.trim() === "" ? null : Number(rankForm.level);
      if (level !== null && !Number.isFinite(level)) throw new Error("Level must be a number");
      const { error } = await db.from("ranks").insert({
        name: rankForm.name.trim(),
        abbreviation: rankForm.abbreviation.trim() || null,
        level,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRankForm({ name: "", abbreviation: "", level: "" });
      qc.invalidateQueries({ queryKey: ["ranks-admin"] });
      qc.invalidateQueries({ queryKey: ["ranks"] });
      toast.success("Rank added");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not add the rank"),
  });
  const removeRank = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("ranks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ranks-admin"] });
      qc.invalidateQueries({ queryKey: ["ranks"] });
      toast.success("Rank removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not remove the rank — it may still be in use"),
  });

  const parents = useMemo(
    () => units.filter((unit) => unit.type !== "unit").sort((a, b) => a.name.localeCompare(b.name)),
    [units],
  );
  const located = units.filter((unit) => unit.latitude !== null && unit.longitude !== null).length;

  const setOf = (key: string) => optionSets.find((entry) => entry.key === key);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Staff Mapping setup
        </CardTitle>
        <CardDescription>
          Add stations with their map coordinates and maintain the rank, region and religion lists.
          {" "}
          <Badge variant="outline" className="ml-1">{located} of {units.length} placed on the map</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stations">
          <TabsList className="flex-wrap">
            <TabsTrigger value="stations">Stations &amp; coordinates</TabsTrigger>
            <TabsTrigger value="lists">Dropdown lists</TabsTrigger>
          </TabsList>

          <TabsContent value="stations" className="space-y-4 pt-4">
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="unit-name">Station / unit name</Label>
                <Input id="unit-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Nsawam Station" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit-code">Code (optional)</Label>
                <Input id="unit-code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="e.g. NSW" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit-type">Type</Label>
                <Select value={form.type} onValueChange={(value) => setForm((p) => ({ ...p, type: value }))}>
                  <SelectTrigger id="unit-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit-parent">Reports to</Label>
                <Select value={form.parentId} onValueChange={(value) => setForm((p) => ({ ...p, parentId: value }))}>
                  <SelectTrigger id="unit-parent"><SelectValue placeholder="Choose the parent command" /></SelectTrigger>
                  <SelectContent>
                    {parents.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit-lat">Latitude</Label>
                <Input id="unit-lat" inputMode="decimal" value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} placeholder="5.6037" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unit-lng">Longitude</Label>
                <Input id="unit-lng" inputMode="decimal" value={form.lng} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} placeholder="-0.1870" />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <Button onClick={() => addUnit.mutate()} disabled={addUnit.isPending}>
                  {addUnit.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                  Add station
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Station / unit</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Latitude</th>
                    <th className="py-2 pr-3">Longitude</th>
                    <th className="py-2">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUnits && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Loading commands…</td></tr>}
                  {units.map((unit) => {
                    const entry = coordFor(unit);
                    return (
                      <tr key={unit.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{unit.name}
                          </span>
                          {unit.code && <span className="block text-xs text-muted-foreground">{unit.code}</span>}
                        </td>
                        <td className="py-2 pr-3 capitalize">{unit.type}</td>
                        <td className="py-2 pr-3">
                          <Input
                            className="h-8 w-28"
                            inputMode="decimal"
                            value={entry.lat}
                            aria-label={`Latitude for ${unit.name}`}
                            onChange={(e) => setCoords((p) => ({ ...p, [unit.id]: { ...entry, lat: e.target.value } }))}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            className="h-8 w-28"
                            inputMode="decimal"
                            value={entry.lng}
                            aria-label={`Longitude for ${unit.name}`}
                            onChange={(e) => setCoords((p) => ({ ...p, [unit.id]: { ...entry, lng: e.target.value } }))}
                          />
                        </td>
                        <td className="py-2">
                          <Button size="sm" variant="outline" className="h-8" disabled={saveCoords.isPending} onClick={() => saveCoords.mutate(unit)}>
                            <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden /> Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="lists" className="pt-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Ranks</h3>
                <div className="grid grid-cols-[1fr_5rem_4rem_auto] gap-1.5">
                  <Input value={rankForm.name} placeholder="Rank name" aria-label="Rank name" onChange={(e) => setRankForm((p) => ({ ...p, name: e.target.value }))} />
                  <Input value={rankForm.abbreviation} placeholder="Abbr" aria-label="Rank abbreviation" onChange={(e) => setRankForm((p) => ({ ...p, abbreviation: e.target.value }))} />
                  <Input value={rankForm.level} placeholder="Lvl" inputMode="numeric" aria-label="Rank level" onChange={(e) => setRankForm((p) => ({ ...p, level: e.target.value }))} />
                  <Button onClick={() => addRank.mutate()} disabled={addRank.isPending} aria-label="Add rank">
                    {addRank.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {ranks.map((rank) => (
                    <li key={rank.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                      <span>{rank.name}{rank.abbreviation ? ` (${rank.abbreviation})` : ""}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRank.mutate(rank.id)} aria-label={`Remove ${rank.name}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                  {ranks.length === 0 && <li className="text-sm text-muted-foreground">No ranks yet.</li>}
                </ul>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Regions</h3>
                <OptionListEditor set={setOf("region_of_origin")} onChanged={refreshLists} />
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Religions</h3>
                <OptionListEditor set={setOf("religion")} onChanged={refreshLists} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
