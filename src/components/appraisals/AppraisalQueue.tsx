import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APPRAISAL_STATES, APPRAISAL_CRITERIA, appraisalDetailLink, validateAppraisalScores } from "@/lib/appraisal-workflow";
import { usePagedList } from "@/hooks/usePagedList";
import { ListPagination } from "@/components/ui/list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Search, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Row = { id: string; staff_profile_id: string; first_name: string; last_name: string; staff_id: string; command_name: string | null; org_unit_id: string | null; period_year: number; period_month: number | null; total_score: number; workflow_state: string; actions: string[]; created_at: string };
type Context = { actions: string[]; record: Row & { comments: string | null }; scores: { criterion: string; score: number }[]; history: { id: string; action: string; to_state: string; note: string | null; created_at: string }[] };
export function AppraisalQueue() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [command, setCommand] = useState("all");
  const [year, setYear] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const query = useQuery({ queryKey: ["appraisal-queue"], refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("appraisal_queue_rows");
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  } });
  const rows = query.data ?? [];
  const filtered = rows.filter(r => (status === "all" || r.workflow_state === status) && (command === "all" || r.org_unit_id === command) && (!year || String(r.period_year) === year) && `${r.first_name} ${r.last_name} ${r.staff_id} ${r.command_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const pager = usePagedList(filtered, { resetKey: `${search}|${status}|${command}|${year}` });
  const commands = Array.from(new Map(rows.filter(r => r.org_unit_id).map(r => [r.org_unit_id, r.command_name ?? "Unnamed command"])).entries());
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Awaiting review", rows.filter(r => r.workflow_state === "submitted").length], ["Under review", rows.filter(r => r.workflow_state === "under_review").length], ["Corrections required", rows.filter(r => r.workflow_state === "returned").length], ["Approved", rows.filter(r => ["approved", "acknowledged"].includes(r.workflow_state)).length]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{query.isLoading || query.isError ? "—" : value}</p></CardContent></Card>)}</div>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1"><Label htmlFor="appraisal-search">Search</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input id="appraisal-search" className="pl-9" placeholder="Officer, staff ID or command" value={search} onChange={e => setSearch(e.target.value)}/></div></div>
      <div><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Appraisal status" className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(APPRAISAL_STATES).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Command</Label><Select value={command} onValueChange={setCommand}><SelectTrigger aria-label="Appraisal command" className="w-56"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All authorized commands</SelectItem>{commands.map(([id,name]) => id && <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="appraisal-year">Year</Label><Input id="appraisal-year" type="number" className="w-24" placeholder="All" value={year} onChange={e => setYear(e.target.value)}/></div>
      <Button variant="outline" size="icon" aria-label="Refresh appraisal queue" onClick={() => void query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}/></Button>
    </div>
    {query.isError && <Alert variant="destructive"><AlertDescription>Appraisals could not be loaded. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></AlertDescription></Alert>}
    <Card><CardContent className="p-0"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Command</TableHead><TableHead>Period</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
      {query.isLoading && <TableRow><TableCell colSpan={6}>Loading appraisals…</TableCell></TableRow>}
      {!query.isLoading && !query.isError && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No appraisals match these filters.</TableCell></TableRow>}
      {pager.pageItems.map(r => <TableRow key={r.id}><TableCell><div className="font-medium">{r.last_name}, {r.first_name}</div><div className="text-xs text-muted-foreground">{r.staff_id}</div></TableCell><TableCell>{r.command_name ?? "Unassigned"}</TableCell><TableCell>{r.period_month ? `${String(r.period_month).padStart(2,"0")}/${r.period_year}` : `Annual ${r.period_year}`}</TableCell><TableCell>{r.total_score} / 35</TableCell><TableCell><Badge variant={r.workflow_state === "returned" ? "outline" : "secondary"}>{APPRAISAL_STATES[r.workflow_state]}</Badge></TableCell><TableCell><Button variant="outline" size="sm" onClick={() => setSelected(r)}><ClipboardCheck className="mr-1 h-4 w-4"/>{r.actions.length ? "Review / continue" : "View record"}</Button></TableCell></TableRow>)}
    </TableBody></Table><ListPagination {...pager}/></CardContent></Card>
    {selected && <AppraisalWorkflowDialog row={selected} onClose={() => setSelected(null)}/>}
  </div>;
}
function AppraisalWorkflowDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient(); const [scores, setScores] = useState<Record<string,number> | null>(null); const [comments, setComments] = useState<string | null>(null); const [note,setNote] = useState(""); const [confirmAction,setConfirmAction] = useState<string | null>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const query = useQuery({ queryKey: ["appraisal-workflow",row.id], retry: false, queryFn: async () => { const {data,error} = await supabase.rpc("appraisal_workflow_context",{_appraisal:row.id}); if(error) throw error; return data as unknown as Context; } });
  const context=query.data; const currentScores=scores ?? Object.fromEntries((context?.scores ?? []).map(s => [s.criterion,s.score])); const editable=context?.actions.includes("save");
  const act=async (action:string) => {
    if (!context) return; setBusy(true); setError("");
    try {
      if (action === "save" || action === "submit") {
        if(!validateAppraisalScores(currentScores)) throw new Error("Rate all seven criteria from 1 to 5.");
        const {error}=await supabase.rpc("appraisal_save",{_profile:row.staff_profile_id,_year:row.period_year,_month:row.period_month,_scores:currentScores,_comments:comments ?? context.record.comments ?? "",_submit:action==="submit",_appraisal:row.id,_expected_state:context.record.workflow_state}); if(error) throw error;
      } else {
        const {error}=await supabase.rpc("appraisal_transition",{_appraisal:row.id,_action:action,_expected_state:context.record.workflow_state,_note:note}); if(error) throw error;
      }
      await Promise.all(["appraisal-queue","appraisals-list","appraisal-workflow","appraisal-detail","appraisal-audit","top5-month","top5-year","appraisal-existing"].map(key=>qc.invalidateQueries({queryKey:[key]})));
      toast.success("Appraisal updated."); onClose();
    } catch(e) {setError(e instanceof Error ? e.message : (e as {message?:string})?.message ?? "Action failed; retry.");} finally {setBusy(false);setConfirmAction(null);}
  };
  const labels:Record<string,string>={save:"Save corrections",submit:"Submit to Command",review:"Start review",return:"Return for corrections",approve:"Approve appraisal",acknowledge:"Acknowledge appraisal"};
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{row.first_name} {row.last_name} — Appraisal</DialogTitle></DialogHeader>
    {query.isLoading && <p role="status">Loading appraisal…</p>}{query.isError && <Alert variant="destructive"><AlertDescription>Appraisal could not be loaded. <Button onClick={()=>void query.refetch()}>Retry</Button></AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={()=>void query.refetch()}>Reload</Button></AlertDescription></Alert>}
    {context && <><Badge variant="secondary" className="w-fit">{APPRAISAL_STATES[context.record.workflow_state]}</Badge><div className="space-y-3">{APPRAISAL_CRITERIA.map(k=><div key={k} className="flex items-center justify-between gap-3"><Label htmlFor={`score-${k}`} className="capitalize">{k.replace(/_/g," ")}</Label>{editable ? <Select value={String(currentScores[k] ?? "")} onValueChange={v=>setScores({...currentScores,[k]:Number(v)})} disabled={busy}><SelectTrigger id={`score-${k}`} className="w-20"><SelectValue placeholder="—"/></SelectTrigger><SelectContent>{[1,2,3,4,5].map(v=><SelectItem key={v} value={String(v)}>{v}</SelectItem>)}</SelectContent></Select> : <span className="tabular-nums">{currentScores[k] ?? "—"} / 5</span>}</div>)}</div>
    <div><Label htmlFor="appraisal-comments">Reviewer comments</Label><Textarea id="appraisal-comments" value={comments ?? context.record.comments ?? ""} onChange={e=>setComments(e.target.value)} readOnly={!editable} disabled={busy}/></div>
    {!!context.actions.length && <div><Label htmlFor="appraisal-decision-note">Decision note</Label><Textarea id="appraisal-decision-note" value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></div>}
    <section className="space-y-2"><h3 className="font-semibold">Workflow history</h3>{context.history.length ? context.history.map(e=><div key={e.id} className="border-b py-2 text-sm"><div>{APPRAISAL_STATES[e.to_state]} · {format(new Date(e.created_at),"dd/MM/yyyy HH:mm")}</div>{e.note&&<p className="whitespace-pre-wrap text-muted-foreground">{e.note}</p>}</div>):<p className="text-sm text-muted-foreground">No workflow events recorded.</p>}</section>
    {confirmAction ? <Alert><AlertDescription className="space-y-3"><p>Confirm: {labels[confirmAction]}?</p><div className="flex gap-2"><Button disabled={busy || (confirmAction==="return"&&!note.trim())} onClick={()=>void act(confirmAction)}>Confirm</Button><Button variant="outline" disabled={busy} onClick={()=>setConfirmAction(null)}>Cancel</Button></div></AlertDescription></Alert>:<DialogFooter className="flex-wrap gap-2"><Button asChild variant="outline"><Link to={appraisalDetailLink(row)}>Full record</Link></Button>{context.actions.filter(a=>a!=="save"||editable).map(a=><Button key={a} variant={a==="return"||a==="save"?"outline":"default"} disabled={busy} onClick={()=>a==="save"?void act(a):setConfirmAction(a)}>{labels[a]}</Button>)}</DialogFooter>}</>}
  </DialogContent></Dialog>;
}