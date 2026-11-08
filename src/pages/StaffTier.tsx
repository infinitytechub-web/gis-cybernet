import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePagedList } from "@/hooks/usePagedList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { filterQuickUsers, type QuickUserRow } from "@/lib/quick-user-search";
import { Constants } from "@/integrations/supabase/types";

type Bucket = { id: string | null; name: string; count: number };
type Summary = { total: number; ranks: Bucket[]; grades: Bucket[]; roles: Bucket[] };
type Def = { id: string; name: string; code: string | null; sort_order: number | null; is_active?: boolean };
const ROLES = Constants.public.Enums.app_role as readonly string[];
const pretty = (s: string) => s.replace(/_/g, " ");
const NONE = "__none";

export default function StaffTier() {
  const { isAdmin, canManageCommandTier } = useAuth();
  const qc = useQueryClient();
  const [unit, setUnit] = useState<string>("all");
  const units = useQuery({ queryKey: ["tier-units"], queryFn: async () => {
    const { data } = await supabase.from("org_units").select("id,name").eq("is_active", true).order("name");
    return (data ?? []) as { id: string; name: string }[];
  } });
  const summary = useQuery({ queryKey: ["staff-tier-summary", unit], refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("staff_tier_summary", { _org_unit_id: unit === "all" ? null : unit });
    if (error) throw error; return data as unknown as Summary;
  } });
  const ranks = useQuery({ queryKey: ["tier-ranks"], queryFn: async () => (await supabase.from("ranks").select("id,name,code:abbreviation,sort_order").order("sort_order")).data as Def[] ?? [] });
  const grades = useQuery({ queryKey: ["tier-grades"], queryFn: async () => (await supabase.from("staff_grades").select("id,name,code,sort_order,is_active").order("sort_order")).data as Def[] ?? [] });
  const refresh = () => { ["staff-tier-summary", "tier-ranks", "tier-grades", "quick-user-search-rows"].forEach(k => qc.invalidateQueries({ queryKey: [k] })); };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Layers className="h-6 w-6 text-primary" aria-hidden />Staff Tier</h1>
        <p className="text-sm text-muted-foreground">Roles, ranks and grades with live headcounts. Deleted staff are excluded.</p></div>
      <div className="w-64"><Label>Command</Label><Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All commands I can see</SelectItem>{units.data?.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
    </header>
    {summary.error && <p className="text-sm text-destructive">Could not load headcounts.</p>}
    <Tabs defaultValue="dashboard">
      <TabsList className="flex-wrap h-auto"><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="assign">Assign</TabsTrigger><TabsTrigger value="ranks">Ranks</TabsTrigger><TabsTrigger value="grades">Grades</TabsTrigger><TabsTrigger value="roles">Roles</TabsTrigger></TabsList>
      <TabsContent value="dashboard" className="mt-4 space-y-6">
        <p className="text-sm font-medium">Total personnel: {summary.data?.total ?? "…"}</p>
        {(["roles", "ranks", "grades"] as const).map(k => <section key={k} className="space-y-2"><h2 className="font-semibold capitalize">{k}</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">{(summary.data?.[k] ?? []).map(b => <Card key={`${k}-${b.id ?? "none"}`}><CardContent className="p-4"><p className="truncate text-sm capitalize text-muted-foreground">{pretty(b.name)}</p><p className="text-2xl font-bold text-primary">{b.count}</p></CardContent></Card>)}
          {!summary.isLoading && !(summary.data?.[k]?.length) && <p className="text-sm text-muted-foreground">No records.</p>}</div></section>)}
      </TabsContent>
      <TabsContent value="assign" className="mt-4">{canManageCommandTier || isAdmin ? <AssignPanel ranks={ranks.data ?? []} grades={(grades.data ?? []).filter(g => g.is_active !== false)} isAdmin={isAdmin} onDone={refresh} /> : <p className="text-sm text-muted-foreground">Only Super Admins and command heads can assign tiers.</p>}</TabsContent>
      <TabsContent value="ranks" className="mt-4"><DefList kind="rank" rows={ranks.data ?? []} canEdit={isAdmin} onDone={refresh} /></TabsContent>
      <TabsContent value="grades" className="mt-4"><DefList kind="grade" rows={grades.data ?? []} canEdit={isAdmin} onDone={refresh} /></TabsContent>
      <TabsContent value="roles" className="mt-4"><Card><CardHeader><CardTitle className="text-base">System roles</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
        {ROLES.map(r => <Badge key={r} variant="outline" className="capitalize">{pretty(r)} · {summary.data?.roles.find(x => x.name === r)?.count ?? 0}</Badge>)}
        <p className="w-full pt-2 text-xs text-muted-foreground">Roles are fixed security levels; assign them to officers in the Assign tab.</p></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}

