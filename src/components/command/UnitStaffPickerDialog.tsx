/**
 * UNIT STAFF PICKER — pop-up search-and-select over the whole staff directory,
 * available for every Command, Department and Unit.
 *
 * Staff can be found by name, staff ID, rank, department, unit/command or role,
 * and selected one at a time or in bulk. With a selection made, command-tier
 * officers and administrators may post / reassign those staff to another
 * Command / Unit. The server (RLS + profile triggers) stays the enforcement
 * point; the UI simply hides what the caller may not do.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Users, UserPlus, X, ArrowRightLeft } from "lucide-react";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { orgUnitPath, type OrgUnit } from "@/lib/org-hierarchy";
import { roleLabel, ROLE_LABEL } from "@/lib/role-labels";
import { UnitAddStaffDialog } from "@/components/command/UnitAddStaffDialog";

const ROW_LIMIT = 300;

export type DirectoryStaff = {
  id: string;
  user_id: string | null;
  staff_id: string | null;
  first_name: string;
  last_name: string;
  status: string | null;
  rank: string | null;
  department: string | null;
  department_id: string | null;
  org_unit_id: string | null;
  unit_label: string | null;
  sub_unit: string | null;
  role: string | null;
};

function fullName(s: DirectoryStaff) {
  return `${s.rank ? s.rank + " " : ""}${s.first_name} ${s.last_name}`.trim();
}

export function UnitStaffPickerDialog({
  open,
  onOpenChange,
  units,
  selectableUnits,
  defaultOrgUnitId,
  canManage,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All org units (used for path labels). */
  units: OrgUnit[];
  /** Units the signed-in user may post staff to / filter by. */
  selectableUnits: OrgUnit[];
  defaultOrgUnitId: string | null;
  /** Admin or command tier — unlocks the bulk reassignment action. */
  canManage: boolean;
  /** Optional single-select callback (row click). */
  onSelect?: (staff: DirectoryStaff) => void;
}) {
  const qc = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [targetUnit, setTargetUnit] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: staff = [], isLoading, isError } = useQuery({
    queryKey: ["unit-staff-directory"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<DirectoryStaff[]> => {
      // `user_roles` references auth.users (no FK to profiles), so roles are
      // fetched separately — embedding them returns a PostgREST 400.
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, user_id, staff_id, first_name, last_name, status, unit, org_unit_id, department_id, ranks(name, abbreviation), departments(name), org_units(name)",
        )
        .order("last_name")
        .limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as any[];

      const roleByUser = new Map<string, string>();
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      for (const r of (roles ?? []) as any[]) {
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      }

      return rows.map((p) => ({
        id: p.id,
        user_id: p.user_id ?? null,
        staff_id: p.staff_id ?? null,
        first_name: p.first_name,
        last_name: p.last_name,
        status: p.status ?? null,
        rank: p.ranks?.abbreviation ?? p.ranks?.name ?? null,
        department: p.departments?.name ?? null,
        department_id: p.department_id ?? null,
        org_unit_id: p.org_unit_id ?? null,
        unit_label: p.org_units?.name ?? null,
        sub_unit: p.unit ?? null,
        role: p.user_id ? roleByUser.get(p.user_id) ?? null : null,
      }));
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const unitOptions = useMemo(
    () =>
      [...selectableUnits].sort((a, b) =>
        orgUnitPath(units, a.id).localeCompare(orgUnitPath(units, b.id)),
      ),
    [selectableUnits, units],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff
      .filter((s) => {
        if (statusFilter !== "all" && (s.status ?? "") !== statusFilter) return false;
        if (unitFilter !== "all" && s.org_unit_id !== unitFilter) return false;
        if (deptFilter !== "all" && s.department_id !== deptFilter) return false;
        if (roleFilter !== "all" && (s.role ?? "staff") !== roleFilter) return false;
        if (!q) return true;
        return `${s.first_name} ${s.last_name} ${s.staff_id ?? ""} ${s.rank ?? ""} ${s.department ?? ""} ${s.unit_label ?? ""} ${s.sub_unit ?? ""} ${roleLabel(s.role)}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, ROW_LIMIT);
  }, [staff, search, unitFilter, deptFilter, roleFilter, statusFilter]);

  const bulk = useBulkSelection(filtered);

  const reassign = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("You are not authorised to reassign staff postings");
      if (!targetUnit) throw new Error("Choose the Command / Unit to post the selected staff to");
      const ids = bulk.selectedIds;
      if (ids.length === 0) throw new Error("Select at least one staff member");
      const { error } = await supabase
        .from("profiles")
        .update({ org_unit_id: targetUnit })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} staff member${n === 1 ? "" : "s"} posted to ${orgUnitPath(units, targetUnit)}`);
      bulk.clear();
      qc.invalidateQueries({ queryKey: ["unit-staff-directory"] });
      qc.invalidateQueries({ queryKey: ["unit-dashboard"] });
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["org-units"] });
    },
    onError: (e: any) => toast.error(e.message || "Reassignment failed"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" aria-hidden="true" /> Find staff
            </DialogTitle>
            <DialogDescription>
              Search every Command, Department and Unit by name, staff ID, rank, department, unit or role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                autoFocus
                className="pl-9"
                aria-label="Search staff"
                placeholder="Search name, staff ID, rank, department, unit or role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div>
                <Label htmlFor="picker-unit" className="text-xs text-muted-foreground">Command / Unit</Label>
                <Select value={unitFilter} onValueChange={setUnitFilter}>
                  <SelectTrigger id="picker-unit" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All units</SelectItem>
                    {unitOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{orgUnitPath(units, u.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="picker-dept" className="text-xs text-muted-foreground">Department</Label>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger id="picker-dept" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {(departments as any[]).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="picker-role" className="text-xs text-muted-foreground">Role</Label>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger id="picker-role" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {Object.keys(ROLE_LABEL).map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="picker-status" className="text-xs text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="picker-status" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="study_leave">Study leave</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="picker-select-all"
                  aria-label="Select all visible staff"
                  checked={bulk.allVisibleSelected}
                  onCheckedChange={() => bulk.toggleAllVisible()}
                />
                <Label htmlFor="picker-select-all" className="text-xs text-muted-foreground">
                  Select all visible ({filtered.length})
                </Label>
              </div>
              {canManage && (
                <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Add staff
                </Button>
              )}
            </div>

            <div className="relative">
              <div
                ref={listRef}
                role="listbox"
                aria-multiselectable="true"
                aria-label="Staff search results"
                className="max-h-[42vh] divide-y overflow-y-auto rounded-md border"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading staff directory…
                  </div>
                ) : isError ? (
                  <div className="p-4 text-center text-sm text-destructive" role="status">
                    Staff directory could not be loaded. Please try again.
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground" role="status">
                    No staff match this search.
                  </div>
                ) : (
                  filtered.map((s) => (
                    <div
                      key={s.id}
                      role="option"
                      aria-selected={bulk.isSelected(s.id)}
                      className={`flex items-center gap-3 px-3 py-2 text-sm ${bulk.isSelected(s.id) ? "bg-accent" : "hover:bg-accent/60"}`}
                    >
                      <Checkbox
                        aria-label={`Select ${fullName(s)}`}
                        checked={bulk.isSelected(s.id)}
                        onCheckedChange={() => bulk.toggle(s.id)}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => (onSelect ? (onSelect(s), onOpenChange(false)) : bulk.toggle(s.id))}
                      >
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {fullName(s)}
                          {s.staff_id && (
                            <span className="font-mono text-xs text-muted-foreground">{s.staff_id}</span>
                          )}
                          {s.status && s.status !== "active" && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {s.status.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[roleLabel(s.role), s.department, s.unit_label ?? "Unposted", s.sub_unit]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>
              <QuickScroll containerRef={listRef} label="staff list" threshold={200} />
            </div>

            {bulk.count > 0 && (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <div className="mb-1 text-xs font-medium">
                    {bulk.count} staff member{bulk.count === 1 ? "" : "s"} selected
                  </div>
                  {canManage ? (
                    <Select value={targetUnit} onValueChange={setTargetUnit}>
                      <SelectTrigger aria-label="Post selected staff to unit" className="h-9">
                        <SelectValue placeholder="Post / reassign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {unitOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{orgUnitPath(units, u.id)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Bulk posting is limited to administrators and command-tier officers.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={bulk.clear}>
                    <X className="mr-2 h-4 w-4" aria-hidden="true" /> Clear
                  </Button>
                  {canManage && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => reassign.mutate()}
                      disabled={reassign.isPending || !targetUnit}
                    >
                      {reassign.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <ArrowRightLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      Post / reassign
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UnitAddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        units={units}
        defaultOrgUnitId={defaultOrgUnitId}
      />
    </>
  );
}

export default UnitStaffPickerDialog;
