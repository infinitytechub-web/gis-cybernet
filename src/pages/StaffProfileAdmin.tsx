import { ArmoryAccessToggle } from "@/components/admin/ArmoryAccessToggle";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const db = supabase as any;
const NONE = "__none";
type P = { id: string; first_name: string; last_name: string; staff_id: string | null; rank_id: string | null; grade_id: string | null; org_unit_id: string | null };

/** Super Admin editor for rank, grade, command and staff ID; each change uses its existing audited server path. */
export default function StaffProfileAdmin() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<P | null>(null);
  const [rank, setRank] = useState(NONE), [grade, setGrade] = useState(NONE), [unit, setUnit] = useState(NONE), [sid, setSid] = useState("");
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);

  const results = useQuery({
    queryKey: ["spa-search", q], enabled: isAdmin && q.trim().length >= 2,
    queryFn: async (): Promise<P[]> => {
      const s = q.trim().replace(/[%,()]/g, "");
      const { data, error } = await db.from("profiles").select("id, first_name, last_name, staff_id, rank_id, grade_id, org_unit_id")
        .is("deleted_at", null).or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,staff_id.ilike.%${s}%`).order("last_name").limit(25);
      if (error) throw error; return data ?? [];
    },
  });
  const ranks = useQuery({ queryKey: ["tier-ranks-spa"], queryFn: async () => (await db.from("ranks").select("id,name").order("sort_order")).data ?? [] });
  const grades = useQuery({ queryKey: ["tier-grades-spa"], queryFn: async () => (await db.from("staff_grades").select("id,name").eq("is_active", true).order("sort_order")).data ?? [] });
  const ctx = useQuery({
    queryKey: ["staff-mapping-edit", picked?.id], enabled: !!picked,
    queryFn: async () => { const { data, error } = await db.rpc("staff_mapping_edit_context", { _profile_id: picked!.id }); if (error) throw error; return data as { org_unit_id: string | null; destinations: { id: string; name: string }[] }; },
  });

  useEffect(() => {
    if (!picked) return;
    setRank(picked.rank_id ?? NONE); setGrade(picked.grade_id ?? NONE); setUnit(picked.org_unit_id ?? NONE); setSid(picked.staff_id ?? ""); setReason("");
  }, [picked]);

  if (!isAdmin) return <p className="p-4 text-muted-foreground">Only Super Admins can edit staff profiles here.</p>;

  const save = async () => {
    if (!picked || reason.trim().length < 4) return toast.error("Enter a reason of at least 4 characters");
    setBusy(true);
    try {
      const r = reason.trim();
      if (sid.trim().toUpperCase() !== (picked.staff_id ?? "").toUpperCase()) {
        const { error } = await db.rpc("admin_set_staff_id", { _profile_id: picked.id, _staff_id: sid, _reason: r }); if (error) throw error;
      }
      if ((rank === NONE ? null : rank) !== picked.rank_id || (grade === NONE ? null : grade) !== picked.grade_id) {
        const { error } = await db.rpc("assign_staff_tier", { _profile_id: picked.id, _rank_id: rank === NONE ? null : rank, _grade_id: grade === NONE ? null : grade, _add_role: null, _reason: r }); if (error) throw error;
      }
      if (unit !== NONE && unit !== (ctx.data?.org_unit_id ?? NONE)) {
        const { error } = await db.rpc("save_staff_mapping", { _profile_id: picked.id, _expected_org_unit_id: ctx.data?.org_unit_id ?? null, _to_org_unit_id: unit, _reason: r }); if (error) throw error;
      }
      const { data } = await db.from("profiles").select("id, first_name, last_name, staff_id, rank_id, grade_id, org_unit_id").eq("id", picked.id).single();
      if (data) setPicked(data);
      await Promise.all(["staff-profile", "staff-mapping-edit", "hr-dashboard-summary", "vault-staff-on-leave", "command-leave-requests", "spa-search", "staff-tier"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast.success("Profile saved");
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); } finally { setBusy(false); }
  };

  const dests = ctx.data?.destinations ?? [];
  return (
    <div className="space-y-4 p-1">
      <div><h1 className="text-2xl font-semibold">Staff Profile</h1><p className="text-sm text-muted-foreground">Edit an officer's rank, grade, command and staff ID. Vault and leave access follow these values.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Find officer</CardTitle></CardHeader><CardContent className="space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type name or staff ID" aria-label="Search officer" />
          <ul className="max-h-96 space-y-1 overflow-y-auto">{(results.data ?? []).map((r) => (
            <li key={r.id}><button type="button" onClick={() => setPicked(r)} className={`w-full rounded-md border px-3 py-2 text-left text-sm ${picked?.id === r.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>{r.first_name} {r.last_name}<span className="ml-2 text-xs text-muted-foreground">{r.staff_id}</span></button></li>
          ))}</ul>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{picked ? `${picked.first_name} ${picked.last_name}` : "Edit profile"}</CardTitle><CardDescription>Every change needs a reason and is recorded in the audit trail.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!picked ? <p className="text-sm text-muted-foreground">Pick an officer to edit.</p> : <>
              <div><Label htmlFor="spa-sid">Staff ID</Label><Input id="spa-sid" value={sid} onChange={(e) => setSid(e.target.value)} /></div>
              <div><Label>Rank</Label><Select value={rank} onValueChange={setRank}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>No rank</SelectItem>{(ranks.data ?? []).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Grade</Label><Select value={grade} onValueChange={setGrade}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>No grade</SelectItem>{(grades.data ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Command / unit</Label><Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent>
                {unit === NONE && <SelectItem value={NONE}>Unassigned</SelectItem>}
                {dests.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent></Select>{ctx.isError && <p className="text-xs text-destructive">Command options could not be loaded.</p>}</div>
              <div><Label htmlFor="spa-reason">Reason</Label><Textarea id="spa-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
              <ArmoryAccessToggle key={picked.id} profileId={picked.id} />
            </>}
          </CardContent></Card>
      </div>
    </div>
  );
}
