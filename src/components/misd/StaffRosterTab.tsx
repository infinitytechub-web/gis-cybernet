import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExportMenu } from "@/components/ui/export-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Crown, Search, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

const UNIT_OPTIONS = [
  { key: "all", label: "All Units" },
  { key: "cyber_risk", label: "Cybersecurity & Risk Management" },
  { key: "infra_systems", label: "IT Infrastructure & Systems Engineering" },
  { key: "data_analytics", label: "Data Analytics & Intelligence" },
  { key: "governance", label: "Information Governance & Compliance" },
  { key: "cyber_ops", label: "Cyber Operations & Innovation Lab" },
  { key: "hardware", label: "Hardware Unit" },
];

// Manageable units (excludes "all"), with their canonical name + role catalog
const UNIT_CATALOG: Record<string, { name: string; roles: string[] }> = {
  cyber_risk: {
    name: "Cybersecurity & Risk Management",
    roles: ["Cybersecurity Analyst", "Cyber Threat Intelligence Analyst", "Information Assurance Specialist"],
  },
  infra_systems: {
    name: "IT Infrastructure & Systems Engineering",
    roles: ["IT Infrastructure Manager", "Network Architect", "Systems Engineer"],
  },
  data_analytics: {
    name: "Data Analytics & Intelligence",
    roles: ["Data Scientist", "Intelligence Data Analyst"],
  },
  governance: {
    name: "Information Governance & Compliance",
    roles: ["Information Assurance Specialist"],
  },
  cyber_ops: {
    name: "Cyber Operations & Innovation Lab",
    roles: ["Cyber Operations Specialist", "Software Developer"],
  },
  hardware: {
    name: "Hardware Unit",
    roles: ["Asset & Lifecycle Manager", "Hardware Engineer / Technician", "Field Support Specialist", "Biometrics & Peripherals Specialist"],
  },
};

