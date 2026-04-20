import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExportMenu } from "@/components/ui/export-menu";
import { Users, Crown, Search } from "lucide-react";

const UNIT_OPTIONS = [
  { key: "all", label: "All Units" },
  { key: "cyber_risk", label: "Cybersecurity & Risk Management" },
  { key: "infra_systems", label: "IT Infrastructure & Systems Engineering" },
  { key: "data_analytics", label: "Data Analytics & Intelligence" },
  { key: "governance", label: "Information Governance & Compliance" },
  { key: "cyber_ops", label: "Cyber Operations & Innovation Lab" },
  { key: "hardware", label: "Hardware Unit" },
];

export function StaffRosterTab() {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [leadOnly, setLeadOnly] = useState("all");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["misd_unit_assignments_roster"],
    queryFn: async () => {
      const { data } = await supabase
        .from("misd_unit_assignments")
        .select("*, profiles:profile_id(id, first_name, last_name, staff_id, photo_url, ranks:rank_id(name), departments:department_id(name))")
        .order("unit_name", { ascending: true });
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    return assignments.filter((a: any) => {
      if (unitFilter !== "all" && a.unit_key !== unitFilter) return false;
      if (leadOnly === "leads" && !a.is_lead) return false;
      if (leadOnly === "members" && a.is_lead) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${a.profiles?.first_name || ""} ${a.profiles?.last_name || ""}`.toLowerCase();
        const sid = (a.profiles?.staff_id || "").toLowerCase();
        const role = (a.role_title || "").toLowerCase();
        const unit = (a.unit_name || "").toLowerCase();
        if (!name.includes(q) && !sid.includes(q) && !role.includes(q) && !unit.includes(q)) return false;
      }
      return true;
    });
  }, [assignments, search, unitFilter, leadOnly]);

  const stats = useMemo(() => {
    const total = assignments.length;
    const leads = assignments.filter((a: any) => a.is_lead).length;
    const uniqueStaff = new Set(assignments.map((a: any) => a.profile_id)).size;
    return { total, leads, uniqueStaff };
  }, [assignments]);

  const exportRows = filtered.map((a: any) => ({
    "Staff ID": a.profiles?.staff_id || "",
    "First Name": a.profiles?.first_name || "",
    "Last Name": a.profiles?.last_name || "",
    Rank: a.profiles?.ranks?.name || "",
    Unit: a.unit_name || "",
    Role: a.role_title || "",
    "Unit Lead": a.is_lead ? "Yes" : "No",
    "Assigned At": a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : "",
  }));

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-700 dark:text-cyan-300" />
            <div>
              <p className="text-xs text-muted-foreground">Total Assignments</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="h-8 w-8 text-cyan-700 dark:text-cyan-300" />
            <div>
              <p className="text-xs text-muted-foreground">Unique Staff</p>
              <p className="text-2xl font-bold text-cyan-800 dark:text-cyan-200">{stats.uniqueStaff}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Crown className="h-8 w-8 text-emerald-700 dark:text-emerald-300" />
            <div>
              <p className="text-xs text-muted-foreground">Unit Leads</p>
              <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{stats.leads}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-700 dark:text-cyan-300" />
              MISD / CYBER Staff Roster
            </CardTitle>
            <ExportMenu data={exportRows} filename="misd-cyber-staff-roster" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, staff ID, role, unit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leadOnly} onValueChange={setLeadOnly}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                <SelectItem value="leads">Unit Leads</SelectItem>
                <SelectItem value="members">Members Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50 dark:bg-blue-950/40">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6 italic">No staff assignments found.</TableCell></TableRow>
                ) : (
                  filtered.map((a: any) => {
                    const initials = `${a.profiles?.first_name?.[0] || ""}${a.profiles?.last_name?.[0] || ""}`.toUpperCase();
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Avatar className="h-7 w-7">
                            {a.profiles?.photo_url && <AvatarImage src={a.profiles.photo_url} />}
                            <AvatarFallback className="text-[10px] bg-blue-900 text-cyan-200">{initials}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{a.profiles?.first_name} {a.profiles?.last_name}</div>
                          <div className="text-[11px] text-muted-foreground">{a.profiles?.staff_id || "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{a.profiles?.ranks?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{a.unit_name}</TableCell>
                        <TableCell className="text-xs">{a.role_title || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                        <TableCell className="text-center">
                          {a.is_lead ? (
                            <Badge className="bg-cyan-600 text-white hover:bg-cyan-600 text-[10px]">
                              <Crown className="h-2.5 w-2.5 mr-1" />Lead
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-800 dark:text-blue-200">Member</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Showing {filtered.length} of {assignments.length} assignments
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
