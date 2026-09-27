import { assertNoDuplicateRoles, friendlyRoleError } from "@/lib/role-duplicate-guard";
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  UserCog, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet,
  Trash2, Search, Users, History, Plus, Building2, Undo2, Download,
} from "lucide-react";
import { toast } from "sonner";
import { logAdminAudit } from "@/lib/admin-audit";
import { ROLE_LABEL } from "@/lib/role-labels";
import { formatDateTime } from "@/lib/date-format";
import { csvCell } from "@/lib/csv-safe";
import { Checkbox } from "@/components/ui/checkbox";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination } from "@/components/ui/list-pagination";

type AppRole =
  | "admin" | "supervisor" | "staff" | "deputy_supervisor" | "deputy_shift_leader"
  | "deputy" | "shift_leader" | "special_duties" | "front_desk" | "oic" | "2ic"
  | "shift_supervisor" | "deputy_shift_supervisor" | "official" | "enquiry"
  | "storekeeper" | "procurement_officer" | "staff_officer" | "ipse_supervisor"
  | "ipse_deputy_supervisor" | "head_of_administration" | "chief_staff_officer" | "command_officer"
  | "head_of_processing" | "deputy_head_of_processing" | "medical_officer";

const KNOWN_ROLES: AppRole[] = [
  "admin","supervisor","staff","deputy_supervisor","deputy_shift_leader","deputy",
  "shift_leader","special_duties","front_desk","oic","2ic","shift_supervisor",
  "deputy_shift_supervisor","official","enquiry","storekeeper","procurement_officer",
  "staff_officer","ipse_supervisor","ipse_deputy_supervisor","head_of_administration",
  "chief_staff_officer","command_officer","head_of_processing","deputy_head_of_processing","medical_officer",
];

interface PreviewRow {
  staff_id: string;
  role: AppRole | null;
  raw_role: string;
  user_id: string | null;
  status: "ready" | "duplicate" | "no_staff" | "bad_role";
  reason?: string;
}

function normalizeRole(r: string): AppRole | null {
  const k = r.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (KNOWN_ROLES as string[]).includes(k) ? (k as AppRole) : null;
}

const labelFor = (r: string) => (ROLE_LABEL as Record<string, string>)[r] ?? r.replace(/_/g, " ");

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return csvCell(s);
}

