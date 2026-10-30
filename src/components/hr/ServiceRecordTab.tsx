import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date-format";

const db = supabase as any;
type Kind = "appointment" | "promotion" | "exit";

const statusBadge = (s: string) => (
  <Badge variant={s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary"} className="capitalize">{s}</Badge>
);

export function ServiceRecordTab({ profileId, currentRankId }: { profileId: string; currentRankId?: string | null }) {
  const { user, isAdmin, role } = useAuth();
  const qc = useQueryClient();
  const canDecideExit = isAdmin || role === "head_of_administration";
  const [dialog, setDialog] = useState<Kind | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: canRecord = false } = useQuery({
    queryKey: ["hrm-can-record", profileId, user?.id],
    enabled: !!user,
    queryFn: async () => (await db.rpc("hrm_can_record", { _uid: user!.id, _profile_id: profileId })).data === true,
  });
  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks-list"],
    queryFn: async () => (await supabase.from("ranks").select("id,name").order("sort_order")).data ?? [],
  });
  const { data: units = [] } = useQuery({
    queryKey: ["org-units-active-names"],
    queryFn: async () => (await supabase.from("org_units").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const key = ["service-record", profileId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [a, p, e] = await Promise.all([
        db.from("staff_appointments").select("*, org_units(name)").eq("profile_id", profileId).order("start_date", { ascending: false }),
        db.from("staff_promotions").select("*, from_rank:ranks!staff_promotions_from_rank_id_fkey(name), to_rank:ranks!staff_promotions_to_rank_id_fkey(name)").eq("profile_id", profileId).order("effective_date", { ascending: false }),
        db.from("staff_exits").select("*").eq("profile_id", profileId).order("effective_date", { ascending: false }),
      ]);
      for (const r of [a, p, e]) if (r.error) throw r.error;
      return { appointments: a.data ?? [], promotions: p.data ?? [], exits: e.data ?? [] };
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`service-record-${profileId}-${Math.random().toString(36).slice(2)}`);
    for (const t of ["staff_appointments", "staff_promotions", "staff_exits"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `profile_id=eq.${profileId}` }, () => qc.invalidateQueries({ queryKey: key }));
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const save = useMutation({
    mutationFn: async () => {
      const f = form;
      if (dialog === "appointment") {
        if (!f.position_title?.trim() || !f.start_date) throw new Error("Position and start date are required.");
        const { error } = await db.from("staff_appointments").insert({ profile_id: profileId, position_title: f.position_title.trim(), org_unit_id: f.org_unit_id || null, start_date: f.start_date, end_date: f.end_date || null, appointing_authority: f.authority || null, reference_no: f.reference_no || null, remarks: f.remarks || null });
        if (error) throw error;
      } else if (dialog === "promotion") {
        if (!f.to_rank_id || !f.effective_date) throw new Error("New rank and effective date are required.");
        if (f.to_rank_id === currentRankId) throw new Error("The officer already holds this rank.");
        const { error } = await db.from("staff_promotions").insert({ profile_id: profileId, from_rank_id: currentRankId ?? null, to_rank_id: f.to_rank_id, effective_date: f.effective_date, authority: f.authority || null, reference_no: f.reference_no || null, remarks: f.remarks || null });
        if (error) throw error;
      } else if (dialog === "exit") {
        if (!f.exit_type || !f.effective_date) throw new Error("Exit type and effective date are required.");
        const { error } = await db.from("staff_exits").insert({ profile_id: profileId, exit_type: f.exit_type, notice_date: f.notice_date || null, effective_date: f.effective_date, reason: f.remarks || null });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved to service record."); setDialog(null); setForm({}); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e.message),
  });

  const decide = async (fn: string, id: string, approve: boolean) => {
    const { error } = await db.rpc(fn, { _id: id, _approve: approve });
    if (error) return toast.error(error.message);
    toast.success(approve ? "Approved" : "Rejected");
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["staff-profile", profileId] });
  };

  const header = (title: string, kind: Kind) => (
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <CardTitle className="text-lg">{title}</CardTitle>
      {canRecord && <Button size="sm" variant="outline" className="gap-1" onClick={() => { setForm({}); setDialog(kind); }}><Plus className="h-4 w-4" /> Add</Button>}
    </CardHeader>
  );
  const empty = (n: number, cols: number) => n === 0 && <TableRow><TableCell colSpan={cols} className="py-6 text-center text-muted-foreground">No records yet.</TableCell></TableRow>;

  return (
    <div className="space-y-4">
      <Card>
        {header("Appointments", "appointment")}
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Command / Unit</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Authority</TableHead><TableHead>Ref.</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.appointments.map((r: any) => (
                <TableRow key={r.id}><TableCell className="font-medium">{r.position_title}</TableCell><TableCell>{r.org_units?.name ?? "—"}</TableCell><TableCell>{formatDate(r.start_date)}</TableCell><TableCell>{r.end_date ? formatDate(r.end_date) : "Current"}</TableCell><TableCell>{r.appointing_authority ?? "—"}</TableCell><TableCell>{r.reference_no ?? "—"}</TableCell></TableRow>
              ))}
              {empty(data?.appointments.length ?? 0, 6)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        {header("Promotions", "promotion")}
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead>From rank</TableHead><TableHead>To rank</TableHead><TableHead>Effective</TableHead><TableHead>Authority</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data?.promotions.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.from_rank?.name ?? "—"}</TableCell><TableCell className="font-medium">{r.to_rank?.name}</TableCell><TableCell>{formatDate(r.effective_date)}</TableCell><TableCell>{r.authority ?? "—"}</TableCell><TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right">{canRecord && r.status === "pending" && (<div className="flex justify-end gap-1"><Button size="sm" onClick={() => decide("decide_staff_promotion", r.id, true)}><Check className="h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => decide("decide_staff_promotion", r.id, false)}><X className="h-4 w-4" /></Button></div>)}</TableCell>
                </TableRow>
              ))}
              {empty(data?.promotions.length ?? 0, 6)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        {header("Resignations & exits", "exit")}
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Notice</TableHead><TableHead>Effective</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data?.exits.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium capitalize">{r.exit_type}</TableCell><TableCell>{r.notice_date ? formatDate(r.notice_date) : "—"}</TableCell><TableCell>{formatDate(r.effective_date)}</TableCell><TableCell className="max-w-[240px] truncate">{r.reason ?? "—"}</TableCell><TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right">{canDecideExit && r.status === "pending" && (<div className="flex justify-end gap-1"><Button size="sm" onClick={() => decide("decide_staff_exit", r.id, true)}><Check className="h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => decide("decide_staff_exit", r.id, false)}><X className="h-4 w-4" /></Button></div>)}</TableCell>
                </TableRow>
              ))}
              {empty(data?.exits.length ?? 0, 6)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog === "appointment" ? "Record appointment" : dialog === "promotion" ? "Record promotion" : "Record resignation / exit"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {dialog === "appointment" && (<>
              <div><Label>Position / office</Label><Input value={form.position_title ?? ""} onChange={(e) => set("position_title", e.target.value)} /></div>
              <div><Label>Command / unit</Label>
                <Select value={form.org_unit_id ?? ""} onValueChange={(v) => set("org_unit_id", v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label>Start date</Label><DateInput value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div><div><Label>End date (optional)</Label><DateInput value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div></div>
            </>)}
            {dialog === "promotion" && (<>
              <div><Label>New rank</Label>
                <Select value={form.to_rank_id ?? ""} onValueChange={(v) => set("to_rank_id", v)}><SelectTrigger><SelectValue placeholder="Select rank" /></SelectTrigger><SelectContent>{ranks.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Effective date</Label><DateInput value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} /></div>
            </>)}
            {dialog === "exit" && (<>
              <div><Label>Type</Label>
                <Select value={form.exit_type ?? ""} onValueChange={(v) => set("exit_type", v)}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{["resignation", "retirement", "dismissal", "death"].map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label>Notice date</Label><DateInput value={form.notice_date} onChange={(e) => set("notice_date", e.target.value)} /></div><div><Label>Effective date</Label><DateInput value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)} /></div></div>
            </>)}
            {dialog !== "exit" && (<div className="grid gap-3 sm:grid-cols-2"><div><Label>Authority</Label><Input value={form.authority ?? ""} onChange={(e) => set("authority", e.target.value)} /></div><div><Label>Reference / letter no.</Label><Input value={form.reference_no ?? ""} onChange={(e) => set("reference_no", e.target.value)} /></div></div>)}
            <div><Label>{dialog === "exit" ? "Reason" : "Remarks"}</Label><Textarea value={form.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
