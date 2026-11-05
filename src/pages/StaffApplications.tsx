import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { readRecordPages } from "@/lib/read-record-pages";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { STATUS_LABEL, TYPE_LABEL, OPEN_STATUSES, nextAction, applicantName, inPendingStage, type AppStatus } from "@/lib/staff-applications";
import { CommandApprovalQueue } from "@/components/hr/CommandApprovalQueue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffApplicationForm } from "@/components/hr/StaffApplicationForm";
import { SearchableSelect } from "@/components/ui/searchable-select";

const db = supabase as any;
const SEL = "*, profiles(id,first_name,last_name,staff_id,user_id), target:org_units!staff_applications_target_org_unit_id_fkey(name)";

const statusVariant = (s: AppStatus) =>
  s === "posted" || s === "approved" ? "default" : s === "rejected" || s === "panel_not_recommended" ? "destructive" : s === "withdrawn" ? "outline" : "secondary";

export default function StaffApplications({ pending = false }: { pending?: boolean }) {
  const { isAdmin, role } = useAuth();
  const isHrAdmin = isAdmin || role === "head_of_administration";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"open" | "all" | AppStatus>("open");
  const [type, setType] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [stage, setStage] = useState("all");
  const [command, setCommand] = useState("all");

  const { data: apps = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-applications"],
    refetchInterval: 60_000,
    queryFn: async () => {
      return readRecordPages<any>((from, to) => db.from("staff_applications").select(SEL)
        .order("created_at", { ascending: false }).order("id").range(from, to));
    },
  });
  const { data: units = [] } = useQuery({
    queryKey: ["org-units-active-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_units").select("id,name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`staff-apps-${Math.random().toString(36).slice(2)}`);
    for (const t of ["staff_applications", "staff_application_interviews"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["staff-applications"] });
        qc.invalidateQueries({ queryKey: ["staff-application"] });
      });
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return apps.filter((a: any) =>
      (!pending || inPendingStage(a.application_type, a.status, stage)) &&
      (command === "all" || a.target_org_unit_id === command) &&
      (status === "all" || (status === "open" ? OPEN_STATUSES.includes(a.status) : a.status === status)) &&
      (type === "all" || a.application_type === type) &&
      (!s || [applicantName(a), a.profiles?.staff_id, a.position_title, a.target?.name, a.external_ghana_card].some((v) => String(v ?? "").toLowerCase().includes(s))));
  }, [apps, q, status, type, pending, stage, command]);
  const pager = usePagedList(filtered, { resetKey: `${q}|${status}|${type}|${stage}|${command}` });
  const pageRows = pager.pageItems;

  const counts = useMemo(() => {
    const c = { new: 0, interview: 0, awaiting: 0, posting: 0 };
    apps.forEach((a: any) => {
      if (a.application_type === "transfer" || (command !== "all" && a.target_org_unit_id !== command)) return;
      if (a.status === "submitted" || a.status === "shortlisted") c.new++;
      else if (a.status === "interview_scheduled") c.interview++;
      else if (a.status.startsWith("panel_")) c.awaiting++;
      else if (a.status === "approved") c.posting++;
    });
    return c;
  }, [apps, command]);

  return (
    <div className="space-y-4">
      <PageHeader
        className="[&>div>div:nth-child(2)]:min-w-40 [&>div>div:last-child]:max-w-full"
        title={pending ? "Pending HR" : "Staff Applications"}
        icon={ClipboardList}
        actions={<div className="flex flex-wrap gap-2"><Button size="sm" className="gap-1" onClick={() => setStaffFormOpen(true)}><Plus className="h-4 w-4" /> Submit application</Button>{isHrAdmin && <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>Record recruit application</Button>}</div>}
      />
      {pending && <>
        <nav className="flex flex-wrap gap-2" aria-label="HR workflow links"><Button asChild variant="outline" size="sm"><Link to="/hr">Human Resource</Link></Button><Button asChild variant="outline" size="sm"><Link to="/hr/applications">All applications & history</Link></Button></nav>
        <CommandApprovalQueue />
        <Tabs value={stage} onValueChange={setStage}><div className="overflow-x-auto"><TabsList className="w-max"><TabsTrigger value="all">All pending</TabsTrigger><TabsTrigger value="applications">Applications</TabsTrigger><TabsTrigger value="interviews">Interviews</TabsTrigger><TabsTrigger value="decisions">Approvals</TabsTrigger><TabsTrigger value="postings">Postings</TabsTrigger></TabsList></div></Tabs>
      </>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["New / shortlisted", counts.new], ["Interviews scheduled", counts.interview], ["Awaiting admin decision", counts.awaiting], ["Approved, to post", counts.posting]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><p className="text-2xl font-bold text-primary">{isLoading || isError ? "—" : v as number}</p><p className="text-xs text-muted-foreground">{l as string}</p></CardContent></Card>
        ))}
      </div>

      {isError && <Alert variant="destructive"><AlertDescription>Applications could not be loaded. <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button></AlertDescription></Alert>}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input className="pl-8" placeholder="Search name, staff ID, position, command, Ghana Card" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" /></div>
            <Select value={command} onValueChange={setCommand}><SelectTrigger className="sm:w-48" aria-label="Destination command"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All destinations</SelectItem>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}><SelectTrigger className="sm:w-56" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            <Select value={type} onValueChange={setType}><SelectTrigger className="sm:w-44" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow><TableHead>Applicant</TableHead><TableHead>Type</TableHead><TableHead>Position / destination</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!isLoading && !isError && pageRows.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{apps.length === 0 ? "No applications recorded yet." : "No applications match."}</TableCell></TableRow>}
                {pageRows.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell><p className="font-medium">{applicantName(a)}</p><p className="text-xs text-muted-foreground">{a.applicant_kind === "external" ? "Outside recruit" : a.profiles?.staff_id}</p></TableCell>
                    <TableCell>{TYPE_LABEL[a.application_type]}</TableCell>
                    <TableCell>{[a.position_title, a.target?.name].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell>{formatDate(a.created_at)}</TableCell>
                    <TableCell><Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status as AppStatus]}</Badge></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!isError && <ListPagination {...pager} label="applications" />}
        </CardContent>
      </Card>

      {openId && <ApplicationDialog id={openId} isHrAdmin={isHrAdmin} onClose={() => setOpenId(null)} />}
      {staffFormOpen && <StaffApplicationForm open={staffFormOpen} onOpenChange={setStaffFormOpen} onSubmitted={(id) => { setStatus("all"); setQ(""); setCommand("all"); setType("all"); setStage("all"); setOpenId(id); }} />}
      {isHrAdmin && <NewRecruitDialog open={newOpen} onOpenChange={setNewOpen} units={units} />}
    </div>
  );
}

