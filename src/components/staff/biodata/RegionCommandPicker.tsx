import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { OptionCombobox } from "./OptionCombobox";

export const GHANA_REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East",
  "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North",
];

/** Regional commands whose name doesn't carry the region name. */
const REGION_ALIASES: Record<string, string[]> = { "Greater Accra": ["tema", "aia", "kotoka"] };

type Unit = { id: string; name: string; type: string; parent_id: string | null };

/**
 * Region → Regional Command → Station/Sector/Command cascade over the command
 * tree. Only units the caller can see are returned (org_units RLS).
 */
export function RegionCommandPicker({
  region, onRegionChange, command, onCommandChange,
}: {
  region: string; onRegionChange: (v: string) => void;
  command: string; onCommandChange: (v: string) => void;
}) {
  const { data: units = [] } = useQuery({
    queryKey: ["org-units-cascade"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("org_units").select("id, name, type, parent_id");
      return (data ?? []) as Unit[];
    },
  });

  const regionals = useMemo(() => {
    const all = units.filter((u) => u.type === "regional");
    if (!region) return all;
    const keys = [region.toLowerCase(), ...(REGION_ALIASES[region] ?? [])];
    const m = all.filter((u) => keys.some((k) => u.name.toLowerCase().includes(k)));
    return m.length ? m : all;
  }, [units, region]);

  const commandOptions = useMemo(() => {
    const kids = new Map<string, Unit[]>();
    units.forEach((u) => { if (u.parent_id) kids.set(u.parent_id, [...(kids.get(u.parent_id) ?? []), u]); });
    const out: { value: string; label: string }[] = [];
    const walk = (u: Unit, rc: string) => {
      (kids.get(u.id) ?? []).forEach((c) => {
        out.push({ value: c.name, label: `${c.name} · ${c.type} (${rc})` });
        walk(c, rc);
      });
    };
    regionals.forEach((r) => { out.push({ value: r.name, label: `${r.name} · regional command` }); walk(r, r.name); });
    return out;
  }, [units, regionals]);

  return (
    <>
      <div>
        <Label htmlFor="bio-service-region">Region</Label>
        <OptionCombobox id="bio-service-region" value={region} onChange={(v) => { onRegionChange(v); }}
          options={GHANA_REGIONS.map((r) => ({ value: r, label: r }))} placeholder="Search region…" />
      </div>
      <div>
        <Label htmlFor="bio-sector">Station / Sector / Command</Label>
        <OptionCombobox id="bio-sector" value={command} onChange={onCommandChange}
          options={commandOptions} placeholder={region ? `Commands in ${region}…` : "Select a region first or search…"} allowCustom />
      </div>
    </>
  );
}
