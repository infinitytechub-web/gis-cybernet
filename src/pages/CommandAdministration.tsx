import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Search, ShieldCheck, Trash2, Building2, History } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

const COMMAND_APPOINTMENTS: AppRole[] = ["oic", "2ic", "staff_officer", "supervisor", "command_officer"];

type Commander = {
  profile_id: string;
  staff_id: string | null;
  name: string;
  role: string;
  status: string | null;
};

type UnitRow = {
  org_unit_id: string;
  unit_name: string;
  unit_type: string;
  parent_name: string | null;
  authorised_strength: number | null;
  posted: number;
  commanders: Commander[];
};

type Activity = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  subject_name: string | null;
  subject_staff_id: string | null;
  details: Record<string, unknown> | null;
};

type Candidate = {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  command_appointment: "Commander appointed",
  command_appointment_revoked: "Appointment removed",
  command_admin_officer: "Officer updated by commander",
};

export default function CommandAdministration() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [appointOpen, setAppointOpen] = useState(false);
  const [appointUnit, setAppointUnit] = useState<string | null>(null);

  const unitsQuery = useQuery({
    queryKey: ["admin-command-overview"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_command_overview");
      if (error) throw error;
      return ((data ?? []) as unknown as UnitRow[]).map((r) => ({
        ...r,
        commanders: (Array.isArray(r.commanders) ? r.commanders : []) as Commander[],
      }));
    },
  });

  const activityQuery = useQuery({
    queryKey: ["admin-command-panel-activity"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_command_panel_activity", { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as unknown as Activity[];
    },
  });

  const units = unitsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.unit_name.toLowerCase().includes(q) ||
        (u.parent_name ?? "").toLowerCase().includes(q) ||
        u.commanders.some(
          (c) => c.name.toLowerCase().includes(q) || (c.staff_id ?? "").toLowerCase().includes(q),
        ),
    );
  }, [units, search]);

  const allCommanders = useMemo(
    () => units.flatMap((u) => u.commanders.map((c) => ({ ...c, unit: u.unit_name, unitId: u.org_unit_id }))),
    [units],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-command-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-command-panel-activity"] });
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only system administrators can open command administration.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Crown className="h-6 w-6 text-amber-600" /> Command Administration
          </h1>
          <p className="text-sm text-muted-foreground">
            Appoint commanders, review every command and watch what commanders do in their own panel.
          </p>
        </div>
        <Button
          onClick={() => {
            setAppointUnit(null);
            setAppointOpen(true);
          }}
        >
          <ShieldCheck className="mr-2 h-4 w-4" /> Appoint commander
        </Button>
      </div>

      <Tabs defaultValue="commanders">
        <TabsList className="flex-wrap">
          <TabsTrigger value="commanders">Commanders</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="activity">Panel activity</TabsTrigger>
        </TabsList>

        <TabsContent value="commanders" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search commander, staff number or command"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appointed commanders ({allCommanders.length})</CardTitle>
              <CardDescription>Each appointment carries the command the officer is posted to.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {unitsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Officer</th>
                      <th className="py-2">Staff number</th>
                      <th className="py-2">Appointment</th>
                      <th className="py-2">Command</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.flatMap((u) =>
                      u.commanders.map((c) => (
                        <tr key={`${u.org_unit_id}-${c.profile_id}-${c.role}`} className="border-t">
                          <td className="py-2 font-medium">{c.name || "—"}</td>
                          <td className="py-2">{c.staff_id ?? "—"}</td>
                          <td className="py-2">
                            <Badge variant="secondary">{roleLabel(c.role as AppRole)}</Badge>
                          </td>
                          <td className="py-2">{u.unit_name}</td>
                          <td className="py-2 capitalize">{(c.status ?? "").replace(/_/g, " ") || "—"}</td>
                          <td className="py-2 text-right">
                            <RevokeButton
                              profileId={c.profile_id}
                              role={c.role as AppRole}
                              name={c.name}
                              onDone={refresh}
                            />
                          </td>
                        </tr>
                      )),
                    )}
                    {filtered.every((u) => u.commanders.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No commanders appointed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" /> Commands ({units.length})
              </CardTitle>
              <CardDescription>Officers posted against authorised strength, and who commands each one.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Command</th>
                    <th className="py-2">Sits under</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Posted</th>
                    <th className="py-2">Authorised</th>
                    <th className="py-2">Commanders</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.org_unit_id} className="border-t">
                      <td className="py-2 font-medium">{u.unit_name}</td>
                      <td className="py-2">{u.parent_name ?? "—"}</td>
                      <td className="py-2 capitalize">{u.unit_type.replace(/_/g, " ")}</td>
                      <td className="py-2">{u.posted}</td>
                      <td className="py-2">{u.authorised_strength ?? "—"}</td>
                      <td className="py-2">
                        {u.commanders.length === 0 ? (
                          <Badge variant="destructive">None</Badge>
                        ) : (
                          u.commanders.map((c) => `${roleLabel(c.role as AppRole)}: ${c.name}`).join("; ")
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAppointUnit(u.org_unit_id);
                            setAppointOpen(true);
                          }}
                        >
                          Appoint
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Recent command actions
              </CardTitle>
              <CardDescription>Appointments and every change commanders make in the Command Admin Panel.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {activityQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">When</th>
                      <th className="py-2">What</th>
                      <th className="py-2">By</th>
                      <th className="py-2">Officer</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activityQuery.data ?? []).map((a) => (
                      <tr key={a.id} className="border-t">
                        <td className="py-2 whitespace-nowrap">{format(new Date(a.created_at), "dd MMM yyyy HH:mm")}</td>
                        <td className="py-2">{ACTION_LABEL[a.action] ?? a.action}</td>
                        <td className="py-2">{a.actor_name || "—"}</td>
                        <td className="py-2">
                          {a.subject_name || "—"}
                          {a.subject_staff_id ? ` (${a.subject_staff_id})` : ""}
                        </td>
                        <td className="py-2">{String((a.details as { reason?: string } | null)?.reason ?? "—")}</td>
                      </tr>
                    ))}
                    {(activityQuery.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Nothing recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AppointDialog
        open={appointOpen}
        onOpenChange={setAppointOpen}
        units={units}
        presetUnit={appointUnit}
        onDone={refresh}
      />
    </div>
  );
}

function RevokeButton({
  profileId,
  role,
  name,
  onDone,
}: {
  profileId: string;
  role: AppRole;
  name: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_revoke_command_role", {
      _profile_id: profileId,
      _role: role,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Appointment removed");
    setOpen(false);
    setReason("");
    onDone();
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove appointment</DialogTitle>
            <DialogDescription>
              {name} will no longer act as {roleLabel(role)}. Their posting stays as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Textarea id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppointDialog({
  open,
  onOpenChange,
  units,
  presetUnit,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  units: UnitRow[];
  presetUnit: string | null;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [officer, setOfficer] = useState<Candidate | null>(null);
  const [unitId, setUnitId] = useState<string>(presetUnit ?? "");
  const [role, setRole] = useState<AppRole>("oic");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const search = useQuery({
    queryKey: ["admin-appoint-search", query],
    enabled: open && query.trim().length >= 2,
    queryFn: async () => {
      const q = query.trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, status")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,staff_id.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const effectiveUnit = unitId || presetUnit || "";

  const submit = async () => {
    if (!officer || !effectiveUnit || !reason.trim()) {
      toast.error("Choose an officer, a command and give a reason");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_appoint_commander", {
      _profile_id: officer.id,
      _org_unit_id: effectiveUnit,
      _role: role,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Commander appointed");
    setOfficer(null);
    setQuery("");
    setReason("");
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Appoint commander</DialogTitle>
          <DialogDescription>
            Posts the officer to the command and grants the appointment in one step.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appoint-search">Officer</Label>
            <Input
              id="appoint-search"
              placeholder="Search name or staff number"
              value={officer ? `${officer.first_name ?? ""} ${officer.last_name ?? ""}`.trim() : query}
              onChange={(e) => {
                setOfficer(null);
                setQuery(e.target.value);
              }}
            />
            {!officer && query.trim().length >= 2 && (
              <div className="max-h-44 overflow-y-auto rounded border">
                {search.isLoading && <div className="p-2 text-sm text-muted-foreground">Searching…</div>}
                {(search.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setOfficer(c)}
                  >
                    {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()} — {c.staff_id ?? "no staff number"}
                  </button>
                ))}
                {!search.isLoading && (search.data ?? []).length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">No match.</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Command</Label>
            <Select value={effectiveUnit} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a command" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.org_unit_id} value={u.org_unit_id}>
                    {u.unit_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Appointment</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMAND_APPOINTMENTS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appoint-reason">Reason</Label>
            <Textarea id="appoint-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Appoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