function DefList({ kind, rows, canEdit, onDone }: { kind: "rank" | "grade"; rows: Def[]; canEdit: boolean; onDone: () => void }) {
  const [draft, setDraft] = useState<{ id: string | null; name: string; code: string; sort: string; active: boolean }>({ id: null, name: "", code: "", sort: "0", active: true });
  const [busy, setBusy] = useState(false);
  const pager = usePagedList(rows);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("save_staff_tier_definition", { _kind: kind, _id: draft.id, _name: draft.name, _code: draft.code, _sort: Number(draft.sort) || 0, _active: draft.active });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${kind === "rank" ? "Rank" : "Grade"} saved`); setDraft({ id: null, name: "", code: "", sort: "0", active: true }); onDone();
  };
  return <div className="space-y-4">
    {canEdit && <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
      <div className="sm:col-span-2"><Label>Name</Label><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
      <div><Label>{kind === "rank" ? "Abbreviation" : "Code"}</Label><Input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} /></div>
      <div><Label>Order</Label><Input type="number" value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value })} /></div>
      <div className="flex gap-2">{kind === "grade" && draft.id && <Button variant="outline" onClick={() => setDraft({ ...draft, active: !draft.active })}>{draft.active ? "Retire" : "Reactivate"}</Button>}
        <Button onClick={save} disabled={busy || !draft.name.trim()}>{draft.id ? <Save className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}{draft.id ? "Update" : "Add"}</Button></div>
    </CardContent></Card>}
    <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Order</TableHead>{kind === "grade" && <TableHead>Status</TableHead>}{canEdit && <TableHead />}</TableRow></TableHeader>
      <TableBody>{pager.pageItems.map(r => <TableRow key={r.id}><TableCell>{r.name}</TableCell><TableCell>{r.code ?? "—"}</TableCell><TableCell>{r.sort_order ?? 0}</TableCell>
        {kind === "grade" && <TableCell><Badge variant={r.is_active ? "secondary" : "outline"}>{r.is_active ? "Active" : "Retired"}</Badge></TableCell>}
        {canEdit && <TableCell><Button size="sm" variant="ghost" onClick={() => setDraft({ id: r.id, name: r.name, code: r.code ?? "", sort: String(r.sort_order ?? 0), active: r.is_active !== false })}>Edit</Button></TableCell>}</TableRow>)}
        {!rows.length && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No {kind}s defined yet.</TableCell></TableRow>}</TableBody></Table></div>
    <ListPagination {...pager} label={`${kind}s`} />
  </div>;
}

function AssignPanel({ ranks, grades, isAdmin, onDone }: { ranks: Def[]; grades: Def[]; isAdmin: boolean; onDone: () => void }) {
  const [q, setQ] = useState(""); const [picked, setPicked] = useState<QuickUserRow | null>(null);
  const [rank, setRank] = useState(NONE); const [grade, setGrade] = useState(NONE); const [role, setRole] = useState(NONE); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const rows = useQuery({ queryKey: ["quick-user-search-rows"], queryFn: async () => { const { data, error } = await supabase.rpc("staff_directory_rows"); if (error) throw error; return (data ?? []) as QuickUserRow[]; } });
  const results = useMemo(() => filterQuickUsers(rows.data ?? [], q).slice(0, 25), [rows.data, q]);
  const roles = ROLES.filter(r => isAdmin || r !== "admin");
  const save = async () => {
    if (!picked) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_staff_tier", { _profile_id: picked.id, _rank_id: rank === NONE ? null : rank, _grade_id: grade === NONE ? null : grade, _add_role: (role === NONE ? null : role) as never, _reason: reason });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tier assigned"); setRole(NONE); setReason(""); onDone();
  };
  return <div className="grid gap-4 lg:grid-cols-2">
    <Card><CardHeader><CardTitle className="text-base">1. Pick an officer</CardTitle></CardHeader><CardContent className="space-y-2">
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Type name, staff ID, rank or unit" aria-label="Search officer" />
      <ul className="max-h-80 space-y-1 overflow-y-auto">{results.map(r => <li key={r.id}><button type="button" onClick={() => setPicked(r)} className={`w-full rounded-md border px-3 py-2 text-left text-sm ${picked?.id === r.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
        <span className="font-medium">{r.first_name} {r.last_name}</span> <span className="text-muted-foreground">· {r.rank_abbreviation ?? r.rank_name ?? "No rank"} · {r.unit ?? "No unit"}</span></button></li>)}</ul>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">2. Assign {picked ? `to ${picked.first_name} ${picked.last_name}` : ""}</CardTitle></CardHeader><CardContent className="space-y-3">
      <div><Label>Rank</Label><Select value={rank} onValueChange={setRank}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Keep current</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Grade</Label><Select value={grade} onValueChange={setGrade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Keep current</SelectItem>{grades.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Add role</Label><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>No new role</SelectItem>{roles.map(r => <SelectItem key={r} value={r} className="capitalize">{pretty(r)}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Reason</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></div>
      <Button onClick={save} disabled={!picked || busy || !reason.trim() || (rank === NONE && grade === NONE && role === NONE)}>Save assignment</Button>
    </CardContent></Card>
  </div>;
}
