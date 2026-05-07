import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronDown, ChevronRight, Star, Shield, Users, X, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * OfficerSelector — categorised picker used by the Appraisals "New Appraisal" tab.
 *
 * Senior Officers: ASI → ACI (rank levels 7..11) — single quick-select + preview panel.
 * Junior Officers: AICO II → Senior Inspectors (levels 1..6) — bulk selection.
 *
 * The owning page may use either the single `selected` officer (Senior workflow,
 * where one appraisal is filed at a time) or the `bulkSelected` set (Junior
 * workflow, where the same scoring sheet may be applied to many officers).
 */

export interface OfficerOption {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  rank: { id: string; abbreviation: string; name: string; level: number } | null;
  department: { id: string; name: string } | null;
  unit: string | null;
}

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  bulkSelected: string[];
  onBulkChange: (ids: string[]) => void;
}

const PAGE_SIZE = 12;
const SENIOR_RANGE: [number, number] = [7, 11]; // ASI → ACI
const JUNIOR_RANGE: [number, number] = [1, 6];  // AICO II → Senior Inspector

function fullName(o: OfficerOption) {
  return `${o.last_name}, ${o.first_name}`;
}
function initials(o: OfficerOption) {
  return `${o.first_name?.[0] ?? ""}${o.last_name?.[0] ?? ""}`.toUpperCase();
}

export function OfficerSelector({ selectedId, onSelect, bulkSelected, onBulkChange }: Props) {
  // ---- Reference data ----
  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranks")
        .select("id, abbreviation, name, level")
        .order("level", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: officers = [], isLoading } = useQuery({
    queryKey: ["officers-for-appraisal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, staff_id, first_name, last_name, photo_url, unit, rank:ranks(id, abbreviation, name, level), department:departments(id, name)",
        )
        .order("last_name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as unknown) as OfficerOption[];
    },
  });

  const seniorRankIds = useMemo(
    () => new Set(ranks.filter((r) => r.level >= SENIOR_RANGE[0] && r.level <= SENIOR_RANGE[1]).map((r) => r.id)),
    [ranks],
  );
  const juniorRankIds = useMemo(
    () => new Set(ranks.filter((r) => r.level >= JUNIOR_RANGE[0] && r.level <= JUNIOR_RANGE[1]).map((r) => r.id)),
    [ranks],
  );

  const seniorOfficers = useMemo(
    () => officers.filter((o) => o.rank && seniorRankIds.has(o.rank.id)),
    [officers, seniorRankIds],
  );
  const juniorOfficers = useMemo(
    () => officers.filter((o) => o.rank && juniorRankIds.has(o.rank.id)),
    [officers, juniorRankIds],
  );

  const selected = useMemo(() => officers.find((o) => o.id === selectedId) ?? null, [officers, selectedId]);

  return (
    <div className="space-y-3">
      <Category
        kind="senior"
        label="Senior Officers"
        rangeLabel="ASI → ACI"
        icon={<Shield className="h-4 w-4 text-emerald-700" />}
        ranks={ranks.filter((r) => seniorRankIds.has(r.id))}
        departments={departments}
        officers={seniorOfficers}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={onSelect}
        bulkSelected={bulkSelected}
        onBulkChange={onBulkChange}
        selectedOfficer={selected}
        showPreview
      />
      <Category
        kind="junior"
        label="Junior Officers"
        rangeLabel="AICO II → Senior Inspectors"
        icon={<Users className="h-4 w-4 text-sky-700" />}
        ranks={ranks.filter((r) => juniorRankIds.has(r.id))}
        departments={departments}
        officers={juniorOfficers}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={onSelect}
        bulkSelected={bulkSelected}
        onBulkChange={onBulkChange}
        selectedOfficer={selected}
        bulkMode
      />
    </div>
  );
}

