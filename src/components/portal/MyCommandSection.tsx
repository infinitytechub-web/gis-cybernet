import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/date-format";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, type AppStatus } from "@/lib/staff-applications";

const db = supabase as any;
type Unit = { id: string; name: string; type: string; parent_id: string | null; is_active: boolean };

/** Walk up to the officer's command (regional/national/command level). */
export function commandRootOf(units: Unit[], unitId: string | null): Unit | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  let cur = unitId ? byId.get(unitId) : undefined;
  let last: Unit | null = cur ?? null;
  while (cur) {
    if (["regional", "national", "command", "directorate"].includes(cur.type)) return cur;
    last = cur;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return last;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", recommended: "outline", approved: "default", rejected: "destructive", withdrawn: "outline",
};

export function MyCommandSection({ profileId, orgUnitId }: { profileId: string | null; orgUnitId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [appType, setAppType] = useState<"position" | "posting">("position");
  const [appTitle, setAppTitle] = useState("");
  const [appUnit, setAppUnit] = useState("");
  const [appStmt, setAppStmt] = useState("");
  const appsKey = ["my-staff-applications", profileId];
  const { data: myApps = [] } = useQuery({
    queryKey: appsKey,
    enabled: !!profileId,
    queryFn: async () => (await db.from("staff_applications").select("id,application_type,position_title,status,created_at, target:org_units!staff_applications_target_org_unit_id_fkey(name)").eq("profile_id", profileId).neq("application_type", "transfer").order("created_at", { ascending: false })).data ?? [],
  });
  const submitApp = async () => {
    setBusy(true);
    const { error } = await db.rpc("submit_staff_application", { _type: appType, _position_title: appTitle || null, _target_org_unit_id: appUnit || null, _statement: appStmt });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Application submitted.");
    setAppOpen(false); setAppTitle(""); setAppUnit(""); setAppStmt("");
    qc.invalidateQueries({ queryKey: appsKey });
  };
  const withdrawApp = async (id: string) => {
    const { error } = await db.rpc("withdraw_staff_application", { _id: id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: appsKey });
  };

  const { data: units = [] } = useQuery({
    queryKey: ["org-units-tree-basic"],
    staleTime: 5 * 60_000,
    queryFn: async () => ((await supabase.from("org_units").select("id,name,type,parent_id,is_active").order("display_order")).data ?? []) as Unit[],
  });
  const reqKey = ["my-transfer-requests", profileId];
  const { data: requests = [] } = useQuery({
    queryKey: reqKey,
    enabled: !!profileId,
    queryFn: async () => (await db.from("staff_transfer_requests").select("*, to_unit:org_units!staff_transfer_requests_to_org_unit_id_fkey(name)").eq("profile_id", profileId).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: latest } = useQuery({
    queryKey: ["my-latest-service", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const [a, p] = await Promise.all([
        db.from("staff_appointments").select("position_title,start_date").eq("profile_id", profileId).order("start_date", { ascending: false }).limit(1),
        db.from("staff_promotions").select("effective_date, to_rank:ranks!staff_promotions_to_rank_id_fkey(name)").eq("profile_id", profileId).eq("status", "approved").order("effective_date", { ascending: false }).limit(1),
      ]);
      return { appointment: a.data?.[0], promotion: p.data?.[0] };
    },
  });

  useEffect(() => {
    if (!profileId) return;
    const ch = supabase
      .channel(`my-transfers-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_transfer_requests", filter: `profile_id=eq.${profileId}` }, () => qc.invalidateQueries({ queryKey: reqKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const root = useMemo(() => commandRootOf(units, orgUnitId), [units, orgUnitId]);
  const children = useMemo(() => {
    const m = new Map<string, Unit[]>();
    units.forEach((u) => { if (u.parent_id) m.set(u.parent_id, [...(m.get(u.parent_id) ?? []), u]); });
    return m;
  }, [units]);
  const current = units.find((u) => u.id === orgUnitId);
  const hasOpen = requests.some((r: any) => ["pending", "recommended"].includes(r.status));

  const renderTree = (u: Unit, depth = 0): JSX.Element => (
    <li key={u.id}>
      <div className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm ${u.id === orgUnitId ? "bg-primary/10 font-semibold text-primary" : ""}`} style={{ paddingLeft: depth * 16 }}>
        {depth > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
        {u.name}
        <span className="text-xs capitalize text-muted-foreground">· {u.type}</span>
        {u.id === orgUnitId && <Badge className="ml-1 h-5 text-[10px]">You</Badge>}
      </div>
      {(children.get(u.id) ?? []).length > 0 && <ul>{children.get(u.id)!.map((c) => renderTree(c, depth + 1))}</ul>}
    </li>
  );

  const submit = async () => {
    setBusy(true);
    const { error } = await db.rpc("request_staff_transfer", { _to_org_unit_id: to, _reason: reason, _preferred_date: date || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Transfer application submitted.");
    setOpen(false); setTo(""); setReason(""); setDate("");
    qc.invalidateQueries({ queryKey: reqKey });
  };
  const withdraw = async (id: string) => {
    const { error } = await db.rpc("withdraw_staff_transfer", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Application withdrawn.");
    qc.invalidateQueries({ queryKey: reqKey });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" aria-hidden="true" /> My command</CardTitle>
            <CardDescription>
              {root ? root.name : "Not yet assigned to a command"}{current && current.id !== root?.id ? ` · posted at ${current.name}` : ""}
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1" disabled={!profileId || hasOpen} onClick={() => setOpen(true)} title={hasOpen ? "You already have an open application" : undefined}>
            <Send className="h-4 w-4" aria-hidden="true" /> Apply for transfer
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Latest appointment: </span>{latest?.appointment ? `${latest.appointment.position_title} (${formatDate(latest.appointment.start_date)})` : "—"}</p>
            <p><span className="text-muted-foreground">Latest promotion: </span>{latest?.promotion ? `${latest.promotion.to_rank?.name} (${formatDate(latest.promotion.effective_date)})` : "—"}</p>
          </div>
          {root && (
            <div className="max-h-[360px] overflow-auto rounded-md border p-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Sectors, districts and stations</p>
              <ul>{renderTree(root)}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My transfer applications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
          {requests.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">To {r.to_unit?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Applied {formatDate(r.created_at)}{r.preferred_date ? ` · preferred ${formatDate(r.preferred_date)}` : ""}</p>
                {(r.decision_note || r.recommend_note) && <p className="text-xs">{r.decision_note || r.recommend_note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status === "pending" ? "Awaiting command" : r.status === "recommended" ? "Awaiting HQ approval" : r.status}</Badge>
                {["pending", "recommended"].includes(r.status) && <Button size="sm" variant="outline" onClick={() => withdraw(r.id)}>Withdraw</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">My position & posting applications</CardTitle>
          <Button size="sm" variant="outline" disabled={!profileId} onClick={() => setAppOpen(true)}>Apply</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {myApps.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
          {myApps.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div><p className="font-medium capitalize">{a.application_type}: {[a.position_title, a.target?.name].filter(Boolean).join(" · ")}</p><p className="text-xs text-muted-foreground">Applied {formatDate(a.created_at)}</p></div>
              <div className="flex items-center gap-2"><Badge variant="secondary">{STATUS_LABEL[a.status as AppStatus]}</Badge>
                {!["approved", "rejected", "posted", "withdrawn"].includes(a.status) && <Button size="sm" variant="outline" onClick={() => withdrawApp(a.id)}>Withdraw</Button>}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={appOpen} onOpenChange={setAppOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for a position or posting</DialogTitle><DialogDescription>Shortlisting and interview by the command panel, then administrator approval.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Type</Label><Select value={appType} onValueChange={(v) => setAppType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="position">Position / appointment</SelectItem><SelectItem value="posting">Posting</SelectItem></SelectContent></Select></div>
            {appType === "position" && <div><Label>Position</Label><Input value={appTitle} onChange={(e) => setAppTitle(e.target.value)} /></div>}
            <div><Label>{appType === "posting" ? "Where you want to be posted" : "Command / unit (optional)"}</Label>
              <Select value={appUnit} onValueChange={setAppUnit}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{units.filter((u) => u.is_active).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Statement</Label><Textarea value={appStmt} onChange={(e) => setAppStmt(e.target.value)} placeholder="Why you are applying (at least 20 characters)" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAppOpen(false)}>Cancel</Button><Button disabled={busy || appStmt.trim().length < 20 || (appType === "position" ? !appTitle.trim() : !appUnit)} onClick={submitApp}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for transfer</DialogTitle>
            <DialogDescription>Your command OIC/2IC recommends, then an administrator approves.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Destination command, sector or station</Label>
              <Select value={to} onValueChange={setTo}><SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                <SelectContent>{units.filter((u) => u.is_active && u.id !== orgUnitId).map((u) => <SelectItem key={u.id} value={u.id}>{u.name} <span className="capitalize text-muted-foreground">· {u.type}</span></SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 10 characters" /></div>
            <div><Label>Preferred date (optional)</Label><DateInput value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={busy || !to || reason.trim().length < 10}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
