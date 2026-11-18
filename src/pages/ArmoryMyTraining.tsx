import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GraduationCap, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { armoryStatusLabel } from "@/lib/armory";
import { formatDisplayDate } from "@/lib/armoryPortal";

export const TRAINING_STATUSES = ["Qualified", "Refresher due", "Qualification expired", "Training scheduled", "In training", "Remedial training required", "Not qualified", "Exempt"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
type Row = { id: string; reference: string; status: string; created_at: string; training_month?: string; location?: string; training_status?: string; provider?: string; issued?: string; expiry?: string; self_submitted: boolean };

const monthLabel = (m?: string) => { if (!m) return "—"; const [y, mm] = m.split("-"); return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`; };
const blank = { month: "", year: "", location: "", status: "Qualified", provider: "", issued: "", expiry: "", document: "", reason: "" };

export default function ArmoryMyTraining() {
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string) => setF(s => ({ ...s, [k]: v }));
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 40 }, (_, i) => String(thisYear - i));
  const q = useQuery({
    queryKey: ["armory-my-training"],
    queryFn: async () => { const { data, error } = await supabase.rpc("armory_my_training" as never); if (error) throw error; return (data ?? []) as unknown as Row[]; },
    refetchInterval: 30000,
  });
  const rows = q.data ?? [];
  const current = rows.find(r => r.status === "verified");
  const pending = rows.some(r => r.status === "pending" && r.self_submitted);
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("armory_submit_my_training" as never, { _training_month: f.year && f.month ? `${f.year}-${f.month}` : "", _location: f.location, _training_status: f.status, _provider: f.provider, _issued: f.issued || null, _expiry: f.expiry || null, _document: f.document, _reason: f.reason } as never);
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Training record sent to your Command Head for approval"); setF(blank); await qc.invalidateQueries({ queryKey: ["armory-my-training"] }); await qc.invalidateQueries({ queryKey: ["armory-my-portal"] }); await qc.invalidateQueries({ queryKey: ["armory-records"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ready = f.month && f.year && f.location.trim().length >= 2 && f.provider.trim().length >= 2 && f.issued && f.expiry && f.reason.trim().length >= 3;

  return (
    <div className="min-w-0 space-y-4 p-2 sm:p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />My Training & Certification</h1>
          <p className="text-sm text-muted-foreground">Your weapon training status, and a form to submit a new training record.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/armory-weapons/my"><ArrowLeft className="mr-1 h-4 w-4" />My Armory Portal</Link></Button>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      {q.isError && <Card><CardContent className="p-4 text-sm text-destructive">Could not load your training records. Try again.</CardContent></Card>}

      <Card><CardHeader className="pb-2"><CardDescription>Current verified status</CardDescription>
        <CardTitle className="text-xl">{q.isLoading ? "…" : current ? current.training_status ?? "Qualified" : "No verified training record"}</CardTitle></CardHeader>
        {current && <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Trained</p>{monthLabel(current.training_month)}</div>
          <div><p className="text-xs text-muted-foreground">Location</p>{current.location ?? "—"}</div>
          <div><p className="text-xs text-muted-foreground">Provider</p>{current.provider ?? "—"}</div>
          <div><p className="text-xs text-muted-foreground">Expires</p>{formatDisplayDate(current.expiry)}</div>
        </CardContent>}
      </Card>

      <Card><CardHeader><CardTitle className="text-lg">Submit a training record</CardTitle><CardDescription>It goes to your Command Head for approval before it counts. You can only submit for yourself.</CardDescription></CardHeader>
        <CardContent>{pending ? <p className="text-sm text-muted-foreground">You have a record waiting for approval. You can submit another once it is decided.</p> :
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (ready) submit.mutate(); }}>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <div><Label>Training month</Label><Select value={f.month} onValueChange={set("month")}><SelectTrigger aria-label="Training month"><SelectValue placeholder="Month" /></SelectTrigger><SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Training year</Label><Select value={f.year} onValueChange={set("year")}><SelectTrigger aria-label="Training year"><SelectValue placeholder="Year" /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label htmlFor="t-loc">Training location</Label><Input id="t-loc" maxLength={200} value={f.location} onChange={e => set("location")(e.target.value)} /></div>
            <div><Label>Training status</Label><Select value={f.status} onValueChange={set("status")}><SelectTrigger aria-label="Training status"><SelectValue /></SelectTrigger><SelectContent>{TRAINING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="t-prov">Training provider</Label><Input id="t-prov" maxLength={200} value={f.provider} onChange={e => set("provider")(e.target.value)} /></div>
            <div><Label htmlFor="t-doc">Certificate reference (optional)</Label><Input id="t-doc" maxLength={100} value={f.document} onChange={e => set("document")(e.target.value)} /></div>
            <div><Label htmlFor="t-iss">Issued date</Label><DateInput id="t-iss" value={f.issued} onChange={e => set("issued")(e.target.value)} /></div>
            <div><Label htmlFor="t-exp">Expiry date</Label><DateInput id="t-exp" value={f.expiry} onChange={e => set("expiry")(e.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="t-note">Note for your Command Head</Label><Textarea id="t-note" maxLength={1000} value={f.reason} onChange={e => set("reason")(e.target.value)} /></div>
            <div className="sm:col-span-2"><Button type="submit" className="w-full sm:w-auto" disabled={!ready || submit.isPending}><Send className="mr-1 h-4 w-4" />Submit for approval</Button></div>
          </form>}
        </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-lg">My training history</CardTitle></CardHeader><CardContent>
        {rows.length ? <ul className="space-y-2">{rows.map(r => <li key={r.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{r.reference}</p><p className="text-muted-foreground">{r.training_status ?? "—"} · {monthLabel(r.training_month)} · {r.location ?? "—"}</p></div>
            <Badge variant={r.status === "pending" ? "secondary" : r.status === "rejected" ? "destructive" : "outline"}>{armoryStatusLabel({ kind: "certification", status: r.status } as never)}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">Expires {formatDisplayDate(r.expiry)}{r.self_submitted ? " · submitted by you" : ""}</p>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">{q.isLoading ? "Loading…" : "No training records yet."}</p>}
      </CardContent></Card>
    </div>
  );
}