export function StaffRosterTab() {
  const { role, user } = useAuth();
  const qc = useQueryClient();

  // Determine if current user is the MISD/CYBER OIC (supervisor assigned to the MISD/CYBER department)
  const { data: isMisdOic = false } = useQuery({
    queryKey: ["is_misd_oic", user?.id],
    enabled: !!user?.id && role === "supervisor",
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("department_id, departments:department_id(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      const depName = (prof as any)?.departments?.name?.toLowerCase() || "";
      return depName.includes("misd") || depName.includes("cyber");
    },
  });

  // Restricted to: System Admin, Command OIC, Command 2IC, MISD/CYBER OIC (department supervisor)
  const canManage =
    role === "admin" ||
    role === "oic" ||
    role === "2ic" ||
    isMisdOic;

  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [leadOnly, setLeadOnly] = useState("all");
  const [editing, setEditing] = useState<any>(null);
  const [reassigning, setReassigning] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["misd_unit_assignments_roster"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("misd_unit_assignments")
        .select("*")
        .order("unit_name", { ascending: true });
      const ids = Array.from(new Set((rows || []).map((r: any) => r.profile_id)));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, photo_url, rank_id, department_id, ranks:rank_id(name), departments:department_id(name)")
        .in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      return (rows || []).map((r: any) => ({ ...r, profiles: map.get(r.profile_id) || null }));
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
        const rl = (a.role_title || "").toLowerCase();
        const unit = (a.unit_name || "").toLowerCase();
        if (!name.includes(q) && !sid.includes(q) && !rl.includes(q) && !unit.includes(q)) return false;
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["misd_unit_assignments_roster"] });
    qc.invalidateQueries({ queryKey: ["misd_unit_assignments"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await softDelete({ table: "misd_unit_assignments", id, label: "MISD unit assignment" });
    },
    onSuccess: () => { refresh(); toast.success("Assignment removed"); setDeleting(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const getExportData = () => ({
    title: "MISD / CYBER Staff Roster",
    filename: "misd-cyber-staff-roster",
    headers: ["Staff ID", "Name", "Rank", "Unit", "Role", "Unit Lead", "Assigned"],
    rows: filtered.map((a: any) => [
      a.profiles?.staff_id || "",
      `${a.profiles?.first_name || ""} ${a.profiles?.last_name || ""}`.trim(),
      a.profiles?.ranks?.name || "",
      a.unit_name || "",
      a.role_title || "",
      a.is_lead ? "Yes" : "No",
      a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : "",
    ]),
  });

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
            <ExportMenu getData={getExportData} size="sm" variant="outline" />
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

          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-50 dark:bg-blue-950/40">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-6 italic">No staff assignments found.</TableCell></TableRow>
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
                          <div className="text-xs text-muted-foreground">{a.profiles?.staff_id || "—"}</div>
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
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-blue-700 dark:text-cyan-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                onClick={() => setReassigning(a)}
                                title="Reassign to another unit"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Reassign
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                onClick={() => setEditing(a)}
                                title="Edit role / lead status"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleting(a)}
                                title="Remove assignment"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {assignments.length} assignments
          </p>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editing && (
        <EditAssignmentDialog
          assignment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      {/* Reassign Dialog */}
      {reassigning && (
        <ReassignDialog
          assignment={reassigning}
          existingAssignments={assignments}
          onClose={() => setReassigning(null)}
          onSaved={() => { refresh(); setReassigning(null); }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Staff Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-semibold">
                {deleting?.profiles?.first_name} {deleting?.profiles?.last_name}
              </span> from <span className="font-semibold">{deleting?.unit_name}</span>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===== Edit (role + lead) ===== */
function EditAssignmentDialog({ assignment, onClose, onSaved }: { assignment: any; onClose: () => void; onSaved: () => void }) {
  const unit = UNIT_CATALOG[assignment.unit_key];
  const [roleTitle, setRoleTitle] = useState(assignment.role_title || unit?.roles[0] || "");
  const [isLead, setIsLead] = useState(!!assignment.is_lead);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("misd_unit_assignments")
        .update({ role_title: roleTitle || null, is_lead: isLead })
        .eq("id", assignment.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assignment updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            Edit Assignment
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm">
            <p className="font-medium">{assignment.profiles?.first_name} {assignment.profiles?.last_name}</p>
            <p className="text-xs text-muted-foreground">{assignment.unit_name}</p>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Role</label>
            <Select value={roleTitle} onValueChange={setRoleTitle}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {(unit?.roles || []).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isLead} onCheckedChange={(v) => setIsLead(!!v)} />
            <Crown className="h-3.5 w-3.5 text-cyan-600" />
            Mark as Unit Lead
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-blue-900 hover:bg-blue-950 text-cyan-100">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===== Reassign (move to another unit) ===== */
function ReassignDialog({
  assignment, existingAssignments, onClose, onSaved,
}: {
  assignment: any; existingAssignments: any[]; onClose: () => void; onSaved: () => void;
}) {
  const otherUnitKeys = Object.keys(UNIT_CATALOG).filter((k) => k !== assignment.unit_key);
  const [targetUnit, setTargetUnit] = useState(otherUnitKeys[0] || "");
  const [roleTitle, setRoleTitle] = useState(UNIT_CATALOG[otherUnitKeys[0]]?.roles[0] || "");
  const [isLead, setIsLead] = useState(false);

  const onUnitChange = (k: string) => {
    setTargetUnit(k);
    setRoleTitle(UNIT_CATALOG[k]?.roles[0] || "");
  };

  const targetCatalog = UNIT_CATALOG[targetUnit];
  const alreadyInTarget = existingAssignments.some(
    (a: any) => a.profile_id === assignment.profile_id && a.unit_key === targetUnit,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!targetCatalog) throw new Error("Select a target unit");
      if (alreadyInTarget) throw new Error("Staff is already assigned to that unit");
      const { error } = await supabase
        .from("misd_unit_assignments")
        .update({
          unit_key: targetUnit,
          unit_name: targetCatalog.name,
          role_title: roleTitle || null,
          is_lead: isLead,
        })
        .eq("id", assignment.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Staff reassigned"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-blue-700 dark:text-cyan-300" />
            Reassign Staff to Another Unit
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm rounded-md bg-muted/50 p-2">
            <p className="font-medium">{assignment.profiles?.first_name} {assignment.profiles?.last_name}</p>
            <p className="text-xs text-muted-foreground">From: {assignment.unit_name}</p>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Target Unit</label>
            <Select value={targetUnit} onValueChange={onUnitChange}>
              <SelectTrigger><SelectValue placeholder="Select target unit" /></SelectTrigger>
              <SelectContent>
                {otherUnitKeys.map((k) => (
                  <SelectItem key={k} value={k}>{UNIT_CATALOG[k].name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {alreadyInTarget && (
              <p className="text-xs text-destructive mt-1">Staff is already in this unit.</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Role in New Unit</label>
            <Select value={roleTitle} onValueChange={setRoleTitle}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {(targetCatalog?.roles || []).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isLead} onCheckedChange={(v) => setIsLead(!!v)} />
            <Crown className="h-3.5 w-3.5 text-cyan-600" />
            Mark as Unit Lead
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || alreadyInTarget}
            className="bg-blue-900 hover:bg-blue-950 text-cyan-100"
          >
            {save.isPending ? "Reassigning…" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
