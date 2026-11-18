import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, ClipboardCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import { ArmoryNav } from "@/components/armory/ArmoryNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { ARMORY_APPROVAL_KINDS, ARMORY_FIELDS, ARMORY_LABELS, armoryActions, armoryAwaitingApproval, armoryStatusLabel, type ArmoryContext, type ArmoryRecord } from "@/lib/armory";

type EventRow = { id: string; record_id: string; actor_name: string; action: string; reason: string; created_at: string };
const KIND: Record<string, string> = { custody: "Custody", transfer: "Transfer", maintenance: "Inspection" };
const when = (s: string) => format(new Date(s), "dd/MM/yyyy HH:mm");
const DECIDED = ["approved", "rejected", "acknowledged", "returned", "discrepancy", "handed_over", "received"];

export default function ArmoryApprovals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { formatStaffId } = useStaffIdDisplay("directory");
  const [view, setView] = useState("awaiting");
  const [unit, setUnit] = useState("all");
  const [kind, setKind] = useState("all");
  const [decision, setDecision] = useState<{ record: ArmoryRecord; action: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<ArmoryRecord | null>(null);

  useEffect(() => {
    if (!user) return;
    const update = () => { void qc.invalidateQueries({ queryKey: ["armory-records"] }); void qc.invalidateQueries({ queryKey: ["armory-events"] }); };
    const ch = supabase.channel(`armory-approvals-${user.id}-${crypto.randomUUID()}`).on("postgres_changes", { event: "*", schema: "public", table: "armory_records" }, update).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc, user]);

  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const ctx = ctxQ.data ?? { commands: [], staff: [] };
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && !!ctx.commands.length, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  const evQ = useQuery({ queryKey: ["armory-events", user?.id, "approvals"], enabled: !!detail, queryFn: async () => {
    const { data, error } = await supabase.from("armory_events").select("id,record_id,actor_name,action,reason,created_at").eq("record_id", detail!.id).order("created_at", { ascending: false }); if (error) throw error; return data as EventRow[]; } });

  const all = recQ.data ?? [];
  const cmd = (id: string | null) => ctx.commands.find(c => c.id === id);
  const staff = (id: string | null) => { const p = ctx.staff.find(s => s.id === id); return p ? `${p.first_name} ${p.last_name} · ${formatStaffId(p.staff_id, { ownerUserId: p.user_id, context: "directory" })}` : "—"; };
  const asset = (id: string | null) => all.find(a => a.id === id);
  const inScope = all.filter(r => (ARMORY_APPROVAL_KINDS as readonly string[]).includes(r.kind) && (unit === "all" || r.org_unit_id === unit) && (kind === "all" || r.kind === kind));
  const awaiting = inScope.filter(armoryAwaitingApproval);
  const decided = inScope.filter(r => DECIDED.includes(r.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const items = view === "awaiting" ? awaiting : decided;
  const counts = useMemo(() => ({ custody: awaiting.filter(r => r.kind === "custody").length, transfer: awaiting.filter(r => r.kind === "transfer").length, maintenance: awaiting.filter(r => r.kind === "maintenance").length }), [awaiting]);
  const canDecide = (r: ArmoryRecord, a: string) => !!user && armoryActions(r, !!cmd(r.org_unit_id)?.can_approve, user.id).includes(a);
  const whyNot = (r: ArmoryRecord) => !cmd(r.org_unit_id)?.can_approve ? "Only the Command Head can decide" : "You created or last edited this request";

  const decide = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Select a request");
      if (reason.trim().length < 3) throw new Error("Enter a reason of at least 3 characters");
      const { error } = await supabase.rpc("armory_transition", { _id: decision.record.id, _action: decision.action, _reason: reason.trim(), _version: decision.record.version });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(decision?.action === "approve" ? "Request approved" : "Request rejected"); setDecision(null); setReason(""); await qc.invalidateQueries({ queryKey: ["armory-records"] }); await qc.invalidateQueries({ queryKey: ["armory-events"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Armory Approvals</h1></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { void ctxQ.refetch(); void recQ.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      <ArmoryNav />
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["custody", "transfer", "maintenance"] as const).map(k => <Card key={k}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{KIND[k]} awaiting approval</p><p className="text-2xl font-bold">{recQ.isLoading ? "…" : counts[k]}</p></CardContent></Card>)}
      </div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        <div><Label>Command</Label><SearchableSelect value={unit} onValueChange={setUnit} options={[{ value: "all", label: "All my commands" }, ...ctx.commands.map(c => ({ value: c.id, label: c.name }))]} /></div>
        <div><Label>Request type</Label><SearchableSelect value={kind} onValueChange={setKind} options={[{ value: "all", label: "Custody, transfers and inspections" }, ...ARMORY_APPROVAL_KINDS.map(k => ({ value: k, label: ARMORY_LABELS[k] }))]} /></div>
      </CardContent></Card>
      {recQ.isError && <Card><CardContent className="flex items-center justify-between p-4 text-sm text-destructive">Could not load requests.<Button size="sm" variant="outline" onClick={() => recQ.refetch()}>Retry</Button></CardContent></Card>}
      <Card><CardHeader className="space-y-3">
        <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="awaiting">Awaiting approval ({awaiting.length})</TabsTrigger><TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger></TabsList></Tabs>
        <CardTitle className="sr-only">{view === "awaiting" ? "Awaiting approval" : "Decided"}</CardTitle>
      </CardHeader><CardContent>
        <PagedSection items={items} label="requests" searchText={r => `${r.reference} ${r.title} ${staff(r.profile_id)} ${cmd(r.org_unit_id)?.name ?? ""} ${armoryStatusLabel(r)}`}>{page => <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Command</TableHead><TableHead>Officer / weapon</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader><TableBody>
          {page.length ? page.map(r => <TableRow key={r.id}>
            <TableCell><div className="font-medium">{r.reference}</div><div className="text-sm">{r.title}</div><div className="text-xs text-muted-foreground">{KIND[r.kind]}</div></TableCell>
            <TableCell>{cmd(r.org_unit_id)?.name ?? "—"}{r.kind === "transfer" && r.destination_unit_id && <div className="text-xs text-muted-foreground">to {cmd(r.destination_unit_id)?.name ?? "another command"}</div>}</TableCell>
            <TableCell>{r.profile_id ? staff(r.profile_id) : "—"}{r.asset_id && <div className="text-xs text-muted-foreground">{asset(r.asset_id)?.reference ?? "Weapon"}</div>}</TableCell>
            <TableCell><Badge variant={armoryAwaitingApproval(r) ? "secondary" : r.status === "rejected" ? "destructive" : "outline"}>{armoryStatusLabel(r)}</Badge></TableCell>
            <TableCell className="whitespace-nowrap">{when(r.updated_at)}</TableCell>
            <TableCell><div className="flex flex-wrap items-center gap-1">
              <Button size="icon" variant="ghost" aria-label={`View ${r.reference}`} onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></Button>
              {armoryAwaitingApproval(r) && (canDecide(r, "approve") ? <>
                <Button size="sm" onClick={() => { setDecision({ record: r, action: "approve" }); setReason(""); }}><CheckCircle2 className="mr-1 h-4 w-4" />Approve</Button>
                <Button size="sm" variant="outline" onClick={() => { setDecision({ record: r, action: "reject" }); setReason(""); }}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
              </> : <span className="text-xs text-muted-foreground">{whyNot(r)}</span>)}
            </div></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{view === "awaiting" ? "No requests are waiting for approval." : "No decided requests yet."}</TableCell></TableRow>}
        </TableBody></Table></div>}</PagedSection>
      </CardContent></Card></>}

      <Dialog open={!!decision} onOpenChange={o => { if (!o) setDecision(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{decision?.action === "approve" ? "Approve" : "Reject"} {decision && KIND[decision.record.kind].toLowerCase()} request {decision?.record.reference}</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label htmlFor="armory-decision-reason">Reason (required)</Label><Textarea id="armory-decision-reason" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision?.action === "reject" ? "destructive" : "default"} disabled={decide.isPending || reason.trim().length < 3} onClick={() => decide.mutate()}>{decision?.action === "approve" ? "Approve" : "Reject"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{detail?.reference} · {detail && armoryStatusLabel(detail)}</DialogTitle></DialogHeader>
          {detail && <div className="space-y-3 text-sm">
            <p className="font-medium">{detail.title}</p>
            <dl className="grid grid-cols-2 gap-2">{ARMORY_FIELDS[detail.kind].filter(f => detail.details[f.key]).map(f => <div key={f.key}><dt className="text-muted-foreground">{f.label}</dt><dd>{detail.details[f.key]}</dd></div>)}</dl>
            <div><p className="mb-1 font-medium">History</p>{evQ.isLoading ? <p className="text-muted-foreground">Loading…</p> : (evQ.data ?? []).length ? <ul className="space-y-1">{evQ.data!.map(e => <li key={e.id} className="rounded border p-2"><span className="capitalize font-medium">{e.action.replace(/_/g, " ")}</span> by {e.actor_name} · {when(e.created_at)}<div className="text-muted-foreground">{e.reason}</div></li>)}</ul> : <p className="text-muted-foreground">No history yet.</p>}</div>
          </div>}
        </DialogContent>
      </Dialog>
      <QuickScroll />
    </div>
  );
}