function exportAuditCsv(rows: any[]) {
  const header = ["timestamp", "actor_staff_id", "actor_name", "action", "entity_type", "target_staff_id", "target_name", "detail", "reverted"];
  const lines = [header.join(",")];
  for (const e of rows) {
    const detail =
      e.action === "department.change"
        ? `${e.details?.from_name ?? ""} -> ${e.details?.to_name ?? ""}`
        : e.details?.role
          ? labelFor(e.details.role)
          : "";
    lines.push([
      new Date(e.created_at).toISOString(),
      e.actor?.staff_id ?? "",
      e.actor ? `${e.actor.last_name}, ${e.actor.first_name}` : "",
      e.action,
      e.entity_type,
      e.target?.staff_id ?? "",
      e.target ? `${e.target.last_name}, ${e.target.first_name}` : "",
      detail,
      e.details?.reverted_from ? "yes" : "no",
    ].map(csvEscape).join(","));
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `role-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function RoleAssignmentsAdmin() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ user_id: string; staff_id: string; name: string; department_id: string | null; roles: AppRole[] } | null>(null);
  const [addingRole, setAddingRole] = useState<AppRole | "">("");
  const [editingDept, setEditingDept] = useState<string>("");
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void;
  } | null>(null);
  const askConfirm = (cfg: { title: string; message: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void }) =>
    setConfirmState(cfg);

  // ---- Data ---------------------------------------------------------------

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });
  const deptName = (id?: string | null) => departments.find((d) => d.id === id)?.name ?? "—";

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["role-mgmt-users"],
    queryFn: async () => {
      const { data: profs, error } = await supabase
        .from("profiles")
        .select("user_id, staff_id, first_name, last_name, department_id, status")
        .order("last_name");
      if (error) throw error;
      const ids = (profs ?? []).map((p) => p.user_id);
      if (!ids.length) return [];
      const { data: roles } = await supabase
        .from("user_roles").select("user_id, role").in("user_id", ids);
      const rolesByUser = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const k = r.user_id;
        if (!rolesByUser.has(k)) rolesByUser.set(k, []);
        rolesByUser.get(k)!.push(r.role as AppRole);
      });
      return (profs ?? []).map((p) => ({ ...p, roles: rolesByUser.get(p.user_id) ?? [] }));
    },
    enabled: isAdmin,
  });

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.staff_id, u.first_name, u.last_name, deptName(u.department_id), ...u.roles]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, search, departments]);

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["role-assignments-list"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles").select("id, role, user_id");
      if (error) throw error;
      const userIds = Array.from(new Set(roles.map((r) => r.user_id)));
      if (!userIds.length) return [];
      const { data: profs } = await supabase
        .from("profiles").select("user_id, staff_id, first_name, last_name, department_id").in("user_id", userIds);
      const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
      return roles.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
    enabled: isAdmin,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of existingAssignments) c[r.role] = (c[r.role] || 0) + 1;
    return c;
  }, [existingAssignments]);

  // ---- Assignments tab: search / type-to-search / pick / select ----------
  const [aSearch, setASearch] = useState("");
  const [aRole, setARole] = useState<string>("all");
  const [aDept, setADept] = useState<string>("all");
  const [aStaff, setAStaff] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newStaff, setNewStaff] = useState("");
  const [newRole, setNewRole] = useState<AppRole | "">("");

  const staffOptions = useMemo(
    () => users.filter((u: any) => u.staff_id).map((u: any) => ({
      id: u.user_id, first_name: u.first_name ?? "", last_name: u.last_name ?? "", staff_id: u.staff_id,
    })),
    [users],
  );

  const filteredAssignments = useMemo(() => {
    const q = aSearch.trim().toLowerCase();
    return existingAssignments.filter((r: any) => {
      if (aRole !== "all" && r.role !== aRole) return false;
      if (aStaff && r.user_id !== aStaff) return false;
      if (aDept !== "all" && (r.profile?.department_id ?? "none") !== aDept) return false;
      if (!q) return true;
      return [r.profile?.staff_id, r.profile?.first_name, r.profile?.last_name, labelFor(r.role), deptName(r.profile?.department_id)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [existingAssignments, aSearch, aRole, aDept, aStaff, departments]);

  const assignPage = usePagedList(filteredAssignments, { resetKey: `${aSearch}|${aRole}|${aDept}|${aStaff}` });
  const usersPage = usePagedList(filteredUsers, { resetKey: search });

  // Drop selections that are no longer visible after filtering.
  const visibleIds = useMemo(() => new Set(filteredAssignments.map((r: any) => r.id)), [filteredAssignments]);
  const selectedVisible = [...selected].filter((id) => visibleIds.has(id));
  const pageIds = assignPage.pageItems.map((r: any) => r.id as string);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSel = (id: string, on: boolean) =>
    setSelected((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  const { data: auditTrail = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["role-mgmt-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("id, action, entity_type, entity_id, details, created_at, performed_by")
        .in("entity_type", ["user_role", "profile_department"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const actorIds = Array.from(new Set((data ?? []).map((d: any) => d.performed_by).filter(Boolean)));
      const targetIds = Array.from(new Set((data ?? []).map((d: any) => d.entity_id).filter(Boolean)));
      const allIds = Array.from(new Set([...actorIds, ...targetIds]));
      const { data: profs } = allIds.length
        ? await supabase.from("profiles").select("user_id, staff_id, first_name, last_name").in("user_id", allIds)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
      return (data ?? []).map((d: any) => ({
        ...d,
        actor: map.get(d.performed_by),
        target: map.get(d.entity_id),
      }));
    },
    enabled: isAdmin && tab === "audit",
    refetchInterval: tab === "audit" ? 15000 : false,
  });
  const auditPage = usePagedList(auditTrail);

  // ---- Mutations ----------------------------------------------------------

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      await assertNoDuplicateRoles([{ user_id, role }]);
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw new Error(friendlyRoleError(error));
      await logAdminAudit("user_role", "role.add", { role, reversible: true }, user_id);
    },
    onSuccess: () => {
      toast.success("Role added");
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRoleByUser = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) throw error;
      await logAdminAudit("user_role", "role.remove", { role, reversible: true }, user_id);
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeDepartment = useMutation({
    mutationFn: async ({ user_id, from, to }: { user_id: string; from: string | null; to: string | null }) => {
      const { error } = await supabase.from("profiles").update({ department_id: to }).eq("user_id", user_id);
      if (error) throw error;
      await logAdminAudit("profile_department", "department.change", {
        from, to,
        from_name: deptName(from),
        to_name: deptName(to),
        reversible: true,
      }, user_id);
    },
    onSuccess: () => {
      toast.success("Department updated");
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const rows = existingAssignments.filter((r: any) => ids.includes(r.id));
      for (let i = 0; i < ids.length; i += 50) {
        const { error } = await supabase.from("user_roles").delete().in("id", ids.slice(i, i + 50));
        if (error) throw error;
      }
      await Promise.all(rows.map((r: any) =>
        logAdminAudit("user_role", "role.remove", { role: r.role, reversible: true, bulk: true }, r.user_id)));
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} role assignment(s) removed`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from("user_roles").select("user_id, role").eq("id", id).maybeSingle();
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
      if (row) await logAdminAudit("user_role", "role.remove", { role: row.role, reversible: true }, row.user_id);
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revert = useMutation({
    mutationFn: async (entry: any) => {
      const d = entry.details ?? {};
      if (entry.action === "role.add") {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", entry.entity_id).eq("role", d.role);
        if (error) throw error;
        await logAdminAudit("user_role", "role.remove", { role: d.role, reverted_from: entry.id }, entry.entity_id);
      } else if (entry.action === "role.remove") {
        await assertNoDuplicateRoles([{ user_id: entry.entity_id, role: d.role }]);
        const { error } = await supabase.from("user_roles").insert({ user_id: entry.entity_id, role: d.role });
        if (error) throw error;
        await logAdminAudit("user_role", "role.add", { role: d.role, reverted_from: entry.id }, entry.entity_id);
      } else if (entry.action === "department.change") {
        const { error } = await supabase.from("profiles").update({ department_id: d.from ?? null }).eq("user_id", entry.entity_id);
        if (error) throw error;
        await logAdminAudit("profile_department", "department.change", {
          from: d.to, to: d.from, from_name: d.to_name, to_name: d.from_name, reverted_from: entry.id,
        }, entry.entity_id);
      } else {
        throw new Error("Action not reversible");
      }
    },
    onSuccess: () => {
      toast.success("Change reverted");
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Bulk upload (preserved) -------------------------------------------

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (!rows.length) throw new Error("Empty file");

      const staffIds = rows.map((r) => String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim()).filter(Boolean);
      const { data: profs } = await supabase.from("profiles").select("staff_id, user_id").in("staff_id", staffIds);
      const profMap = new Map((profs ?? []).map((p) => [p.staff_id, p.user_id]));
      const { data: existing } = await supabase.from("user_roles").select("user_id, role");
      const existingSet = new Set((existing ?? []).map((e) => `${e.user_id}|${e.role}`));

      const out: PreviewRow[] = rows.map((r) => {
        const staff_id = String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim();
        const raw_role = String(r.role ?? r.Role ?? r.ROLE ?? "").trim();
        const role = normalizeRole(raw_role);
        const user_id = profMap.get(staff_id) ?? null;
        if (!staff_id || !user_id) return { staff_id, role, raw_role, user_id, status: "no_staff", reason: "Staff ID not found" };
        if (!role) return { staff_id, role: null, raw_role, user_id, status: "bad_role", reason: `Unknown role "${raw_role}"` };
        if (existingSet.has(`${user_id}|${role}`)) return { staff_id, role, raw_role, user_id, status: "duplicate", reason: "Already assigned" };
        return { staff_id, role, raw_role, user_id, status: "ready" };
      });
      setPreview(out);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return 0;
      const ready = preview.filter((r) => r.status === "ready" && r.user_id && r.role);
      if (!ready.length) throw new Error("No new assignments to commit");
      const seen = new Set<string>();
      const rows = ready.filter((r) => {
        const k = `${r.user_id}|${r.role}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map((r) => ({ user_id: r.user_id!, role: r.role! }));
      await assertNoDuplicateRoles(rows);
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from("user_roles").insert(batch);
        if (error) throw new Error(friendlyRoleError(error));
        for (const row of batch) {
          await logAdminAudit("user_role", "role.add", { role: row.role, source: "bulk_upload", reversible: true }, row.user_id);
        }
        inserted += batch.length;
      }
      return inserted;
    },
    onSuccess: (n) => {
      toast.success(`${n} role(s) assigned`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-users"] });
      qc.invalidateQueries({ queryKey: ["role-mgmt-audit"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <Alert><AlertDescription>Admin access required.</AlertDescription></Alert>;
  }

  const readyCount = preview?.filter((r) => r.status === "ready").length ?? 0;
  const dupCount = preview?.filter((r) => r.status === "duplicate").length ?? 0;
  const errCount = preview?.filter((r) => r.status === "no_staff" || r.status === "bad_role").length ?? 0;

  // Roles available to add for a user (exclude already assigned)
  const addableRoles = editing ? KNOWN_ROLES.filter((r) => !editing.roles.includes(r)) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-secondary">Role &amp; Department Management</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Self-approve mode: changes apply immediately. Every change is recorded in the <b>Audit Trail</b> and can be reverted.
        </AlertDescription>
      </Alert>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Users</TabsTrigger>
          <TabsTrigger value="bulk"><Upload className="h-4 w-4 mr-1" /> Bulk</TabsTrigger>
          <TabsTrigger value="assignments"><FileSpreadsheet className="h-4 w-4 mr-1" /> Assignments</TabsTrigger>
          <TabsTrigger value="audit"><History className="h-4 w-4 mr-1" /> Audit Trail</TabsTrigger>
        </TabsList>

        {/* ---------------- USERS ---------------- */}
        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Users ({filteredUsers.length} of {users.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-md">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, staff ID, role, department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              {loadingUsers ? (
                <div className="text-center py-6 text-muted-foreground">Loading…</div>
              ) : (
                <div className="rounded border max-h-[600px] overflow-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead className="w-20">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersPage.pageItems.map((u: any) => (
                        <TableRow key={u.user_id}>
                          <TableCell className="font-mono text-xs">{u.staff_id ?? "—"}</TableCell>
                          <TableCell className="text-sm">{u.last_name}, {u.first_name}</TableCell>
                          <TableCell className="text-xs">{deptName(u.department_id)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                              {u.roles.map((r: AppRole) => (
                                <Badge key={r} variant="secondary" className="text-[10px]">{labelFor(r)}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing({
                                  user_id: u.user_id,
                                  staff_id: u.staff_id ?? "",
                                  name: `${u.last_name}, ${u.first_name}`,
                                  department_id: u.department_id,
                                  roles: u.roles,
                                });
                                setEditingDept(u.department_id ?? "none");
                                setAddingRole("");
                              }}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!loadingUsers && (
                <ListPagination {...usersPage} label="users" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- BULK ---------------- */}
        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Bulk Upload Roles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Upload a CSV or Excel file with columns <code>staff_id</code> and <code>role</code>.
                Duplicates are skipped automatically. Recognised roles: {KNOWN_ROLES.length}.
              </p>
              <div className="flex gap-2 items-center flex-wrap">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  disabled={parsing}
                  className="max-w-md"
                />
                {preview && <Button onClick={() => setPreview(null)} variant="outline" size="sm">Clear</Button>}
              </div>

              {preview && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800">Ready: {readyCount}</Badge>
                    <Badge className="bg-amber-100 text-amber-800">Duplicate (skip): {dupCount}</Badge>
                    <Badge variant="destructive">Errors: {errCount}</Badge>
                  </div>
                  <div className="rounded border max-h-80 overflow-auto">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff ID</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.slice(0, 200).map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.staff_id || "—"}</TableCell>
                            <TableCell className="text-xs">{r.raw_role}</TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  r.status === "ready" ? "bg-emerald-100 text-emerald-800" :
                                  r.status === "duplicate" ? "bg-amber-100 text-amber-800" :
                                  "bg-red-100 text-red-800"
                                }
                              >
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.reason ?? "OK"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button onClick={() => commit.mutate()} disabled={commit.isPending || readyCount === 0} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Commit {readyCount} new assignment(s)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- ASSIGNMENTS ---------------- */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4" /> Current Assignments ({filteredAssignments.length} of {existingAssignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Add a new assignment: pick staff + pick role */}
              <div className="rounded border p-3 space-y-2 bg-muted/30">
                <Label className="text-xs font-semibold">Assign a role</Label>
                <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <StaffCombobox staff={staffOptions} value={newStaff} onValueChange={setNewStaff} placeholder="Type to search staff…" compact />
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger className="h-9" aria-label="Role to assign"><SelectValue placeholder="Pick a role" /></SelectTrigger>
                    <SelectContent>
                      {KNOWN_ROLES.map((r) => <SelectItem key={r} value={r}>{labelFor(r)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm" className="h-9 gap-1"
                    disabled={!newStaff || !newRole || addRole.isPending}
                    onClick={() => {
                      const u = users.find((x: any) => x.user_id === newStaff);
                      if (u?.roles.includes(newRole as AppRole)) {
                        toast.error(`${u.staff_id} already has the ${labelFor(newRole as string)} role.`);
                        return;
                      }
                      addRole.mutate({ user_id: newStaff, role: newRole as AppRole }, {
                        onSuccess: () => { setNewRole(""); },
                      });
                    }}
                  >
                    <Plus className="h-4 w-4" /> Assign
                  </Button>
                </div>
              </div>

              {/* Search & filters */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search staff ID, name, role…" value={aSearch} onChange={(e) => setASearch(e.target.value)} className="pl-8 h-9" aria-label="Search assignments" />
                </div>
                <StaffCombobox staff={staffOptions} value={aStaff} onValueChange={setAStaff} includeAllOption allOptionLabel="All staff" placeholder="Pick staff" compact />
                <Select value={aRole} onValueChange={setARole}>
                  <SelectTrigger className="h-9" aria-label="Filter by role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {KNOWN_ROLES.map((r) => <SelectItem key={r} value={r}>{labelFor(r)} ({counts[r] ?? 0})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={aDept} onValueChange={setADept}>
                  <SelectTrigger className="h-9" aria-label="Filter by department"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    <SelectItem value="none">No department</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(counts).map(([role, n]) => (
                  <Badge
                    key={role} variant={aRole === role ? "default" : "outline"} className="cursor-pointer"
                    onClick={() => setARole(aRole === role ? "all" : role)}
                  >{labelFor(role)}: {n}</Badge>
                ))}
              </div>

              {selectedVisible.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-sm">
                  <span>{selectedVisible.length} selected</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                  <Button
                    size="sm" variant="destructive" className="gap-1" disabled={removeMany.isPending}
                    onClick={() => askConfirm({
                      title: `Remove ${selectedVisible.length} role assignment(s)?`,
                      message: "Each removal is recorded in the audit trail and can be reverted.",
                      confirmLabel: "Remove", destructive: true,
                      onConfirm: () => removeMany.mutate(selectedVisible),
                    })}
                  ><Trash2 className="h-3.5 w-3.5" /> Remove selected</Button>
                </div>
              )}

              <div className="rounded border max-h-[500px] overflow-auto">
                <Table className="min-w-[700px]">
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Select all on this page"
                          checked={allPageSelected}
                          onCheckedChange={(v) => setSelected((s) => {
                            const n = new Set(s); pageIds.forEach((id) => (v ? n.add(id) : n.delete(id))); return n;
                          })}
                        />
                      </TableHead>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-12">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignPage.pageItems.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No assignments match.</TableCell></TableRow>
                    )}
                    {assignPage.pageItems.map((r: any) => (
                      <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox aria-label={`Select ${r.profile?.staff_id ?? "row"}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggleSel(r.id, !!v)} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.profile?.staff_id ?? "—"}</TableCell>
                        <TableCell>{r.profile ? `${r.profile.last_name}, ${r.profile.first_name}` : "—"}</TableCell>
                        <TableCell className="text-xs">{deptName(r.profile?.department_id)}</TableCell>
                        <TableCell><Badge variant="secondary">{labelFor(r.role)}</Badge></TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Remove role"
                            onClick={() => {
                              askConfirm({
                                title: "Remove role?",
                                message: `Remove "${labelFor(r.role)}" from ${r.profile?.staff_id ?? "this user"}? This will be recorded in the audit trail and is reversible.`,
                                confirmLabel: "Remove",
                                destructive: true,
                                onConfirm: () => remove.mutate(r.id),
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ListPagination {...assignPage} label="assignments" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- AUDIT ---------------- */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Recent Changes (last 100)
              </CardTitle>
              <Button
                size="sm" variant="outline" className="gap-1"
                disabled={auditTrail.length === 0}
                onClick={() => exportAuditCsv(auditTrail)}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loadingAudit ? (
                <div className="text-center py-6 text-muted-foreground">Loading…</div>
              ) : auditTrail.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">No changes recorded yet.</div>
              ) : (
                <div className="rounded border max-h-[600px] overflow-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead className="w-24">Revert</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditPage.pageItems.map((e: any) => {
                        const reverted = e.details?.reverted_from;
                        const reversible =
                          (e.action === "role.add" || e.action === "role.remove" || e.action === "department.change")
                          && !reverted;
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDateTime(e.created_at)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {e.actor ? `${e.actor.last_name}, ${e.actor.first_name}` : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">{e.action}</Badge>
                              {reverted && <Badge variant="outline" className="ml-1 text-[10px]">reverted</Badge>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {e.target ? `${e.target.staff_id} — ${e.target.last_name}, ${e.target.first_name}` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.action === "department.change"
                                ? `${e.details?.from_name ?? "—"} → ${e.details?.to_name ?? "—"}`
                                : e.details?.role
                                  ? labelFor(e.details.role)
                                  : "—"}
                            </TableCell>
                            <TableCell>
                              {reversible && (
                                <Button
                                  size="sm" variant="outline" className="gap-1 h-7"
                                  disabled={revert.isPending}
                                  onClick={() => {
                                    askConfirm({
                                      title: "Revert this change?",
                                      message: `Undo "${e.action}"${e.target ? ` for ${e.target.staff_id} (${e.target.last_name}, ${e.target.first_name})` : ""}? This action will itself be audited.`,
                                      confirmLabel: "Revert",
                                      onConfirm: () => revert.mutate(e),
                                    });
                                  }}
                                >
                                  <Undo2 className="h-3 w-3" /> Revert
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!loadingAudit && auditTrail.length > 0 && (
                <ListPagination {...auditPage} label="changes" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------------- EDIT DIALOG ---------------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Edit {editing?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editing?.staff_id} — changes are applied immediately and audited.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              {/* Department */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Building2 className="h-4 w-4" /> Department
                </Label>
                <div className="flex gap-2">
                  <Select value={editingDept} onValueChange={setEditingDept}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={
                      changeDepartment.isPending ||
                      (editingDept === "none" ? null : editingDept) === editing.department_id
                    }
                    onClick={() => {
                      const to = editingDept === "none" ? null : editingDept;
                      askConfirm({
                        title: "Change department?",
                        message: `Move ${editing.name} from "${deptName(editing.department_id)}" to "${deptName(to)}"? This will be recorded in the audit trail and is reversible.`,
                        confirmLabel: "Change",
                        onConfirm: () => changeDepartment.mutate(
                          { user_id: editing.user_id, from: editing.department_id, to },
                          { onSuccess: () => setEditing(null) }
                        ),
                      });
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Roles */}
              <div className="space-y-2">
                <Label className="text-sm">Current Roles</Label>
                <div className="flex flex-wrap gap-1.5">
                  {editing.roles.length === 0 && (
                    <span className="text-xs text-muted-foreground">No roles assigned.</span>
                  )}
                  {editing.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="gap-1">
                      {labelFor(r)}
                      <button
                        type="button"
                        className="hover:text-destructive"
                        disabled={removeRoleByUser.isPending}
                        onClick={() => {
                          askConfirm({
                            title: "Remove role?",
                            message: `Remove "${labelFor(r)}" from ${editing.name}? This will be recorded in the audit trail and is reversible.`,
                            confirmLabel: "Remove",
                            destructive: true,
                            onConfirm: () => removeRoleByUser.mutate(
                              { user_id: editing.user_id, role: r },
                              { onSuccess: () => setEditing((prev) => prev ? { ...prev, roles: prev.roles.filter((x) => x !== r) } : prev) }
                            ),
                          });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Add role */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1 text-sm">
                  <Plus className="h-4 w-4" /> Add Role
                </Label>
                <div className="flex gap-2">
                  <Select value={addingRole} onValueChange={(v) => setAddingRole(v as AppRole)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select role to add" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableRoles.map((r) => (
                        <SelectItem key={r} value={r}>{labelFor(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!addingRole || addRole.isPending}
                    onClick={() => {
                      if (!addingRole) return;
                      const newRole = addingRole as AppRole;
                      askConfirm({
                        title: "Add role?",
                        message: `Grant "${labelFor(newRole)}" to ${editing.name}? This will be recorded in the audit trail and is reversible.`,
                        confirmLabel: "Add",
                        onConfirm: () => addRole.mutate(
                          { user_id: editing.user_id, role: newRole },
                          {
                            onSuccess: () => {
                              setEditing((prev) => prev ? { ...prev, roles: [...prev.roles, newRole] } : prev);
                              setAddingRole("");
                            },
                          }
                        ),
                      });
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- CONFIRM DIALOG ---------------- */}
      <AlertDialog open={!!confirmState} onOpenChange={(o) => !o && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmState?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                const fn = confirmState?.onConfirm;
                setConfirmState(null);
                fn?.();
              }}
            >
              {confirmState?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
