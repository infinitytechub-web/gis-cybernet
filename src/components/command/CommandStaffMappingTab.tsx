/**
 * COMMAND CONSOLE — STAFF MAPPING TAB
 *
 * A command-scoped version of the Staff Mapping dashboard: the officer's own
 * region(s) only (the staff_mapping_rows RPC already limits rows to the caller's
 * reach), plus the live duty roster underneath so who-is-where and who-is-on-duty
 * sit on one screen.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffMappingMap, type MapCluster } from "@/components/staff-mapping/StaffMappingMap";
import { OnDutyNowPanel } from "@/components/roster/OnDutyNowPanel";
import { Users, Building2, Award, MapPin, Search, RefreshCw, IdCard } from "lucide-react";

const db = supabase as any;
const ALL = "all";
const UNASSIGNED = "Not recorded";

type MappingRow = {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  rank_name: string | null;
  department_name: string | null;
  unit: string | null;
  status: string | null;
  shift_group: string | null;
  station_name: string | null;
  sector_name: string | null;
  region_name: string | null;
  org_unit_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

function label(v: string | null | undefined) {
  const t = String(v ?? "").trim();
  return t.length ? t : UNASSIGNED;
}

export default function CommandStaffMappingTab() {
  const [region, setRegion] = useState(ALL);
  const [station, setStation] = useState(ALL);
  const [rank, setRank] = useState(ALL);
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["staff-mapping-rows"],
    queryFn: async (): Promise<MappingRow[]> => {
      const { data, error } = await db.rpc("staff_mapping_rows");
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const active = useMemo(() => rows.filter((r) => (r.status ?? "active") === "active"), [rows]);

  const options = useMemo(() => {
    const uniq = (pick: (r: MappingRow) => string) =>
      Array.from(new Set(active.map(pick))).sort((a, b) => a.localeCompare(b));
    return {
      regions: uniq((r) => label(r.region_name)),
      stations: uniq((r) => label(r.station_name ?? r.org_unit_name)),
      ranks: uniq((r) => label(r.rank_name)),
    };
  }, [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter((r) => {
      if (region !== ALL && label(r.region_name) !== region) return false;
      if (station !== ALL && label(r.station_name ?? r.org_unit_name) !== station) return false;
      if (rank !== ALL && label(r.rank_name) !== rank) return false;
      if (!q) return true;
      return `${r.full_name ?? ""} ${r.staff_id ?? ""} ${r.unit ?? ""}`.toLowerCase().includes(q);
    });
  }, [active, region, station, rank, search]);

  const clusters = useMemo<MapCluster[]>(() => {
    const map = new Map<string, MapCluster>();
    filtered.forEach((r) => {
      if (r.latitude == null || r.longitude == null) return;
      const key = label(r.station_name ?? r.org_unit_name);
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, {
        key,
        label: key,
        region: label(r.region_name),
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        count: 1,
      });
    });
    return Array.from(map.values());
  }, [filtered]);

  const counts = (pick: (r: MappingRow) => string) => {
    const m = new Map<string, number>();
    filtered.forEach((r) => m.set(pick(r), (m.get(pick(r)) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Staff in my command" value={filtered.length} />
        <Kpi icon={MapPin} label="Regions" value={new Set(filtered.map((r) => label(r.region_name))).size} />
        <Kpi icon={Building2} label="Stations / units" value={new Set(filtered.map((r) => label(r.station_name ?? r.org_unit_name))).size} />
        <Kpi icon={Award} label="Ranks represented" value={new Set(filtered.map((r) => label(r.rank_name))).size} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="space-y-1">
            <Label htmlFor="cmap-region">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="cmap-region" className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All my regions</SelectItem>
                {options.regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cmap-station">Station / unit</Label>
            <Select value={station} onValueChange={setStation}>
              <SelectTrigger id="cmap-station" className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stations</SelectItem>
                {options.stations.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cmap-rank">Rank</Label>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger id="cmap-rank" className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All ranks</SelectItem>
                {options.ranks.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label htmlFor="cmap-search">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input id="cmap-search" className="pl-8" placeholder="Name, staff ID or unit"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Where my staff are</CardTitle></CardHeader>
          <CardContent>
            <StaffMappingMap
              clusters={clusters}
              selectedKey={station === ALL ? null : station}
              onSelect={(key) => setStation(key ?? ALL)}
              unlocatedCount={filtered.filter((r) => r.latitude == null || r.longitude == null).length}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">By station / unit</CardTitle></CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm">
              {counts((r) => label(r.station_name ?? r.org_unit_name)).map(([key, count]) => (
                <li key={key} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                  <span className="truncate">{key}</span>
                  <span className="tabular-nums font-medium">{count}</span>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-muted-foreground">No staff in this scope.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Staff list</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Station / unit</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Bio-data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Loading staff…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No staff match these filters.</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 300).map((r) => (
                    <TableRow key={r.profile_id}>
                      <TableCell>
                        <div className="font-medium">{r.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.staff_id || "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm">{label(r.rank_name)}</TableCell>
                      <TableCell className="text-sm">{label(r.region_name)}</TableCell>
                      <TableCell className="text-sm">{label(r.station_name ?? r.org_unit_name)}</TableCell>
                      <TableCell>{r.shift_group ? <Badge variant="outline">{r.shift_group}</Badge> : "—"}</TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/staff/${r.profile_id}`}>
                            <IdCard className="mr-1 h-4 w-4" aria-hidden="true" /> Open record
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <OnDutyNowPanel />
    </div>
  );
}

function Kpi({ icon: Icon, label: text, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{text}</div>
        </div>
      </CardContent>
    </Card>
  );
}
