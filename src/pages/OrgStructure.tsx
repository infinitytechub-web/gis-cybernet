import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgScope } from "@/hooks/useOrgScope";
import { OrgPositionsAdmin } from "@/components/org/OrgPositionsAdmin";
import {
  ORG_UNIT_TYPES,
  ORG_UNIT_TYPE_LABELS,
  flattenOrgTree,
  orgUnitPath,
  type OrgUnitType,
} from "@/lib/org-hierarchy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Network, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

interface StaffRow {
  id: string;
  user_id: string | null;
  staff_id: string | null;
  first_name: string;
  last_name: string;
  org_unit_id: string | null;
}

const emptyForm = {
  id: "",
  name: "",
  code: "",
  type: "unit" as OrgUnitType,
  parent_id: "" as string,
  is_active: true,
};

export default function OrgStructure() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { units, tree, scope, loading } = useOrgScope();

  const [form, setForm] = useState(emptyForm);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignCanManage, setAssignCanManage] = useState(false);

  const rows = useMemo(() => flattenOrgTree(tree), [tree]);

  const staffQuery = useQuery({
    queryKey: ["org-structure", "staff"],
    staleTime: 60_000,
    queryFn: async (): Promise<StaffRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, staff_id, first_name, last_name, org_unit_id")
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["org-structure", "assignments"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_unit_assignments")
        .select("id, user_id, org_unit_id, can_manage, expires_at, revoked_at")
        .is("revoked_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffByUserId = useMemo(
    () => new Map((staffQuery.data ?? []).map((s) => [s.user_id ?? "", s])),
    [staffQuery.data],
  );

  const headcount = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of staffQuery.data ?? []) {
      if (!s.org_unit_id) continue;
      map.set(s.org_unit_id, (map.get(s.org_unit_id) ?? 0) + 1);
    }
    return map;
  }, [staffQuery.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["org-units"] });
    queryClient.invalidateQueries({ queryKey: ["org-structure"] });
    queryClient.invalidateQueries({ queryKey: ["org-scope"] });
  };

  const saveUnit = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        parent_id: form.parent_id || null,
        is_active: form.is_active,
      };
      if (!payload.name || !payload.code) throw new Error("Name and code are required");
      if (form.id) {
        const { error } = await supabase.from("org_units").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("org_units").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Command updated" : "Command created");
      setUnitDialogOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(e.message || "You do not have authority over this branch"),
  });

  const deleteUnit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Command removed");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(e.message || "Remove the child commands and postings first"),
  });

  const assignStaff = useMutation({
    mutationFn: async () => {
      const staff = (staffQuery.data ?? []).find((s) => s.id === assignStaffId);
      if (!staff?.user_id) throw new Error("Select a staff member with an account");
      if (!assignTarget) throw new Error("No command selected");
      const { error } = await supabase.from("org_unit_assignments").upsert(
        {
          user_id: staff.user_id,
          org_unit_id: assignTarget,
          can_manage: assignCanManage,
          revoked_at: null,
        },
        { onConflict: "user_id,org_unit_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oversight assigned");
      setAssignTarget(null);
      setAssignStaffId("");
      setAssignCanManage(false);
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(e.message || "You do not have authority over this branch"),
  });

  const revokeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("org_unit_assignments")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oversight revoked");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Not permitted"),
  });

  const openCreate = (parentId?: string) => {
    const parent = units.find((u) => u.id === parentId);
    const nextType: OrgUnitType = parent
      ? ORG_UNIT_TYPES[
          Math.min(ORG_UNIT_TYPES.indexOf(parent.type) + 1, ORG_UNIT_TYPES.length - 1)
        ]
      : "regional";
    setForm({ ...emptyForm, parent_id: parentId ?? "", type: nextType });
    setUnitDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const u = units.find((x) => x.id === id);
    if (!u) return;
    setForm({
      id: u.id,
      name: u.name,
      code: u.code,
      type: u.type,
      parent_id: u.parent_id ?? "",
      is_active: u.is_active,
    });
    setUnitDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Network className="h-6 w-6 text-primary" aria-hidden="true" />
            Command Structure
          </h1>
          <p className="text-sm text-muted-foreground">
            Regional Commands down to Units. Access to staff records and command
            data follows this tree: Every level sees itself and everything below
            it, and nothing above or beside it.
          </p>
        </div>
        {scope.isAdmin && (
          <Button onClick={() => openCreate()}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New command
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden="true" /> Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Command</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Staff posted</TableHead>
                  <TableHead>Your authority</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Loading hierarchy…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No commands defined yet.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((node) => {
                  const inScope = scope.hasAccess(node.id);
                  const canManage = scope.canManage(node.id);
                  return (
                    <TableRow key={node.id} className={inScope ? "" : "opacity-60"}>
                      <TableCell>
                        <span style={{ paddingLeft: `${node.depth * 16}px` }} className="font-medium">
                          {node.depth > 0 && <span aria-hidden="true" className="text-muted-foreground">└ </span>}
                          {node.name}
                        </span>
                        {!node.is_active && (
                          <Badge variant="outline" className="ml-2">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>{ORG_UNIT_TYPE_LABELS[node.type]}</TableCell>
                      <TableCell className="font-mono text-xs">{node.code}</TableCell>
                      <TableCell>{headcount.get(node.id) ?? 0}</TableCell>
                      <TableCell>
                        {canManage ? (
                          <Badge>Manage</Badge>
                        ) : inScope ? (
                          <Badge variant="secondary">View</Badge>
                        ) : (
                          <Badge variant="outline">None</Badge>
                        )}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          onClick={() => setAssignTarget(node.id)}
                        >
                          <UserPlus className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Assign oversight</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          onClick={() => openCreate(node.id)}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Add child command</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          onClick={() => openEdit(node.id)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Edit command</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManage || node.children.length > 0}
                          onClick={() => deleteUnit.mutate(node.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          <span className="sr-only">Delete command</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden="true" /> Delegated oversight
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Authority</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(assignmentsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No delegated oversight in your scope.
                  </TableCell>
                </TableRow>
              )}
              {(assignmentsQuery.data ?? []).map((a) => {
                const staff = staffByUserId.get(a.user_id);
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      {staff ? `${staff.first_name} ${staff.last_name}` : "—"}
                      {staff?.staff_id && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {staff.staff_id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{orgUnitPath(units, a.org_unit_id)}</TableCell>
                    <TableCell>
                      {a.can_manage ? <Badge>Manage branch</Badge> : <Badge variant="secondary">View branch</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!scope.canManage(a.org_unit_id)}
                        onClick={() => revokeAssignment.mutate(a.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Appointments register: who holds which position, and what is vacant. */}
      <OrgPositionsAdmin />




      {/* Create / edit command */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit command" : "New command"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tema Sector Command"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-code">Code</Label>
              <Input
                id="org-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. GAR-TEM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-type">Level</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as OrgUnitType }))}
              >
                <SelectTrigger id="org-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_UNIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ORG_UNIT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-parent">Reports to</Label>
              <Select
                value={form.parent_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger id="org-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Top level —</SelectItem>
                  {rows
                    .filter((r) => r.id !== form.id)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {"— ".repeat(r.depth)}
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="org-active">Active</Label>
              <Switch
                id="org-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveUnit.mutate()} disabled={saveUnit.isPending}>
              {saveUnit.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign oversight */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign oversight</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {assignTarget ? orgUnitPath(units, assignTarget) : ""}
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assign-staff">Staff member</Label>
              <Select value={assignStaffId} onValueChange={setAssignStaffId}>
                <SelectTrigger id="assign-staff">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {(staffQuery.data ?? [])
                    .filter((s) => s.user_id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} {s.staff_id ? `(${s.staff_id})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="assign-manage">Manage this branch</Label>
                <p className="text-xs text-muted-foreground">
                  Allows creating, editing and delegating commands below this level.
                </p>
              </div>
              <Switch
                id="assign-manage"
                checked={assignCanManage}
                onCheckedChange={setAssignCanManage}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => assignStaff.mutate()} disabled={assignStaff.isPending}>
              {assignStaff.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Signed in as {role ?? "unknown role"}. Buttons are disabled where you have
        no authority; the database rejects the same actions independently.
      </p>
    </div>
  );
}