interface CategoryProps {
  kind: "senior" | "junior";
  label: string;
  rangeLabel: string;
  icon: React.ReactNode;
  ranks: { id: string; abbreviation: string; name: string; level: number }[];
  departments: { id: string; name: string }[];
  officers: OfficerOption[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  bulkSelected: string[];
  onBulkChange: (ids: string[]) => void;
  selectedOfficer: OfficerOption | null;
  showPreview?: boolean;
  bulkMode?: boolean;
}

function Category({
  kind, label, rangeLabel, icon,
  ranks, departments, officers, loading,
  selectedId, onSelect,
  bulkSelected, onBulkChange,
  selectedOfficer, showPreview, bulkMode,
}: CategoryProps) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = officers.filter((o) => {
      if (rankFilter !== "all" && o.rank?.id !== rankFilter) return false;
      if (deptFilter !== "all" && o.department?.id !== deptFilter) return false;
      if (q) {
        const hay = `${o.first_name} ${o.last_name} ${o.staff_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (bulkMode) {
      // Junior officers are sorted alphabetically per spec.
      list = [...list].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    }
    return list;
  }, [officers, search, rankFilter, deptFilter, bulkMode]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const allOnPageSelected = bulkMode && pageItems.length > 0 && pageItems.every((o) => bulkSelected.includes(o.id));

  const togglePageBulk = () => {
    const ids = new Set(bulkSelected);
    if (allOnPageSelected) pageItems.forEach((o) => ids.delete(o.id));
    else pageItems.forEach((o) => ids.add(o.id));
    onBulkChange(Array.from(ids));
  };

  const toggleOne = (id: string) => {
    const set = new Set(bulkSelected);
    if (set.has(id)) set.delete(id); else set.add(id);
    onBulkChange(Array.from(set));
  };

  return (
    <Card className={cn("border-l-4", kind === "senior" ? "border-l-emerald-600" : "border-l-sky-600")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/40 transition">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {icon}
              <CardTitle className="text-sm">{label}</CardTitle>
              <Badge variant="outline" className="text-[10px]">{rangeLabel}</Badge>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {filtered.length} officer{filtered.length === 1 ? "" : "s"}
                {bulkMode && bulkSelected.length > 0 && (
                  <Badge className="ml-2 bg-sky-100 text-sky-900">{bulkSelected.length} selected</Badge>
                )}
              </span>
            </div>
            <CardDescription className="text-[11px]">
              {bulkMode
                ? "Bulk-select multiple officers; alphabetical sort."
                : "Quick-select an officer for individual appraisal — preview shown on the right."}
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-7"
                  placeholder="Search name or staff ID…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={rankFilter} onValueChange={(v) => { setRankFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All ranks" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ranks in this category</SelectItem>
                  {ranks.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.abbreviation} — {r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={bulkMode ? "All units / departments" : "All departments"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{bulkMode ? "All units / departments" : "All departments"}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={cn("grid gap-3", showPreview ? "lg:grid-cols-[1fr_280px]" : "grid-cols-1")}>
              {/* Officer list */}
              <div className="rounded-md border">
                {bulkMode && (
                  <div className="flex items-center gap-2 p-2 border-b bg-muted/30 text-xs">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={togglePageBulk} />
                    <span className="text-muted-foreground">Select all on this page</span>
                    {bulkSelected.length > 0 && (
                      <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1" onClick={() => onBulkChange([])}>
                        <X className="h-3 w-3" /> Clear ({bulkSelected.length})
                      </Button>
                    )}
                  </div>
                )}
                <ScrollArea className="h-[340px]">
                  <ul className="divide-y">
                    {loading && (
                      <li className="px-3 py-6 text-xs text-muted-foreground text-center">Loading officers…</li>
                    )}
                    {!loading && pageItems.length === 0 && (
                      <li className="px-3 py-6 text-xs text-muted-foreground text-center">No officers match the current filters.</li>
                    )}
                    {pageItems.map((o) => {
                      const isSelected = selectedId === o.id;
                      const isBulked = bulkSelected.includes(o.id);
                      return (
                        <li
                          key={o.id}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 hover:bg-muted/40 cursor-pointer",
                            isSelected && "bg-emerald-50 dark:bg-emerald-950/30",
                          )}
                          onClick={() => onSelect(o.id)}
                        >
                          {bulkMode && (
                            <Checkbox
                              checked={isBulked}
                              onCheckedChange={() => toggleOne(o.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {!bulkMode && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => onSelect(isSelected ? "" : o.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Quick select"
                            />
                          )}
                          <Avatar className="h-7 w-7">
                            {o.photo_url ? <AvatarImage src={o.photo_url} alt={fullName(o)} /> : null}
                            <AvatarFallback className="text-[10px]">{initials(o)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{fullName(o)}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {o.rank?.abbreviation ?? "—"} · {o.department?.name ?? "Unassigned"}
                              {o.unit ? ` · ${o.unit}` : ""}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{o.staff_id}</span>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
                {/* Pagination */}
                {pageCount > 1 && (
                  <div className="flex items-center justify-between p-2 border-t text-xs">
                    <span className="text-muted-foreground">Page {page} of {pageCount}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile preview panel (Senior only) */}
              {showPreview && (
                <div className="rounded-md border p-3 bg-muted/20">
                  {selectedOfficer && seniorIncludes(selectedOfficer, ranks) ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          {selectedOfficer.photo_url ? <AvatarImage src={selectedOfficer.photo_url} /> : null}
                          <AvatarFallback>{initials(selectedOfficer)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{fullName(selectedOfficer)}</div>
                          <div className="text-[11px] text-muted-foreground">{selectedOfficer.staff_id}</div>
                        </div>
                      </div>
                      <dl className="text-xs space-y-1 pt-1">
                        <Row k="Rank" v={`${selectedOfficer.rank?.abbreviation ?? "—"} (${selectedOfficer.rank?.name ?? "—"})`} />
                        <Row k="Department" v={selectedOfficer.department?.name ?? "Unassigned"} />
                        <Row k="Unit" v={selectedOfficer.unit ?? "—"} />
                      </dl>
                      <Badge className="bg-emerald-100 text-emerald-900 gap-1 text-[10px]">
                        <Star className="h-3 w-3" /> Selected for appraisal
                      </Badge>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-8 text-center">
                      Quick-select a senior officer to preview their profile.
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function seniorIncludes(o: OfficerOption, ranks: { id: string; level: number }[]) {
  if (!o.rank) return false;
  const r = ranks.find((x) => x.id === o.rank!.id);
  return r ? r.level >= SENIOR_RANGE[0] && r.level <= SENIOR_RANGE[1] : false;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right truncate max-w-[160px]" title={v}>{v}</dd>
    </div>
  );
}
