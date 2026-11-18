import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw, LayoutDashboard, ClipboardCheck, Wrench, Award, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { ARMORY_LABELS, armoryCommandDashboard, armoryStatusLabel, type ArmoryContext, type ArmoryRecord } from "@/lib/armory";

const KIND: Record<string, string> = { custody: "Custody", transfer: "Transfer", maintenance: "Inspection" };

export default function ArmoryCommandDashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const ctx = ctxQ.data ?? { commands: [], staff: [] };
  const unit = params.get("command") ?? "";
  useEffect(() => { if (!unit && ctx.commands[0]) setParams({ command: ctx.commands[0].id }, { replace: true }); }, [unit, ctx.commands, setParams]);
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && !!ctx.commands.length, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  const [, tick] = useState(0);
  useEffect(() => {
    const ch = supabase.channel("armory-cmd-dash").on("postgres_changes", { event: "*", schema: "public", table: "armory_records" }, () => { void recQ.refetch(); tick(n => n + 1); }).subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const today = format(new Date(), "yyyy-MM-dd");
  const command = ctx.commands.find(c => c.id === unit);
  const d = armoryCommandDashboard(recQ.data ?? [], unit, today);
  const cmd = (id: string | null) => ctx.commands.find(c => c.id === id)?.name ?? "Other command";

  const tile = (title: string, Icon: typeof Award, value: number, lines: [string, number, boolean?][], to: string) => (
    <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" aria-hidden="true" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2"><p className="text-3xl font-semibold text-primary">{value}</p>
        <ul className="space-y-1 text-sm">{lines.map(([l, n, warn]) => <li key={l} className="flex justify-between gap-2"><span className="text-muted-foreground">{l}</span><span className={warn && n ? "font-semibold text-destructive" : "font-medium"}>{n}</span></li>)}</ul>
        <Button variant="link" size="sm" className="h-auto px-0" asChild><Link to={to}>Open</Link></Button></CardContent></Card>);

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><LayoutDashboard className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Armory Command Dashboard</h1></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/armory-weapons"><ArrowLeft className="mr-1 h-4 w-4" />Armory & Weapons</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/armory-weapons/report">Armory Report</Link></Button>
          <Button variant="outline" size="sm" onClick={() => { void ctxQ.refetch(); void recQ.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      {ctxQ.isError || recQ.isError ? <p className="text-sm text-destructive">Armory data could not be loaded. Try Refresh.</p> : null}
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div><Label>Command</Label><SearchableSelect value={unit} onValueChange={v => setParams({ command: v })} options={ctx.commands.map(c => ({ value: c.id, label: c.name }))} /></div>
          <div className="flex items-end gap-2 text-sm text-muted-foreground">{command && <>{command.active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Paused</Badge>}{command.can_approve && <Badge variant="outline">You can approve</Badge>}<span>Updates automatically</span></>}</div>
        </CardContent></Card>
        {recQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tile("Pending approvals", ClipboardCheck, d.pending.length, [["Custody", d.pendingByKind.custody], ["Transfers (incl. incoming)", d.pendingByKind.transfer], ["Inspections", d.pendingByKind.maintenance], ["Other registers", d.pendingByKind.other]], "/armory-weapons/approvals")}
            {tile("Inspections", Wrench, d.inspections.scheduled + d.inspections.inProgress + d.inspections.awaiting, [["Scheduled", d.inspections.scheduled], ["In progress", d.inspections.inProgress], ["Awaiting approval", d.inspections.awaiting], ["Approved", d.inspections.approved], ["Review overdue", d.inspections.overdue, true]], "/armory-weapons/report")}
            {tile("Certifications", Award, d.certifications.valid + d.certifications.expiring + d.certifications.pending, [["Awaiting verification", d.certifications.pending], ["Valid", d.certifications.valid], ["Expiring in 30 days", d.certifications.expiring, true], ["Expired", d.certifications.expired, true]], "/armory-weapons/report")}
            {tile("Weapons", Crosshair, d.weaponsTotal, [["In store", d.weaponsByStatus.in_store], ["Reserved", d.weaponsByStatus.reserved], ["Issued", d.weaponsByStatus.issued], ["Out of service", d.weaponsByStatus.maintenance]], "/armory-weapons")}
          </div>
          <Card><CardHeader><CardTitle className="text-base">Weapons by condition</CardTitle><CardDescription>{command?.name}</CardDescription></CardHeader><CardContent className="space-y-2">
            {d.weaponsByCondition.filter(c => c.condition !== "Not set" || c.count).map(c => { const pct = d.weaponsTotal ? Math.round((c.count / d.weaponsTotal) * 100) : 0; const bad = ["Unserviceable", "Condemned"].includes(c.condition);
              return <div key={c.condition} className="space-y-1"><div className="flex justify-between text-sm"><span>{c.condition}</span><span className="font-medium">{c.count} · {pct}%</span></div>
                <div className="h-2 rounded-full bg-muted" role="img" aria-label={`${c.condition}: ${c.count} weapons`}><div className={`h-2 rounded-full ${bad ? "bg-destructive" : c.condition === "Needs Maintenance" ? "bg-accent" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div></div>; })}
            {!d.weaponsTotal && <p className="text-sm text-muted-foreground">No weapons registered in this command.</p>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Waiting on a decision</CardTitle></CardHeader><CardContent>
            <PagedSection items={d.pending} label="records">{rows => <Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Command</TableHead><TableHead>Open</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell><div className="font-medium">{r.reference}</div><div className="text-xs text-muted-foreground">{r.title}</div></TableCell><TableCell>{KIND[r.kind] ?? ARMORY_LABELS[r.kind]}</TableCell><TableCell><Badge variant="outline">{r.kind === "transfer" && r.destination_unit_id === unit && r.status === "handed_over" ? "Awaiting receipt" : armoryStatusLabel(r)}</Badge></TableCell><TableCell>{cmd(r.org_unit_id)}</TableCell>
                <TableCell><Button variant="link" size="sm" className="h-auto px-0" asChild><Link to={r.asset_id ? `/armory-weapons/lifecycle?weapon=${r.asset_id}` : "/armory-weapons/approvals"}>{r.asset_id ? "Weapon history" : "Approvals"}</Link></Button></TableCell></TableRow>)}
                {!rows.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nothing is waiting on a decision.</TableCell></TableRow>}</TableBody></Table>}</PagedSection>
          </CardContent></Card>
        </>}
      </>}
    </div>
  );
}
