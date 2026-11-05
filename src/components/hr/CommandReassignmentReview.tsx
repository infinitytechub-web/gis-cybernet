import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ArrowRight, Search } from "lucide-react";

const db = supabase as any;
type Req = { id: string; profile_id: string; from_org_unit_id: string | null; to_org_unit_id: string; reason: string; requested_by: string; status: string; decision_note: string | null; created_at: string };

/** Reassignments are proposed here and only move the officer once the releasing command head (or Super Admin) approves. */
export default function CommandReassignmentReview() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<any>(null);
  const [dest, setDest] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reqs = useQuery({
    queryKey: ["command-reassignments"], refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("command_reassignment_requests").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error; return (data ?? []) as Req[];
    },
  });
  const units = useQuery({
    queryKey: ["org-units-names-all"],
    queryFn: async () => { const { data, error } = await supabase.from("org_units").select("id,name"); if (error) throw error; return data ?? []; },
  });
  const unitName = (id: string | null) => (id && units.data?.find((u) => u.id === id)?.name) || "Unassigned";
  const ids = useMemo(() => [...new Set((reqs.data ?? []).map((r) => r.profile_id))], [reqs.data]);
  const people = useQuery({
    queryKey: ["command-reassignment-people", ids], enabled: ids.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id,first_name,last_name,staff_id").in("id", ids); if (error) throw error; return data ?? []; },
  });
  const person = (id: string) => { const p = people.data?.find((x) => x.id === id); return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() + (p.staff_id ? ` (${p.staff_id})` : "") : "Staff record"; };

  const search = useQuery({
    queryKey: ["reassign-search", q], enabled: q.trim().length >= 2,
    queryFn: async () => {
      const s = q.trim().replace(/[%,()]/g, "");
      const { data, error } = await supabase.from("profiles").select("id,first_name,last_name,staff_id,org_unit_id").is("deleted_at", null)
        .or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,staff_id.ilike.%${s}%`).limit(25);
      if (error) throw error; return data ?? [];
    },
  });
  const ctx = useQuery({
    queryKey: ["reassign-ctx", picked?.id], enabled: !!picked,
    queryFn: async () => { const { data, error } = await supabase.rpc("staff_mapping_edit_context" as any, { _profile_id: picked.id }); if (error) throw error; return data as any; },
  });

  useEffect(() => {
    const ch = supabase.channel(`reassign-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "command_reassignment_requests" }, () => qc.invalidateQueries({ queryKey: ["command-reassignments"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const propose = async () => {
    setBusy("new");
    const { error } = await db.rpc("propose_command_reassignment", { _profile_id: picked.id, _expected_org_unit_id: ctx.data?.org_unit_id ?? null, _to_org_unit_id: dest, _reason: reason });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Reassignment submitted for review"); setPicked(null); setDest(""); setReason(""); setQ("");
    qc.invalidateQueries({ queryKey: ["command-reassignments"] });
  };
  const decide = async (id: string, decision: string) => {
    setBusy(id);
    const { error } = await db.rpc("decide_command_reassignment", { _request_id: id, _decision: decision, _note: notes[id] ?? "" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(decision === "approve" ? "Approved — officer moved to the new command" : "Decision recorded");
    for (const k of ["command-reassignments", "hrm-dashboard-summary", "staff-mapping", "profiles"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const rows = (reqs.data ?? []).filter((r) => status === "all" || r.status === status);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Propose a command reassignment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!picked ? <>
            <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-8" placeholder="Type a name or staff ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" /></div>
            {search.data?.length ? <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">{search.data.map((p) => (
              <li key={p.id}><button type="button" className="w-full p-2 text-left text-sm hover:bg-muted" onClick={() => setPicked(p)}>{p.first_name} {p.last_name} <span className="text-muted-foreground">{p.staff_id} · {unitName(p.org_unit_id)}</span></button></li>))}</ul>
              : q.trim().length >= 2 && !search.isLoading && <p className="text-sm text-muted-foreground">No matching active staff.</p>}
          </> : <>
            <div className="flex flex-wrap items-center gap-2 text-sm"><strong>{picked.first_name} {picked.last_name}</strong><span className="text-muted-foreground">{picked.staff_id}</span><Button variant="ghost" size="sm" onClick={() => setPicked(null)}>Change</Button></div>
            {ctx.isError && <Alert variant="destructive"><AlertDescription>{(ctx.error as Error).message}</AlertDescription></Alert>}
            <p className="text-sm">Current: <strong>{unitName(ctx.data?.org_unit_id ?? null)}</strong></p>
            <Select value={dest} onValueChange={setDest}><SelectTrigger aria-label="New command or unit"><SelectValue placeholder="Select new command or unit" /></SelectTrigger>
              <SelectContent>{(ctx.data?.destinations ?? []).filter((d: any) => d.id !== ctx.data?.org_unit_id).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            <Textarea placeholder="Reason for reassignment" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
            <Button disabled={!dest || !reason.trim() || busy === "new" || !ctx.data} onClick={propose}>Submit for review</Button>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Reassignment reviews</CardTitle>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40" aria-label="Status"><SelectValue /></SelectTrigger><SelectContent>{["pending", "approved", "rejected", "cancelled", "all"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select>
        </CardHeader>
        <CardContent className="space-y-3">
          {reqs.isError && <Alert variant="destructive"><AlertDescription>Reassignments could not be loaded. <Button size="sm" variant="outline" onClick={() => void reqs.refetch()}>Retry</Button></AlertDescription></Alert>}
          {!reqs.isLoading && !rows.length && <p className="text-sm text-muted-foreground">No {status === "all" ? "" : status} reassignments.</p>}
          {rows.map((r) => {
            const mine = r.requested_by === user?.id;
            return (
              <div key={r.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{person(r.profile_id)}</strong><Badge variant={r.status === "pending" ? "secondary" : r.status === "approved" ? "default" : "outline"} className="capitalize">{r.status}</Badge><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB")}</span></div>
                <p className="flex flex-wrap items-center gap-1 text-sm">{unitName(r.from_org_unit_id)} <ArrowRight className="h-3 w-3" aria-hidden="true" /> {unitName(r.to_org_unit_id)}</p>
                <p className="text-sm text-muted-foreground">Reason: {r.reason}</p>
                {r.decision_note && <p className="text-sm text-muted-foreground">Decision note: {r.decision_note}</p>}
                {r.status === "pending" && <div className="space-y-2">
                  <Input placeholder={mine ? "Reason for cancelling" : "Decision note (required to return)"} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} aria-label="Decision note" />
                  <div className="flex flex-wrap gap-2">{mine
                    ? <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "cancel")}>Cancel proposal</Button>
                    : <><Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, "approve")}>Approve & move</Button><Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "reject")}>Reject</Button></>}</div>
                </div>}
              </div>);
          })}
        </CardContent>
      </Card>
    </div>
  );
}
