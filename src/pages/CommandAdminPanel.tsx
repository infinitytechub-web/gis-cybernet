/**
 * Command Admin Panel — lets a commander run their own command without an
 * administrator signing in.
 *
 * Everything on this page is server-scoped:
 *  - officers come from `my_command_officers()` (own command subtree only)
 *  - postings/shift/status changes go through `command_admin_update_officer`
 *    which re-checks command scope, directory edit rights, and refuses
 *    retirement/interdiction for anyone other than an administrator
 *  - sign-offs come from `signoff_my_queue()`
 *  - leave status comes from `leave_due_overview()`
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileSignature, CalendarOff, Gauge, Loader2, Search, Users, ShieldCheck, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignOffQueue } from "@/components/command/SignOffQueue";
import { LeaveDueWidget } from "@/components/leave/LeaveDueWidget";
import { STAFF_STATUS_LABELS } from "@/lib/staff-status";

interface Officer {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  rank_name: string | null;
  department_name: string | null;
  shift_group: string | null;
  status: string | null;
  org_unit_id: string | null;
  unit_name: string | null;
  is_self: boolean;
}

interface AdminUnit {
  id: string;
  name: string;
  code: string | null;
  unit_type: string | null;
  level: string | null;
}

interface CommandContext {
  org_unit_id: string | null;
  unit_name: string | null;
  scope: string | null;
  can_edit: boolean;
}

const SHIFT_GROUPS = ["A", "B", "C", "D"];
const KEEP = "__keep__";

/** Statuses a commander may set. Retire/interdict stay admin-only server-side. */
const COMMANDER_STATUSES = ["active", "partially_active", "inactive", "study_leave", "transferred"] as const;
const ADMIN_ONLY_STATUSES = ["retired", "interdicted"] as const;

function officerName(o: Officer) {
  return [o.rank_name, o.first_name, o.last_name].filter(Boolean).join(" ") || "Unnamed officer";
}

function statusLabel(status: string | null) {
  if (!status) return "Unknown";
  return (STAFF_STATUS_LABELS as Record<string, string>)[status] ?? status.replace(/_/g, " ");
}

export default function CommandAdminPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Officer | null>(null);

  const { data: context } = useQuery({
    queryKey: ["command-admin-context"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_command_context");
      if (error) throw error;
      return ((data as CommandContext[] | null)?.[0] ?? null) as CommandContext | null;
    },
  });

  const { data: officers = [], isLoading, error } = useQuery({
    queryKey: ["command-admin-officers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_command_officers");
      if (error) throw error;
      return (data ?? []) as Officer[];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ["command-admin-units"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("command_admin_units");
      if (error) throw error;
      return (data ?? []) as AdminUnit[];
    },
  });

  const canEdit = isAdmin || context?.can_edit === true;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return officers;
    return officers.filter((o) =>
      [officerName(o), o.staff_id, o.unit_name, o.department_name, o.shift_group]
        .some((v) => (v ?? "").toLowerCase().includes(term)),
    );
  }, [officers, search]);

  const activeCount = officers.filter((o) => o.status === "active").length;

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-primary/10 p-2">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold text-secondary sm:text-2xl">Command Admin Panel</h1>
          {context?.unit_name && <Badge variant="outline">{context.unit_name}</Badge>}
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {canEdit ? "Can manage officers" : "Read-only"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your own command&apos;s officers, sign-offs and leave status. Retirement and interdiction
          remain with administrators; every change is recorded with a reason.
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-col sm:inline-flex sm:w-auto sm:flex-row">
          <TabsTrigger value="overview" className="w-full gap-1.5 sm:w-auto">
            <Gauge className="h-4 w-4" aria-hidden="true" /> Overview
          </TabsTrigger>
          <TabsTrigger value="officers" className="w-full gap-1.5 sm:w-auto">
            <Users className="h-4 w-4" aria-hidden="true" /> Officers
          </TabsTrigger>
          <TabsTrigger value="signoffs" className="w-full gap-1.5 sm:w-auto">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Sign-offs
          </TabsTrigger>
          <TabsTrigger value="leave" className="w-full gap-1.5 sm:w-auto">
            <CalendarOff className="h-4 w-4" aria-hidden="true" /> Leave status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="officers" className="mt-4">
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Command officers</CardTitle>
                <Badge variant="secondary">{activeCount} active of {officers.length}</Badge>
              </div>
              <CardDescription>Officers posted inside your command and its sub-units.</CardDescription>
              <div className="relative pt-2">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, staff number, unit or shift"
                  className="pl-8"
                  aria-label="Search officers"
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading officers…
                </div>
              ) : error ? (
                <p className="py-6 text-sm text-destructive">Could not load your command&apos;s officers.</p>
              ) : rows.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No officers match your search.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Officer</TableHead>
                        <TableHead>Staff number</TableHead>
                        <TableHead>Posted to</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Manage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">
                            {officerName(o)}
                            {o.is_self && <Badge variant="outline" className="ml-2 text-[10px]">You</Badge>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{o.staff_id ?? "—"}</TableCell>
                          <TableCell>{o.unit_name ?? "Unposted"}</TableCell>
                          <TableCell>{o.shift_group ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={o.status === "active" ? "secondary" : "outline"}>
                              {statusLabel(o.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={!canEdit}
                              onClick={() => setEditing(o)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signoffs" className="mt-4">
          <SignOffQueue />
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <LeaveDueWidget unitId={context?.org_unit_id ?? null} />
        </TabsContent>
      </Tabs>

      <OfficerEditDialog
        officer={editing}
        units={units}
        isAdmin={isAdmin}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["command-admin-officers"] });
          qc.invalidateQueries({ queryKey: ["leave-due-overview"] });
        }}
      />
    </div>
  );
}

