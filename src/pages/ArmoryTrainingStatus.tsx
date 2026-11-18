import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { GraduationCap, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { ArmoryNav } from "@/components/armory/ArmoryNav";
import { useArmoryData } from "@/hooks/useArmoryData";
import { TRAINING_STATUSES, trainingStatusRows, type TrainingStatus } from "@/lib/armoryAnalytics";
import { formatDisplayDate } from "@/lib/armoryPortal";
import { buildCsv } from "@/lib/csv-safe";
import { downloadCSVString } from "@/lib/download-utils";

const ALL: TrainingStatus[] = [...TRAINING_STATUSES, "No training record"];
const WARN: TrainingStatus[] = ["Qualification expired", "Refresher due", "Remedial training required", "Not qualified", "No training record"];
const monthLabel = (m: string | null) => { if (!m) return "—"; const [y, mo] = m.split("-"); return format(new Date(Number(y), Number(mo) - 1, 1), "MMMM yyyy"); };

export default function ArmoryTrainingStatus() {
  const { ctxQ, ctx, recQ, records, refetch } = useArmoryData("armory-training");
  const [params, setParams] = useSearchParams();
  const unit = params.get("command") ?? "";
  useEffect(() => { if (!unit && ctx.commands[0]) setParams({ command: ctx.commands[0].id }, { replace: true }); }, [unit, ctx.commands, setParams]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const today = format(new Date(), "yyyy-MM-dd");
  const rows = useMemo(() => trainingStatusRows(ctx.staff, records, unit, today), [ctx.staff, records, unit, today]);
  const counts = ALL.map(s => ({ s, n: rows.filter(r => r.status === s).length }));
  const q = search.trim().toLowerCase();
  const shown = rows.filter(r => (status === "all" || r.status === status) && (!q || `${r.staff.first_name} ${r.staff.last_name} ${r.staff.staff_id} ${r.location ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => `${a.staff.last_name} ${a.staff.first_name}`.localeCompare(`${b.staff.last_name} ${b.staff.first_name}`));
  const command = ctx.commands.find(c => c.id === unit);

  const exportCsv = async () => {
    const { error } = await supabase.rpc("armory_export_log", { _unit: unit, _kind: "weapon_training_status", _count: shown.length });
    if (error) { toast.error("Export not authorized"); return; }
    downloadCSVString(buildCsv(["Officer", "Staff ID", "Training month", "Location", "Status", "Expiry", "Reference"],
      shown.map(r => [`${r.staff.first_name} ${r.staff.last_name}`, r.staff.staff_id, monthLabel(r.month), r.location ?? "", r.status, formatDisplayDate(r.expiry), r.record?.reference ?? ""])), `weapon-training-${command?.name ?? "command"}-${today}.csv`);
    toast.success("Training status downloaded");
  };

  return (
    <div className="space-y-4 p-2 sm:p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Staff Weapon Training Status</h1></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={!shown.length}><Download className="mr-1 h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      <ArmoryNav />
      {ctxQ.isError || recQ.isError ? <p className="text-sm text-destructive">Training data could not be loaded. Try Refresh.</p> : null}
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div><Label>Command</Label><SearchableSelect value={unit} onValueChange={v => setParams({ command: v })} options={ctx.commands.map(c => ({ value: c.id, label: c.name }))} /></div>
          <div><Label>Training status</Label><SearchableSelect value={status} onValueChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...ALL.map(s => ({ value: s, label: s }))]} /></div>
          <div><Label htmlFor="training-search">Search</Label><Input id="training-search" placeholder="Officer, staff ID or location" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </CardContent></Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Officers</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold text-primary">{rows.length}</p></CardContent></Card>
          {counts.filter(c => c.n || ["Qualified", "Qualification expired", "No training record"].includes(c.s)).map(c => (
            <button key={c.s} type="button" onClick={() => setStatus(status === c.s ? "all" : c.s)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg" aria-pressed={status === c.s}>
              <Card className={status === c.s ? "border-primary" : ""}><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{c.s}</CardTitle></CardHeader><CardContent><p className={`text-2xl font-semibold ${WARN.includes(c.s) && c.n ? "text-destructive" : "text-primary"}`}>{c.n}</p></CardContent></Card>
            </button>))}
        </div>
        <Card><CardHeader><CardTitle className="text-base">Officers in {command?.name ?? "command"}</CardTitle>
          <p className="text-xs text-muted-foreground">Record training under Workspace → Training & Certification (month and year, location, status). Qualified records past expiry show as Qualification expired.</p></CardHeader>
          <CardContent>{recQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !shown.length ? <p className="text-sm text-muted-foreground">No officers match.</p> :
            <PagedSection items={shown} label="officers">{page => <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Training month</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
              <TableBody>{page.map(r => <TableRow key={r.staff.id}><TableCell><div className="font-medium">{r.staff.first_name} {r.staff.last_name}</div><div className="text-xs text-muted-foreground">{r.staff.staff_id}</div></TableCell><TableCell>{monthLabel(r.month)}</TableCell><TableCell>{r.location ?? "—"}</TableCell><TableCell><Badge variant={WARN.includes(r.status) ? "destructive" : "outline"}>{r.status}</Badge></TableCell><TableCell>{formatDisplayDate(r.expiry)}</TableCell></TableRow>)}</TableBody></Table></div>}</PagedSection>}
          </CardContent></Card>
      </>}
    </div>
  );
}
