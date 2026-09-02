import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, CircleDollarSign, FileText, FolderKanban, Gauge, RefreshCw, ShieldAlert, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date-format";
import { toast } from "sonner";

const db = supabase as any;
type Row = Record<string, any>;

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Activity }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p></div></CardContent></Card>;
}

function titleCase(value: unknown) { return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function CommandCenterDashboard() {
  const [summary, setSummary] = useState<Row | null>(null);
  const [attention, setAttention] = useState<Row | null>(null);
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: command, error: commandError }, { data: alertData, error: alertError }] = await Promise.all([
      db.rpc("me_command_center"),
      db.rpc("me_command_attention", { _region: region.trim() || null }),
    ]);
    if (commandError) toast.error(commandError.message);
    if (alertError) toast.error(alertError.message);
    setSummary(commandError ? null : command);
    setAttention(alertError ? null : alertData);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [region]);

  const healthData = useMemo(() => [
    { name: "On track", value: Number(summary?.projects?.on_track ?? 0) },
    { name: "At risk", value: Number(summary?.projects?.at_risk ?? 0) },
    { name: "Critical", value: Number(summary?.projects?.critical ?? 0) },
    { name: "Completed", value: Number(summary?.projects?.completed ?? 0) },
  ], [summary]);

  if (loading && !summary) return <div className="py-16 text-center text-muted-foreground" role="status">Loading command metrics…</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">National performance overview</p><h1 className="text-2xl font-bold tracking-tight">M&E Command Center</h1><p className="mt-1 text-sm text-muted-foreground">Live figures from strategy, delivery, assurance and field reporting.</p></div><div className="flex items-center gap-2"><Input className="w-40" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Filter region" aria-label="Filter by region" /><Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh command metrics"><RefreshCw className="h-4 w-4" /></Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Stat label="Strategic objectives" value={summary?.objectives?.total ?? 0} icon={Target} /><Stat label="Programs" value={summary?.programs?.total ?? 0} icon={FolderKanban} /><Stat label="Active projects" value={summary?.projects?.active ?? 0} icon={Activity} /><Stat label="Average completion" value={`${summary?.projects?.avg_complete ?? 0}%`} icon={Gauge} /><Stat label="Open approvals" value={attention?.approvals?.pending ?? summary?.approvals?.pending ?? 0} icon={CheckCircle2} /><Stat label="Reports for review" value={attention?.approvals ? (attention?.reports_pending?.length ?? 0) : (summary?.field_reports?.pending_review ?? 0)} icon={FileText} /></div>
    <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
      <Card><CardHeader><CardTitle>Portfolio health</CardTitle></CardHeader><CardContent><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={healthData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="value" name="Projects" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Budget snapshot</CardTitle></CardHeader><CardContent className="space-y-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Approved</p><p className="text-2xl font-semibold">GHS {Number(summary?.budget?.approved ?? 0).toLocaleString()}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Committed</p><p className="font-medium">GHS {Number(summary?.budget?.committed ?? 0).toLocaleString()}</p></div><div><p className="text-muted-foreground">Spent</p><p className="font-medium">GHS {Number(summary?.budget?.spent ?? 0).toLocaleString()}</p></div></div></CardContent></Card>
    </div>
    <div className="grid gap-6 lg:grid-cols-3"><Card><CardHeader><CardTitle>Approval attention</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Open</span><span className="font-semibold">{attention?.approvals?.pending ?? 0}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Overdue</span><span className="font-semibold text-destructive">{attention?.approvals?.overdue ?? 0}</span></div><div className="flex justify-between"><span className="text-muted-foreground">My review queue</span><span className="font-semibold">{attention?.approvals?.mine ?? 0}</span></div></CardContent></Card><Card><CardHeader><CardTitle>Top risks</CardTitle></CardHeader><CardContent className="space-y-2">{(attention?.top_risks ?? []).length ? attention.top_risks.map((risk: Row) => <div key={risk.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0"><span className="truncate text-sm">{risk.title ?? risk.ref_code}</span><Badge variant="destructive">{risk.risk_score ?? titleCase(risk.risk_level)}</Badge></div>) : <p className="text-sm text-muted-foreground">No open risks in this scope.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Recent field reports</CardTitle></CardHeader><CardContent className="space-y-2">{(attention?.recent_reports ?? []).length ? attention.recent_reports.map((report: Row) => <div key={report.id} className="border-b pb-2 last:border-0"><p className="truncate text-sm font-medium">{report.title ?? report.ref_code}</p><p className="text-xs text-muted-foreground">{titleCase(report.status)} · {formatDate(report.reported_at)}</p></div>) : <p className="text-sm text-muted-foreground">No field reports in this scope.</p>}</CardContent></Card></div>
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Open risks" value={summary?.risks?.open ?? 0} icon={AlertTriangle} /><Stat label="Critical incidents" value={summary?.incidents?.critical ?? 0} icon={ShieldAlert} /><Stat label="Budget utilisation" value={`${summary?.budget?.utilization ?? 0}%`} icon={CircleDollarSign} /></div>
  </div>;
}