function OfficerEditDialog({
  officer,
  units,
  isAdmin,
  onClose,
  onSaved,
}: {
  officer: Officer | null;
  units: AdminUnit[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unitId, setUnitId] = useState<string>(KEEP);
  const [shift, setShift] = useState<string>(KEEP);
  const [status, setStatus] = useState<string>(KEEP);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Reset the form whenever a different officer is opened.
  if (officer && openFor !== officer.id) {
    setOpenFor(officer.id);
    setUnitId(KEEP);
    setShift(KEEP);
    setStatus(KEEP);
    setReason("");
  }

  const statuses = isAdmin ? [...COMMANDER_STATUSES, ...ADMIN_ONLY_STATUSES] : COMMANDER_STATUSES;
  const statusChanged = status !== KEEP && status !== officer?.status;
  const nothingChanged = unitId === KEEP && shift === KEEP && status === KEEP;

  async function handleSave() {
    if (!officer) return;
    if (statusChanged && !reason.trim()) {
      toast.error("A reason is required when changing an officer's status");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("command_admin_update_officer", {
      _profile_id: officer.id,
      _org_unit_id: unitId === KEEP ? null : unitId,
      _shift_group: shift === KEEP ? null : shift,
      _status: status === KEEP ? null : status,
      _reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not save the change", { description: error.message });
      return;
    }
    toast.success("Officer updated");
    onSaved();
  }

  return (
    <Dialog open={!!officer} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{officer ? officerName(officer) : "Officer"}</DialogTitle>
          <DialogDescription>
            Change where this officer is posted, their shift group or their status. Leave a field on
            &ldquo;Keep current&rdquo; to leave it untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Posted to</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep current ({officer?.unit_name ?? "unposted"})</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}{u.code ? ` (${u.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Shift group</Label>
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep current ({officer?.shift_group ?? "none"})</SelectItem>
                {SHIFT_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>Group {g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep current ({statusLabel(officer?.status ?? null)})</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Retirement and interdiction can only be recorded by an administrator.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap-reason">
              Reason {statusChanged && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="cap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this change being made? Stored in the transfer history and audit trail."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || nothingChanged}>
            {saving ? "Saving…" : "Save change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
