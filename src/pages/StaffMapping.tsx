/**
 * Staff Mapping dashboard — where every staff member is posted.
 *
 * Rows come from the staff_mapping_rows RPC, which resolves each staff member's
 * region / sector / station from the org-unit tree and returns map coordinates.
 * Visibility is enforced inside the RPC (command tier sees all, everyone else is
 * scoped by can_see_org_unit), so no profile table access happens here.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Users, Building2, Award, Search, RefreshCw, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { StaffMappingMap, type MapCluster } from "@/components/staff-mapping/StaffMappingMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportMenu } from "@/components/ui/export-menu";

const db = supabase as any;

type MappingRow = {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  rank_name: string | null;
  rank_abbr: string | null;
  department_name: string | null;
  unit: string | null;
  status: string | null;
  shift_group: string | null;
  photo_url: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  station_name: string | null;
  sector_name: string | null;
  region_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

const ALL = "all";
const UNASSIGNED = "Not recorded";

function label(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : UNASSIGNED;
}

/** Ranked count list rendered as an accessible bar chart. */
function BreakdownCard({
  title,
  icon: Icon,
  rows,
  activeValue,
  onSelect,
}: {
  title: string;
  icon: typeof Users;
  rows: Array<{ key: string; count: number }>;
  activeValue: string;
  onSelect: (value: string) => void;
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.count), 0) || 1;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff in this scope.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((row) => {
              const active = activeValue === row.key;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(active ? ALL : row.key)}
                    aria-pressed={active}
                    className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring ${active ? "border-primary bg-muted" : "border-transparent"}`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{row.key}</span>
                      <span className="tabular-nums font-medium">{row.count}</span>
                    </span>
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function StaffMapping() {
  const [region, setRegion] = useState(ALL);
  const [sector, setSector] = useState(ALL);
  const [station, setStation] = useState(ALL);
  const [rank, setRank] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [mapKey, setMapKey] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["staff-mapping-rows"],
    queryFn: async (): Promise<MappingRow[]> => {
      const { data, error } = await db.rpc("staff_mapping_rows");
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const options = useMemo(() => {
    const uniq = (pick: (row: MappingRow) => string) =>
      Array.from(new Set(rows.map(pick))).sort((a, b) => a.localeCompare(b));
    return {
      regions: uniq((r) => label(r.region_name)),
      sectors: uniq((r) => label(r.sector_name)),
      stations: uniq((r) => label(r.station_name ?? r.org_unit_name)),
      ranks: uniq((r) => label(r.rank_name)),
      departments: uniq((r) => label(r.department_name)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (region !== ALL && label(row.region_name) !== region) return false;
      if (sector !== ALL && label(row.sector_name) !== sector) return false;
      if (station !== ALL && label(row.station_name ?? row.org_unit_name) !== station) return false;
      if (rank !== ALL && label(row.rank_name) !== rank) return false;
      if (department !== ALL && label(row.department_name) !== department) return false;
      if (status !== ALL && String(row.status ?? "active") !== status) return false;
      if (mapKey && `${row.latitude ?? ""},${row.longitude ?? ""}` !== mapKey) return false;
      if (!term) return true;
      return [row.full_name, row.staff_id, row.rank_name, row.unit, row.station_name, row.region_name, row.department_name]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [rows, region, sector, station, rank, department, status, search, mapKey]);

  const countBy = (pick: (row: MappingRow) => string) => {
    const map = new Map<string, number>();
    filtered.forEach((row) => {
      const key = pick(row);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };

  const byRegion = useMemo(() => countBy((r) => label(r.region_name)), [filtered]);
  const byStation = useMemo(() => countBy((r) => label(r.station_name ?? r.org_unit_name)), [filtered]);
  const byRank = useMemo(() => countBy((r) => label(r.rank_name)), [filtered]);

  const clusters = useMemo<MapCluster[]>(() => {
    const map = new Map<string, MapCluster>();
    filtered.forEach((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const key = `${row.latitude},${row.longitude}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else
        map.set(key, {
          key,
          label: label(row.station_name ?? row.org_unit_name ?? row.region_name),
          region: label(row.region_name),
          latitude: lat,
          longitude: lng,
          count: 1,
        });
    });
    return Array.from(map.values());
  }, [filtered]);

  const unlocated = filtered.length - clusters.reduce((acc, c) => acc + c.count, 0);

  const exportRows = filtered.map((row) => ({
    "Staff ID": row.staff_id ?? "",
    Name: row.full_name ?? "",
    Rank: label(row.rank_name),
    Region: label(row.region_name),
    Sector: label(row.sector_name),
    Station: label(row.station_name ?? row.org_unit_name),
    Department: label(row.department_name),
    Unit: label(row.unit),
    "Shift group": label(row.shift_group),
    Status: row.status ?? "",
  }));

  const resetFilters = () => {
    setRegion(ALL); setSector(ALL); setStation(ALL); setRank(ALL);
    setDepartment(ALL); setStatus("active"); setSearch(""); setMapKey(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MapIcon}
        title="Staff Mapping"
        subtitle="Where every staff member is posted — by region, station and rank, linked to their bio-data record."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              data={exportRows}
              filename="staff-mapping"
              title="Staff Mapping"
            />
            <Button variant="secondary" size="icon" onClick={() => void refetch()} aria-label="Refresh staff mapping">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Staff in view", value: filtered.length, icon: Users },
          { label: "Regions", value: byRegion.length, icon: MapIcon },
          { label: "Stations / units", value: byStation.length, icon: Building2 },
          { label: "Ranks", value: byRank.length, icon: Award },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <card.icon className="h-5 w-5 text-primary" aria-hidden />
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{isLoading ? "—" : card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="staff-map-search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input id="staff-map-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, staff ID, unit…" className="pl-8" />
            </div>
          </div>
          {[
            { id: "region", label: "Region", value: region, set: setRegion, list: options.regions },
            { id: "sector", label: "Sector / command", value: sector, set: setSector, list: options.sectors },
            { id: "station", label: "Station / unit", value: station, set: setStation, list: options.stations },
            { id: "rank", label: "Rank", value: rank, set: setRank, list: options.ranks },
            { id: "department", label: "Department", value: department, set: setDepartment, list: options.departments },
          ].map((filter) => (
            <div key={filter.id} className="space-y-1.5">
              <Label htmlFor={`staff-map-${filter.id}`}>{filter.label}</Label>
              <Select value={filter.value} onValueChange={filter.set}>
                <SelectTrigger id={`staff-map-${filter.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {filter.list.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="staff-map-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="staff-map-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="study_leave">Study leave</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={resetFilters} className="w-full sm:w-auto">Reset filters</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <StaffMappingMap clusters={clusters} selectedKey={mapKey} onSelect={setMapKey} unlocatedCount={Math.max(unlocated, 0)} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <BreakdownCard title="By region" icon={MapIcon} rows={byRegion} activeValue={region} onSelect={setRegion} />
          <BreakdownCard title="By station / unit" icon={Building2} rows={byStation} activeValue={station} onSelect={setStation} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <BreakdownCard title="By rank" icon={Award} rows={byRank} activeValue={rank} onSelect={setRank} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="h-4 w-4 text-primary" /> Staff records ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Staff</th>
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Region</th>
                    <th className="py-2 pr-3">Station / unit</th>
                    <th className="py-2 pr-3">Department</th>
                    <th className="py-2 pr-3">Shift</th>
                    <th className="py-2">Bio-data</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Loading staff postings…</td></tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No staff match these filters.</td></tr>
                  )}
                  {filtered.slice(0, 300).map((row) => (
                    <tr key={row.profile_id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block font-medium">{row.full_name || "—"}</span>
                        <span className="block text-xs text-muted-foreground">{row.staff_id ?? "—"}</span>
                      </td>
                      <td className="py-2 pr-3">{label(row.rank_abbr ?? row.rank_name)}</td>
                      <td className="py-2 pr-3">{label(row.region_name)}</td>
                      <td className="py-2 pr-3">{label(row.station_name ?? row.org_unit_name)}</td>
                      <td className="py-2 pr-3">{label(row.department_name)}</td>
                      <td className="py-2 pr-3">
                        {row.shift_group ? <Badge variant="secondary">{row.shift_group}</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2">
                        <Link to={`/staff/${row.profile_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          Open record
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 300 && (
              <p className="mt-2 text-xs text-muted-foreground">Showing the first 300 of {filtered.length}. Narrow the filters or export the full list.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
