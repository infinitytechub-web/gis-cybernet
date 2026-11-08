import { useMemo, useState } from "react";
import { formatDate } from "@/lib/date-format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePagedList } from "@/hooks/usePagedList";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { Constants } from "@/integrations/supabase/types";
import { filterQuickUsers, type QuickUserRow } from "@/lib/quick-user-search";
import { allowedBaseRoles } from "@/lib/custom-roles";

type CustomRole = { id: string; name: string; description: string | null; base_role: string; org_unit_id: string | null; is_active: boolean };
const pretty = (s: string) => s.replace(/_/g, " ");
const GLOBAL = "__global";
const empty = { id: null as string | null, name: "", description: "", base_role: "staff", org_unit_id: GLOBAL, is_active: true };

/** Create, edit, retire and assign custom roles. Each custom role carries the permissions of one existing system role. */
export function CustomRolesManager() {
  const { isAdmin, canManageCustomRoles } = useAuth();
  const canManage = canManageCustomRoles;
  const qc = useQueryClient();
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const roles = useQuery({ queryKey: ["custom-roles"], queryFn: async () => {
    const { data, error } = await supabase.from("custom_roles").select("id,name,description,base_role,org_unit_id,is_active").order("name");
    if (error) throw error; return (data ?? []) as CustomRole[];
  } });
  const counts = useQuery({ queryKey: ["custom-role-counts"], queryFn: async () => {
    const { data, error } = await supabase.from("custom_role_assignments").select("custom_role_id");
    if (error) throw error;
    const m: Record<string, number> = {}; (data ?? []).forEach(r => { m[r.custom_role_id] = (m[r.custom_role_id] ?? 0) + 1; }); return m;
  } });
  const units = useQuery({ queryKey: ["custom-role-units"], queryFn: async () => (await supabase.from("org_units").select("id,name").eq("is_active", true).order("name")).data ?? [] });
  const unitName = (id: string | null) => id ? units.data?.find(u => u.id === id)?.name ?? "Command" : "All commands";
  const baseRoles = allowedBaseRoles(Constants.public.Enums.app_role as readonly string[], isAdmin);
  const pager = usePagedList(roles.data ?? []);
  const [viewing, setViewing] = useState<CustomRole | null>(null);
  const refresh = () => ["custom-roles", "custom-role-counts", "staff-tier-summary", "custom-role-holders"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("save_custom_role", { _id: draft.id, _name: draft.name, _description: draft.description, _base_role: draft.base_role as never, _org_unit_id: draft.org_unit_id === GLOBAL ? null : draft.org_unit_id, _active: draft.is_active });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(draft.id ? "Role updated" : "Role created"); setDraft(empty); refresh();
  };

  const remove = async (r: CustomRole) => {
    const reason = window.prompt(`Delete the role "${r.name}"? Enter a reason:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("delete_custom_role", { _id: r.id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Role deleted"); if (viewing?.id === r.id) setViewing(null); refresh();
  };

  if (!canManage) return <p className="text-sm text-muted-foreground">Only Super Admins, OIC, 2IC and Chief Staff Officers can create roles.</p>;
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="text-base">{draft.id ? "Edit role" : "Create a new role"}</CardTitle>
      <CardDescription>Each role gives officers the access of the permission level you choose.{!isAdmin && " Command staff create roles for their own command."}</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div><Label htmlFor="cr-name">Role name</Label><Input id="cr-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Records Clerk" /></div>
        <div><Label htmlFor="cr-desc">Description</Label><Input id="cr-desc" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
        <div><Label>Permission level</Label><Select value={draft.base_role} onValueChange={v => setDraft({ ...draft, base_role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{baseRoles.map(r => <SelectItem key={r} value={r} className="capitalize">{pretty(r)}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Command</Label><Select value={draft.org_unit_id} onValueChange={v => setDraft({ ...draft, org_unit_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{isAdmin && <SelectItem value={GLOBAL}>All commands</SelectItem>}{units.data?.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button onClick={save} disabled={busy || !draft.name.trim() || (!isAdmin && draft.org_unit_id === GLOBAL)}>{draft.id ? <Save className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}{draft.id ? "Update role" : "Create role"}</Button>
          {draft.id && <Button variant="outline" onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}>{draft.is_active ? "Mark retired" : "Reactivate"}</Button>}
          {draft.id && <Button variant="ghost" onClick={() => setDraft(empty)}>Cancel</Button>}
        </div>
      </CardContent></Card>
    {roles.error && <p className="text-sm text-destructive">Could not load roles.</p>}
    <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Permission level</TableHead><TableHead>Command</TableHead><TableHead>Officers</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{pager.pageItems.map(r => <TableRow key={r.id}><TableCell><div className="font-medium">{r.name}</div>{r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}</TableCell>
        <TableCell className="capitalize">{pretty(r.base_role)}</TableCell><TableCell>{unitName(r.org_unit_id)}</TableCell><TableCell>{counts.data?.[r.id] ?? 0}</TableCell>
        <TableCell><Badge variant={r.is_active ? "secondary" : "outline"}>{r.is_active ? "Active" : "Retired"}</Badge></TableCell>
        <TableCell><Button size="sm" variant="ghost" onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? "", base_role: r.base_role, org_unit_id: r.org_unit_id ?? GLOBAL, is_active: r.is_active })}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setViewing(r)}><Users className="mr-1 h-4 w-4" aria-hidden />Officers</Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={(counts.data?.[r.id] ?? 0) > 0} title={(counts.data?.[r.id] ?? 0) > 0 ? "Remove all officers first" : "Delete role"} onClick={() => remove(r)}><Trash2 className="h-4 w-4" aria-label="Delete role" /></Button></TableCell></TableRow>)}
        {!roles.isLoading && !roles.data?.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No custom roles yet.</TableCell></TableRow>}</TableBody></Table></div>
    <ListPagination {...pager} label="roles" />
    {viewing && <RoleHolders role={viewing} onClose={() => setViewing(null)} onDone={refresh} />}
    <AssignCustomRole roles={(roles.data ?? []).filter(r => r.is_active)} onDone={refresh} />
  </div>;
}

function AssignCustomRole({ roles, onDone }: { roles: CustomRole[]; onDone: () => void }) {
  const [q, setQ] = useState(""); const [picked, setPicked] = useState<QuickUserRow | null>(null);
  const [role, setRole] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const staff = useQuery({ queryKey: ["quick-user-search-rows"], queryFn: async () => { const { data, error } = await supabase.rpc("staff_directory_rows"); if (error) throw error; return (data ?? []) as QuickUserRow[]; } });
  const results = useMemo(() => filterQuickUsers(staff.data ?? [], q).slice(0, 10), [staff.data, q]);
  const run = async (remove: boolean) => {
    if (!picked || !role) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_custom_role", { _custom_role_id: role, _profile_id: picked.id, _remove: remove, _reason: reason });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(remove ? "Role removed" : "Role assigned"); setReason(""); onDone();
  };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" aria-hidden />Assign a custom role</CardTitle></CardHeader>
    <CardContent className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="cr-officer">Officer</Label><Input id="cr-officer" value={q} onChange={e => setQ(e.target.value)} placeholder="Type name, staff ID, rank or unit" />
        <ul className="max-h-56 space-y-1 overflow-y-auto">{results.map(r => <li key={r.id}><button type="button" onClick={() => setPicked(r)} className={`w-full rounded-md border px-3 py-2 text-left text-sm ${picked?.id === r.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>{r.first_name} {r.last_name} <span className="text-muted-foreground">· {r.unit ?? "No unit"}</span></button></li>)}</ul></div>
      <div className="space-y-3">
        <div><Label>Role</Label><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger><SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="cr-reason">Reason</Label><Input id="cr-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></div>
        <div className="flex gap-2"><Button onClick={() => run(false)} disabled={busy || !picked || !role || !reason.trim()}>Assign</Button><Button variant="outline" onClick={() => run(true)} disabled={busy || !picked || !role || !reason.trim()}>Remove</Button></div>
      </div>
    </CardContent></Card>;
}


function RoleHolders({ role, onClose, onDone }: { role: CustomRole; onClose: () => void; onDone: () => void }) {
  const holders = useQuery({ queryKey: ["custom-role-holders", role.id], queryFn: async () => {
    const { data, error } = await supabase.from("custom_role_assignments").select("id, created_at, profile:profiles(id, first_name, last_name, staff_id, rank:ranks(name))").eq("custom_role_id", role.id).order("created_at");
    if (error) throw error; return (data ?? []) as unknown as { id: string; created_at: string; profile: { id: string; first_name: string | null; last_name: string | null; staff_id: string | null; rank: { name: string } | null } | null }[];
  } });
  const pager = usePagedList(holders.data ?? []);
  const unassign = async (profileId: string, name: string) => {
    const reason = window.prompt(`Remove "${role.name}" from ${name}? Enter a reason:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("assign_custom_role", { _custom_role_id: role.id, _profile_id: profileId, _remove: true, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Role removed"); holders.refetch(); onDone();
  };
  return <Card><CardHeader className="flex flex-row items-center justify-between gap-2"><div><CardTitle className="text-base">Officers with “{role.name}”</CardTitle>
    <CardDescription>Removing the role also removes the access it gave, unless the officer has that access from another role.</CardDescription></div>
    <Button size="sm" variant="ghost" onClick={onClose}>Close</Button></CardHeader>
    <CardContent>
      {holders.error && <p className="text-sm text-destructive">Could not load officers.</p>}
      <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Staff ID</TableHead><TableHead>Rank</TableHead><TableHead>Assigned</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{pager.pageItems.map(h => { const n = `${h.profile?.first_name ?? ""} ${h.profile?.last_name ?? ""}`.trim() || "Officer"; return <TableRow key={h.id}>
          <TableCell className="font-medium">{n}</TableCell><TableCell>{h.profile?.staff_id ?? "—"}</TableCell><TableCell>{h.profile?.rank?.name ?? "—"}</TableCell>
          <TableCell>{formatDate(h.created_at)}</TableCell>
          <TableCell>{h.profile && <Button size="sm" variant="outline" onClick={() => unassign(h.profile!.id, n)}>Remove</Button>}</TableCell></TableRow>; })}
          {!holders.isLoading && !holders.data?.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No officers hold this role.</TableCell></TableRow>}</TableBody></Table></div>
      <ListPagination {...pager} label="officers" />
    </CardContent></Card>;
}
