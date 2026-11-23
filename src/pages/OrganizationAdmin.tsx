import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Search, Trash2, Users, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePagedList } from "@/hooks/usePagedList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListPagination } from "@/components/ui/list-pagination";
import { CustomRolesManager } from "@/components/hr/CustomRolesManager";
import { ORG_UNIT_TYPES, ORG_UNIT_TYPE_LABELS, type OrgUnitType } from "@/lib/org-hierarchy";

type Unit = { id: string; name: string; code: string; type: OrgUnitType; parent_id: string | null; is_active: boolean };
type Draft = { id?: string; name: string; code: string; type: OrgUnitType; parent_id: string | null; is_active: boolean };
const EMPTY: Draft = { name: "", code: "", type: "station", parent_id: null, is_active: true };

function useUnits() {
  return useQuery({
    queryKey: ["org-admin-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_units").select("id,name,code,type,parent_id,is_active").order("name");
      if (error) throw error;
      return (data ?? []) as Unit[];
    },
  });
}

function UnitsTab() {
  const qc = useQueryClient();
  const units = useUnits();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const byId = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u])), [units.data]);
  const rows = useMemo(() => (units.data ?? []).filter((u) =>
    (type === "all" || u.type === type) && `${u.name} ${u.code}`.toLowerCase().includes(q.toLowerCase())), [units.data, q, type]);
  const paged = usePagedList(rows, { resetKey: `${q}|${type}` });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["org-admin-units"] }); qc.invalidateQueries(); };
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.name.trim() || !d.code.trim()) throw new Error("Name and code are required");
      if (d.id && d.parent_id === d.id) throw new Error("A command cannot be its own parent");
      const payload = { name: d.name.trim(), code: d.code.trim().toUpperCase(), type: d.type, parent_id: d.parent_id, is_active: d.is_active };
      const res = d.id ? await supabase.from("org_units").update(payload).eq("id", d.id) : await supabase.from("org_units").insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => { toast.success("Saved"); setDraft(null); refresh(); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const remove = useMutation({
    mutationFn: async (u: Unit) => {
      if ((units.data ?? []).some((c) => c.parent_id === u.id)) throw new Error("Move or delete its sub-units first");
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("org_unit_id", u.id).is("deleted_at", null);
      if ((count ?? 0) > 0) throw new Error(`${count} staff are still posted here. Move them first, or switch it off instead.`);
      const { error } = await supabase.from("org_units").delete().eq("id", u.id);
      if (error) throw new Error(error.code === "23503" ? "It still has linked records. Switch it off instead." : error.message);
    },
    onSuccess: () => { toast.success("Deleted"); refresh(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Commands & stations ({rows.length})</CardTitle>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search commands" className="pl-8" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={type} onValueChange={setType}><SelectTrigger className="w-44" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{ORG_UNIT_TYPES.map((t) => <SelectItem key={t} value={t}>{ORG_UNIT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="overflow-x-auto"><Table className="min-w-[700px]">
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Parent</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {paged.pageItems.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell><TableCell>{u.code}</TableCell>
                <TableCell>{ORG_UNIT_TYPE_LABELS[u.type] ?? u.type}</TableCell>
                <TableCell>{u.parent_id ? byId.get(u.parent_id)?.name ?? "—" : "—"}</TableCell>
                <TableCell><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Active" : "Off"}</Badge></TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => setDraft({ ...u })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${u.name}`} disabled={remove.isPending}
                    onClick={() => { if (confirm(`Delete ${u.name}? This cannot be undone.`)) remove.mutate(u); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>))}
            {!units.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No matches</TableCell></TableRow>}
          </TableBody></Table></div>
        <ListPagination {...paged} label="units" />
      </CardContent>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? "Edit" : "Add"} command or station</DialogTitle></DialogHeader>
          {draft && <div className="grid gap-3">
            <div><Label htmlFor="u-name">Name</Label><Input id="u-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><Label htmlFor="u-code">Code</Label><Input id="u-code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></div>
            <div><Label>Type</Label><Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as OrgUnitType })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ORG_UNIT_TYPES.map((t) => <SelectItem key={t} value={t}>{ORG_UNIT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Reports to</Label><Select value={draft.parent_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, parent_id: v === "none" ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None (top level)</SelectItem>{(units.data ?? []).filter((u) => u.id !== draft.id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Switch id="u-active" checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} /><Label htmlFor="u-active">Active</Label></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={save.isPending} onClick={() => draft && save.mutate(draft)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StaffTab() {
  const units = useUnits();
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const staff = useQuery({
    queryKey: ["org-admin-staff"],
    queryFn: async () => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("profiles").select("id,user_id,staff_id,first_name,last_name,org_unit_id,status")
          .is("deleted_at", null).order("last_name").range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
      }
      const roles: { user_id: string; role: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("user_roles").select("user_id,role").range(from, from + 999);
        if (error) throw error;
        roles.push(...(data ?? []) as any); if ((data ?? []).length < 1000) break;
      }
      const map = new Map<string, string[]>();
      roles.forEach((r) => map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.role]));
      return all.map((p) => ({ ...p, roles: p.user_id ? map.get(p.user_id) ?? [] : [] }));
    },
  });
  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);
  const rows = useMemo(() => (staff.data ?? []).filter((p) =>
    (unit === "all" || (unit === "none" ? !p.org_unit_id : p.org_unit_id === unit)) &&
    `${p.first_name} ${p.last_name} ${p.staff_id ?? ""} ${p.roles.join(" ")}`.toLowerCase().includes(q.toLowerCase())), [staff.data, q, unit]);
  const paged = usePagedList(rows, { resetKey: `${q}|${unit}` });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />All staff ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search staff" className="pl-8" placeholder="Search name, staff ID or role" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={unit} onValueChange={setUnit}><SelectTrigger className="w-56" aria-label="Command"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All commands</SelectItem><SelectItem value="none">Not assigned</SelectItem>
              {(units.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
        </div>
        {staff.error && <p className="text-sm text-destructive">Could not load staff.</p>}
        <div className="overflow-x-auto"><Table className="min-w-[700px]">
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Staff ID</TableHead><TableHead>Command</TableHead><TableHead>Roles</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{paged.pageItems.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.last_name}, {p.first_name}</TableCell><TableCell>{p.staff_id ?? "—"}</TableCell>
              <TableCell>{p.org_unit_id ? unitName.get(p.org_unit_id) ?? "—" : <span className="text-muted-foreground">Not assigned</span>}</TableCell>
              <TableCell className="space-x-1">{p.roles.length ? p.roles.map((r: string) => <Badge key={r} variant="outline">{r.replace(/_/g, " ")}</Badge>) : <span className="text-muted-foreground">No sign-in role</span>}</TableCell>
              <TableCell>{p.status}</TableCell>
            </TableRow>))}</TableBody></Table></div>
        <ListPagination {...paged} label="staff" />
      </CardContent>
    </Card>
  );
}

export default function OrganizationAdmin() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div><h1 className="text-2xl font-bold">Organization Admin</h1>
        <p className="text-sm text-muted-foreground">Create, edit and delete commands, stations and roles, and see every officer with their command and role.</p></div>
      <Tabs defaultValue="units">
        <TabsList className="flex-wrap"><TabsTrigger value="units">Commands & Stations</TabsTrigger><TabsTrigger value="roles"><Crown className="mr-1 h-4 w-4" />Roles</TabsTrigger><TabsTrigger value="staff">All Staff</TabsTrigger></TabsList>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        <TabsContent value="roles"><CustomRolesManager /></TabsContent>
        <TabsContent value="staff"><StaffTab /></TabsContent>
      </Tabs>
    </div>
  );
}
