import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Search } from "lucide-react";
import type { ProfileWithRelations } from "@/lib/types";

export default function Staff() {
  const [search, setSearch] = useState("");

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(*), departments(*)")
        .order("last_name");
      if (error) throw error;
      return data as ProfileWithRelations[];
    },
  });

  const filtered = staff.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.staff_id.toLowerCase().includes(q) ||
      (s.unit?.toLowerCase().includes(q) ?? false)
    );
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "bg-emerald-100 text-emerald-800";
      case "inactive": return "bg-red-100 text-red-800";
      case "study_leave": return "bg-amber-100 text-amber-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Staff / Employees</h1>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, ID, or unit..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Rank</TableHead>
                <TableHead className="hidden md:table-cell">Unit</TableHead>
                <TableHead className="hidden lg:table-cell">Shift</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff found</TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.staff_id}</TableCell>
                    <TableCell className="font-medium">{s.last_name}, {s.first_name}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.ranks?.abbreviation ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.unit ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{s.shift_group ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(s.status)}>{s.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {staff.length} staff shown</p>
    </div>
  );
}
