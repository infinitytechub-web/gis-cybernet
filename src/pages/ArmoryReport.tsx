import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, RefreshCw, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { ArmoryNav } from "@/components/armory/ArmoryNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { buildCsv } from "@/lib/csv-safe";
import { downloadCSVString } from "@/lib/download-utils";
import { ARMORY_LABELS, ARMORY_REPORT_KINDS, armoryReportEntries, armoryMonthlyReport, armoryReportTotals, armoryStatusBreakdown, armoryStatusLabel, type ArmoryContext, type ArmoryRecord } from "@/lib/armory";

const KIND_SHORT: Record<string, string> = { custody: "Custody", transfer: "Transfers", maintenance: "Inspections", certification: "Certifications" };
const monthLabel = (m: string) => { const d = new Date(`${m}-01T00:00:00`); return Number.isNaN(d.getTime()) ? m : format(d, "MMMM yyyy"); };

export default function ArmoryReport() {
  const { user } = useAuth();
  const { formatStaffId } = useStaffIdDisplay("directory");
  const [unit, setUnit] = useState("all");
  const [fromMonth, setFromMonth] = useState("all");
  const [toMonth, setToMonth] = useState("all");
  const [kind, setKind] = useState("all");
  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const ctx = ctxQ.data ?? { commands: [], staff: [] };
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && !!ctx.commands.length, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  const today = format(new Date(), "yyyy-MM-dd");
  const visibleUnits = useMemo(() => new Set(ctx.commands.map(c => c.id)), [ctx.commands]);
  const allEntries = useMemo(() => armoryReportEntries(recQ.data ?? []).filter(e => visibleUnits.has(e.unitId)), [recQ.data, visibleUnits]);
  const months = useMemo(() => [...new Set(allEntries.map(e => e.month))].sort().reverse(), [allEntries]);
  const entries = allEntries.filter(e => (unit === "all" || e.unitId === unit) && (kind === "all" || e.record.kind === kind)
    && (fromMonth === "all" || e.month >= fromMonth) && (toMonth === "all" || e.month <= toMonth));
  const rows = armoryMonthlyReport(entries);
  const totals = armoryReportTotals(entries, today);
  const cmdName = (id: string) => ctx.commands.find(c => c.id === id)?.name ?? "Other command";
  const staff = (id: string | null, exp = false) => { const p = ctx.staff.find(s => s.id === id); return p ? `${p.first_name} ${p.last_name} · ${formatStaffId(p.staff_id, { ownerUserId: p.user_id, context: exp ? "export" : "directory" })}` : "—"; };
  const monthOpts = [{ value: "all", label: "Any month" }, ...months.map(m => ({ value: m, label: monthLabel(m) }))];

  const exportCsv = async () => {
    const logUnits = unit === "all" ? [...new Set(entries.map(e => e.unitId))].filter(u => visibleUnits.has(u)) : [unit];
    try { for (const u of logUnits.length ? logUnits : [ctx.commands[0]?.id].filter(Boolean) as string[]) await supabase.rpc("armory_export_log", { _unit: u, _kind: "monthly_report", _count: entries.filter(e => e.unitId === u).length }).then(r => { if (r.error) throw r.error; }); }
    catch { toast.error("Export not authorized"); return; }
    const summary = buildCsv(["Command", "Month", "Custody", "Transfers", "Inspections", "Certifications", "Total"], rows.map(r => [cmdName(r.unitId), monthLabel(r.month), r.custody, r.transfer, r.maintenance, r.certification, r.total]));
    const detail = buildCsv(["Date", "Command", "Type", "Direction", "Reference", "Title", "Status", "Officer"], entries.map(e => [format(new Date(`${e.date}T00:00:00`), "dd/MM/yyyy"), cmdName(e.unitId), KIND_SHORT[e.record.kind], e.side ?? "", e.record.reference, e.record.title, armoryStatusLabel(e.record), staff(e.record.profile_id, true)]));
    downloadCSVString(`${summary}\n\n${detail}`, `armory-report-${today}.csv`);
    toast.success("Report downloaded");
  };

  const cards: [string, number, string][] = [
    ["Custody issued", totals.custodyIssued, `${totals.custodyReturned} returned · ${totals.custodyOut} still out`],
    ["Transfers", totals.transfersSent + totals.transfersReceived, `${totals.transfersSent} outgoing · ${totals.transfersReceived} incoming`],
    ["Inspections", totals.inspectionsDone + totals.inspectionsPending, `${totals.inspectionsDone} done · ${totals.inspectionsPending} pending`],
    ["Certifications", totals.certValid + totals.certExpiring + totals.certExpired, `${totals.certValid} valid · ${totals.certExpiring} expiring · ${totals.certExpired} expired`],
  ];
  const sum = (k: "custody" | "transfer" | "maintenance" | "certification" | "total") => rows.reduce((n, r) => n + r[k], 0);

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><FileBarChart className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Armory Report</h1></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { void ctxQ.refetch(); void recQ.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
          <Button size="sm" onClick={exportCsv} disabled={!entries.length}><Download className="mr-1 h-4 w-4" />Download CSV</Button>
        </div>
      </div>
      <ArmoryNav />
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label>Command</Label><SearchableSelect value={unit} onValueChange={setUnit} options={[{ value: "all", label: "All my commands" }, ...ctx.commands.map(c => ({ value: c.id, label: c.name }))]} /></div>
        <div><Label>From month</Label><SearchableSelect value={fromMonth} onValueChange={setFromMonth} options={monthOpts} /></div>
        <div><Label>To month</Label><SearchableSelect value={toMonth} onValueChange={setToMonth} options={monthOpts} /></div>
        <div><Label>Record type</Label><SearchableSelect value={kind} onValueChange={setKind} options={[{ value: "all", label: "All four types" }, ...ARMORY_REPORT_KINDS.map(k => ({ value: k, label: ARMORY_LABELS[k] }))]} /></div>
      </CardContent></Card>
      {recQ.isError && <Card><CardContent className="flex items-center justify-between p-4 text-sm text-destructive">Could not load armory records.<Button size="sm" variant="outline" onClick={() => recQ.refetch()}>Retry</Button></CardContent></Card>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([t, v, s]) => <Card key={t}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{t}</p><p className="text-2xl font-bold">{recQ.isLoading ? "…" : v}</p><p className="text-xs text-muted-foreground">{s}</p></CardContent></Card>)}
      </div>
      <Card><CardHeader><CardTitle className="text-base">Lifecycle status</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
        {(["custody", "transfer", "maintenance"] as const).map(k => { const recs = [...new Map(entries.map(e => [e.record.id, e.record])).values()]; const rowsB = armoryStatusBreakdown(recs, k); return (
          <div key={k}><p className="mb-2 text-sm font-medium">{KIND_SHORT[k]}</p><ul className="space-y-1 text-sm">{rowsB.map(b => <li key={b.status} className="flex justify-between gap-2 border-b py-1"><span>{armoryStatusLabel({ kind: k, status: b.status })}</span><strong className={b.count ? "text-primary" : "text-muted-foreground"}>{b.count}</strong></li>)}</ul></div>); })}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">By command and month</CardTitle></CardHeader><CardContent>
        <PagedSection items={rows} label="command months" searchText={r => `${cmdName(r.unitId)} ${monthLabel(r.month)}`}>{page => <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Command</TableHead><TableHead>Month</TableHead><TableHead className="text-right">Custody</TableHead><TableHead className="text-right">Transfers</TableHead><TableHead className="text-right">Inspections</TableHead><TableHead className="text-right">Certifications</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>
          {page.length ? page.map(r => <TableRow key={`${r.unitId}${r.month}`}><TableCell>{cmdName(r.unitId)}</TableCell><TableCell>{monthLabel(r.month)}</TableCell><TableCell className="text-right">{r.custody}</TableCell><TableCell className="text-right">{r.transfer}</TableCell><TableCell className="text-right">{r.maintenance}</TableCell><TableCell className="text-right">{r.certification}</TableCell><TableCell className="text-right font-semibold">{r.total}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No records for these filters.</TableCell></TableRow>}
          {rows.length > 0 && <TableRow className="font-semibold"><TableCell colSpan={2}>Grand total</TableCell><TableCell className="text-right">{sum("custody")}</TableCell><TableCell className="text-right">{sum("transfer")}</TableCell><TableCell className="text-right">{sum("maintenance")}</TableCell><TableCell className="text-right">{sum("certification")}</TableCell><TableCell className="text-right">{sum("total")}</TableCell></TableRow>}
        </TableBody></Table></div>}</PagedSection>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Records</CardTitle></CardHeader><CardContent>
        <PagedSection items={entries} label="records" searchText={e => `${e.record.reference} ${e.record.title} ${e.record.status} ${cmdName(e.unitId)} ${staff(e.record.profile_id)}`}>{page => <div className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Command</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead>Officer</TableHead></TableRow></TableHeader><TableBody>
          {page.length ? page.map(e => <TableRow key={`${e.record.id}${e.side ?? ""}`}><TableCell>{format(new Date(`${e.date}T00:00:00`), "dd/MM/yyyy")}</TableCell><TableCell>{cmdName(e.unitId)}</TableCell><TableCell>{KIND_SHORT[e.record.kind]}{e.side ? ` (${e.side})` : ""}</TableCell><TableCell><div className="font-medium">{e.record.reference}</div><div className="text-xs text-muted-foreground">{e.record.title}</div></TableCell><TableCell><Badge variant="outline" className="capitalize">{e.record.status.replace(/_/g, " ")}</Badge></TableCell><TableCell>{staff(e.record.profile_id)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records for these filters.</TableCell></TableRow>}
        </TableBody></Table></div>}</PagedSection>
      </CardContent></Card></>}
      <QuickScroll />
    </div>
  );
}
