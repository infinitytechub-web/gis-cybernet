import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Phone, Users, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProfileWithRelations } from "@/lib/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PAGE_SIZE = 24;

function getPhotoUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/staff-photos/${path}`;
}

const getInitials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

const statusColor = (s: string) => {
  switch (s) {
    case "active": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "inactive": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "study_leave": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function StaffDirectory() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["directory-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(*), departments(*)")
        .eq("status", "active")
        .order("last_name");
      if (error) throw error;
      return data as ProfileWithRelations[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.staff_id.toLowerCase().includes(q) ||
        (s.phone?.toLowerCase().includes(q) ?? false);
      const matchesDept = deptFilter === "all" || s.department_id === deptFilter;
      const matchesShift = shiftFilter === "all" || s.shift_group === shiftFilter;
      return matchesSearch && matchesDept && matchesShift;
    });
  }, [staff, search, deptFilter, shiftFilter]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) setPage(safePage);

  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const grouped = paged.reduce<Record<string, ProfileWithRelations[]>>((acc, s) => {
    const dept = s.departments?.name ?? "Unassigned";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(s);
    return acc;
  }, {});

  const sortedDepts = Object.keys(grouped).sort();

  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Staff Directory</h1>
        <Badge variant="outline" className="gap-1">
          <Users className="h-3 w-3" /> {filtered.length} staff
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={deptFilter} onValueChange={handleFilterChange(setDeptFilter)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={shiftFilter} onValueChange={handleFilterChange(setShiftFilter)}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Shift" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shifts</SelectItem>
            <SelectItem value="A">Shift A</SelectItem>
            <SelectItem value="B">Shift B</SelectItem>
            <SelectItem value="C">Shift C</SelectItem>
            <SelectItem value="D">Shift D</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading directory...</div>
      ) : sortedDepts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No staff found matching your filters.</div>
      ) : (
        <>
          {sortedDepts.map((dept) => (
            <div key={dept} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {dept} ({grouped[dept].length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[dept].map((s) => (
                  <Card key={s.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-start gap-3">
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarImage src={getPhotoUrl(s.photo_url) ?? undefined} alt={`${s.first_name} ${s.last_name}`} />
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {getInitials(s.first_name, s.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{s.last_name}, {s.first_name}</p>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColor(s.status)}`}>
                            {s.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{s.ranks?.abbreviation ?? "—"} · {s.staff_id}</p>
                        {s.unit && <p className="text-xs text-muted-foreground mt-0.5">{s.unit}</p>}
                        {s.shift_group && (
                          <Badge variant="outline" className="text-[10px] mt-1">Shift {s.shift_group}</Badge>
                        )}
                        {s.phone && (
                          <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                            <Phone className="h-3 w-3" /> {s.phone}
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "ellipsis" ? (
                      <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === safePage ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