function ApplicationDialog({ id, isHrAdmin, onClose }: { id: string; isHrAdmin: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const [loc, setLoc] = useState("");
  const [panel, setPanel] = useState("");
  const [score, setScore] = useState("");
  const [rec, setRec] = useState("recommend");
  const [eff, setEff] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffId, setStaffId] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-application", id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) throw new Error("Sign in to view this application.");
      const [a, i, e, panelOk] = await Promise.all([
        db.from("staff_applications").select(SEL).eq("id", id).single(),
        db.from("staff_application_interviews").select("*").eq("application_id", id).order("scheduled_at", { ascending: false }),
        db.from("staff_application_events").select("*").eq("application_id", id).order("created_at"),
        db.rpc("can_panel_staff_application", { _uid: user.id, _app_id: id }),
      ]);
      if (a.error) throw a.error;
      if (i.error) throw i.error;
      if (e.error) throw e.error;
      if (panelOk.error) throw panelOk.error;
      return { app: a.data, interviews: i.data ?? [], events: e.data ?? [], canPanel: panelOk.data === true };
    },
  });
  const a = data?.app;
  const openInterview = data?.interviews.find((x: any) => !x.recorded_at);
  const action = a ? nextAction(a.application_type, a.status, !!openInterview) : null;
  const isOwn = !!user && a?.profiles?.user_id === user.id;

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
      toast.success(ok);
      setNote("");
      for (const key of ["staff-application", "staff-applications", "command-approval-queue", "admin-overview", "hr-hub-staff-stats", "service-record", "staff-profile", "profiles", "command-analytics"]) qc.invalidateQueries({ queryKey: [key] });
    } catch (error: any) { toast.error(error.message || "The action could not be saved. Please retry."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{a ? applicantName(a) : "Application"}</DialogTitle>
          <DialogDescription>{a && `${TYPE_LABEL[a.application_type]} application · ${STATUS_LABEL[a.status as AppStatus]}`}</DialogDescription>
        </DialogHeader>
        {isLoading && <p role="status">Loading application…</p>}
        {isError && <Alert variant="destructive"><AlertDescription>Application details could not be loaded. <Button variant="outline" onClick={() => void refetch()}>Retry</Button></AlertDescription></Alert>}
        {a && data && !isError && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Applicant</dt><dd>{a.applicant_kind === "external" ? "Outside recruit" : <Link className="underline" to={`/staff/${a.profile_id}?tab=service`}>{a.profiles?.staff_id} — view service record</Link>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Position / destination</dt><dd>{[a.position_title, a.target?.name].filter(Boolean).join(" · ") || "—"}</dd></div>
              {a.applicant_kind === "external" && (<>
                <div><dt className="text-xs text-muted-foreground">Email / phone</dt><dd>{[a.external_email, a.external_phone].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Ghana Card</dt><dd>{a.external_ghana_card ?? "—"}</dd></div>
              </>)}
              <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Statement</dt><dd className="whitespace-pre-wrap">{a.statement || "—"}</dd></div>
              {a.posted_effective_date && <div><dt className="text-xs text-muted-foreground">Posted effective</dt><dd>{formatDate(a.posted_effective_date)}</dd></div>}
            </dl>

            {data.interviews.length > 0 && (
              <div><p className="mb-1 font-semibold">Interviews</p>
                <ul className="space-y-2">{data.interviews.map((i: any) => (
                  <li key={i.id} className="rounded-md border p-2">
                    <p className="font-medium">{formatDateTime(i.scheduled_at)}{i.location ? ` · ${i.location}` : ""}</p>
                    <p className="text-xs text-muted-foreground">Panel: {i.panel_members}</p>
                    {i.recorded_at ? <p>Score {i.score}/100 · {i.recommendation === "recommend" ? "Recommended" : "Not recommended"}{i.notes ? ` — ${i.notes}` : ""}</p> : <p className="text-xs">Result not yet recorded</p>}
                  </li>))}</ul>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2 font-semibold">Next step</p>
              {action === "transfer" && <Button asChild variant="outline"><Link to="/hr/pending">Open command approvals</Link></Button>}
              {action === "shortlist" && (data.canPanel ? (<div className="space-y-2"><Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-2"><Button disabled={busy} onClick={() => call("shortlist_staff_application", { _id: id, _shortlist: true, _note: note || null }, "Shortlisted")}>Shortlist</Button><Button variant="outline" disabled={busy} onClick={() => call("shortlist_staff_application", { _id: id, _shortlist: false, _note: note || null }, "Not shortlisted")}>Reject</Button></div></div>) : <p className="text-muted-foreground">Awaiting shortlisting by the command panel.</p>)}
              {action === "schedule" && (data.canPanel ? (<div className="grid gap-2"><div><Label>Date and time</Label><DateTimeInput value={at} onChange={(e) => setAt(e.target.value)} /></div><div><Label>Location</Label><Input value={loc} onChange={(e) => setLoc(e.target.value)} /></div><div><Label>Panel members</Label><Input placeholder="Names and ranks" value={panel} onChange={(e) => setPanel(e.target.value)} /></div><Button disabled={busy || !at || !panel.trim()} onClick={() => call("schedule_application_interview", { _id: id, _at: new Date(at).toISOString(), _location: loc, _panel: panel }, "Interview scheduled")}>Schedule interview</Button></div>) : <p className="text-muted-foreground">Awaiting interview scheduling.</p>)}
              {action === "record" && openInterview && (data.canPanel ? (<div className="grid gap-2 sm:grid-cols-2"><div><Label>Score (0–100)</Label><Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} /></div><div><Label>Panel recommendation</Label><Select value={rec} onValueChange={setRec}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recommend">Recommend</SelectItem><SelectItem value="not_recommend">Do not recommend</SelectItem></SelectContent></Select></div><Textarea className="sm:col-span-2" placeholder="Panel notes" value={note} onChange={(e) => setNote(e.target.value)} /><Button className="sm:col-span-2" disabled={busy || score === ""} onClick={() => call("record_interview_result", { _interview_id: openInterview.id, _score: Number(score), _recommend: rec === "recommend", _notes: note }, "Interview result recorded")}>Record panel result</Button></div>) : <p className="text-muted-foreground">Awaiting the interview panel's result.</p>)}
              {action === "decide" && (isHrAdmin && !isOwn ? (<div className="space-y-2"><Textarea placeholder="Decision note" value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-2"><Button disabled={busy} onClick={() => call("decide_staff_application", { _id: id, _approve: true, _note: note || null }, "Approved")}>Approve</Button><Button variant="outline" disabled={busy} onClick={() => call("decide_staff_application", { _id: id, _approve: false, _note: note || null }, "Rejected")}>Reject</Button></div></div>) : <p className="text-muted-foreground">Awaiting administrator approval.</p>)}
              {action === "post" && (isHrAdmin && !isOwn ? (<div className="space-y-2"><div><Label>Effective date</Label><DateInput value={eff} onChange={(e) => setEff(e.target.value)} /></div>
                {a.applicant_kind === "external" && !a.profile_id && <div className="space-y-2"><Button asChild variant="outline"><Link to="/hr/create-account">Create Staff Account</Link></Button><Label htmlFor="posting-staff-id">Verified staff ID</Label><Input id="posting-staff-id" value={staffId} onChange={(e) => setStaffId(e.target.value)} /><Button variant="outline" disabled={busy || !staffId.trim()} onClick={() => call("link_external_application_profile", { _id: id, _staff_id: staffId.trim() }, "Staff record linked; review before posting")}>Link staff record</Button></div>}
                {a.profile_id && <Button asChild variant="outline"><Link to={`/staff/${a.profile_id}?tab=service`}>Review linked staff record</Link></Button>}
                <Button disabled={busy || !eff || !a.profile_id} onClick={() => call("post_staff_application", { _id: id, _effective_date: eff }, "Posted and service record updated")}>Post applicant</Button></div>) : <p className="text-muted-foreground">Approved — awaiting posting by an administrator.</p>)}
              {action === null && <p className="text-muted-foreground">No further action.</p>}
              {isOwn && a.application_type !== "transfer" && !["approved", "rejected", "posted", "withdrawn"].includes(a.status) && <Button variant="outline" disabled={busy} onClick={() => call("withdraw_staff_application", { _id: id }, "Application withdrawn")}>Withdraw application</Button>}
            </div>

            <div><p className="mb-1 font-semibold">History</p>
              <ol className="space-y-1 border-l pl-3">{data.events.map((e: any) => (
                <li key={e.id}><span className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span> — <span className="capitalize">{String(e.action).replace(/_/g, " ")}</span>{e.note ? `: ${e.note}` : ""}</li>))}</ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewRecruitDialog({ open, onOpenChange, units }: { open: boolean; onOpenChange: (o: boolean) => void; units: any[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await db.rpc("create_external_application", { _name: f.name ?? "", _email: f.email ?? null, _phone: f.phone ?? null, _ghana_card: f.card ?? null, _position_title: f.position ?? null, _target_org_unit_id: f.unit || null, _statement: f.statement ?? null });
      if (error) throw error;
      toast.success("Recruit application recorded.");
      setF({}); onOpenChange(false);
      for (const key of ["staff-applications", "admin-overview"]) void qc.invalidateQueries({ queryKey: [key] });
    } catch (error: any) { toast.error(error.message || "Submission failed. Please retry."); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record recruit application</DialogTitle><DialogDescription>For applicants joining from outside the service.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-3">
        <div className="grid gap-3">
          <div><Label htmlFor="recruit-name">Full name</Label><Input id="recruit-name" required minLength={3} value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="recruit-email">Email</Label><Input id="recruit-email" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div><div><Label htmlFor="recruit-phone">Phone</Label><Input id="recruit-phone" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div></div>
          <div><Label htmlFor="recruit-card">Ghana Card number</Label><Input id="recruit-card" value={f.card ?? ""} onChange={(e) => set("card", e.target.value)} /></div>
          <div><Label htmlFor="recruit-position">Position applied for</Label><Input id="recruit-position" value={f.position ?? ""} onChange={(e) => set("position", e.target.value)} /></div>
          <div><Label>Command / unit</Label><SearchableSelect value={f.unit ?? ""} onValueChange={(v) => set("unit", v)} options={units.map((u) => ({ value: u.id, label: u.name }))} /></div>
          <div><Label htmlFor="recruit-notes">Notes</Label><Textarea id="recruit-notes" value={f.statement ?? ""} onChange={(e) => set("statement", e.target.value)} /></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy || (f.name ?? "").trim().length < 3}>{busy ? "Submitting…" : "Submit recruit application"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
