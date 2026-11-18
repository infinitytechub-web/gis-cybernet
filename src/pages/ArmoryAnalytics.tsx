import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { BarChart3, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { ArmoryNav } from "@/components/armory/ArmoryNav";
import { useArmoryData } from "@/hooks/useArmoryData";
import { commandAnalytics, commandLevel, pct, type CommandLevel } from "@/lib/armoryAnalytics";
import { ARMORY_FIELDS } from "@/lib/armory";

const LEVELS: { value: "all" | CommandLevel; label: string }[] = [
  { value: "all", label: "All commands" }, { value: "hq", label: "Headquarters" }, { value: "regional", label: "Regional Commands" }, { value: "sector", label: "Sector Commands" }, { value: "other", label: "Other units" }];

export default function ArmoryAnalytics() {
  const { ctxQ, ctx, recQ, records, units, refetch } = useArmoryData("armory-analytics");
  const [level, setLevel] = useState<"all" | CommandLevel>("all");
  const today = format(new Date(), "yyyy-MM-dd");
  const typeOf = (id: string) => commandLevel(units.find(u => u.id === id)?.type);
  const commands = ctx.commands.filter(c => level === "all" || typeOf(c.id) === level);
  const rows = useMemo(() => commands.map(c => ({ c, a: commandAnalytics(records, ctx.staff, c.id, today) })), [commands, records, ctx.staff, today]);
  const t = rows.reduce((s, { a }) => ({ weapons: s.weapons + a.weapons, issued: s.issued + a.issued, inStore: s.inStore + a.inStore, maintenance: s.maintenance + a.maintenance, serviceable: s.serviceable + a.serviceable, unserviceable: s.unserviceable + a.unserviceable, overdue: s.overdue + a.overdue, pending: s.pending + a.pending, openCustody: s.openCustody + a.openCustody, ammunition: s.ammunition + a.ammunition, trained: s.trained + a.trained, staff: s.staff + a.staff }),
    { weapons: 0, issued: 0, inStore: 0, maintenance: 0, serviceable: 0, unserviceable: 0, overdue: 0, pending: 0, openCustody: 0, ammunition: 0, trained: 0, staff: 0 });
  const ids = new Set(commands.map(c => c.id));
  const weapons = records.filter(r => r.kind === "weapon" && r.status !== "archived" && ids.has(r.org_unit_id));
  const byType = (ARMORY_FIELDS.weapon.find(f => f.key === "weapon_type")?.options ?? []).map(k => ({ k, n: weapons.filter(w => w.details.weapon_type === k).length })).filter(x => x.n);
  const levelCounts = LEVELS.slice(1).map(l => ({ ...l, n: ctx.commands.filter(c => typeOf(c.id) === l.value).length })).filter(l => l.n);

  const kpi = (label: string, value: string | number, hint?: string, warn?: boolean) => (
    <Card><CardHeader className="pb-1"><CardDescription>{label}</CardDescription></CardHeader><CardContent><p className={`text-2xl font-semibold ${warn ? "text-destructive" : "text-primary"}`}>{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</CardContent></Card>);
  const bar = (n: number, d: number) => <div className="h-2 w-full rounded bg-muted" aria-hidden="true"><div className="h-2 rounded bg-primary" style={{ width: `${pct(n, d)}%` }} /></div>;

  return (
    <div className="space-y-4 p-2 sm:p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Weapon & Armory Analytics</h1></div>
        <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
      </div>
      <ArmoryNav />
      {ctxQ.isError || recQ.isError ? <p className="text-sm text-destructive">Analytics could not be loaded. Try Refresh.</p> : null}
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div><Label>Command level</Label><SearchableSelect value={level} onValueChange={v => setLevel(v as typeof level)} options={LEVELS.map(l => ({ value: l.value, label: l.value === "all" ? l.label : `${l.label} (${ctx.commands.filter(c => typeOf(c.id) === l.value).length})` }))} /></div>
          <div className="flex items-end text-sm text-muted-foreground">{commands.length} of {ctx.commands.length} commands you can see{levelCounts.length ? ` · ${levelCounts.map(l => `${l.label}: ${l.n}`).join(" · ")}` : ""}</div>
        </CardContent></Card>
        {recQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {kpi("Weapons registered", t.weapons, `${t.inStore} in store · ${t.issued} issued`)}
            {kpi("Serviceable", `${pct(t.serviceable, t.weapons)}%`, `${t.serviceable} of ${t.weapons}`)}
            {kpi("Unserviceable / condemned", t.unserviceable, undefined, t.unserviceable > 0)}
            {kpi("Overdue for inspection", t.overdue, "3-month cycle", t.overdue > 0)}
            {kpi("Pending approvals", t.pending, `${t.openCustody} weapons out on custody`)}
            {kpi("Staff weapon-qualified", `${pct(t.trained, t.staff)}%`, `${t.trained} of ${t.staff} officers`)}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Weapon availability</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
              {[["In store", t.inStore], ["Issued", t.issued], ["In maintenance", t.maintenance]].map(([l, n]) => <div key={l as string} className="space-y-1"><div className="flex justify-between"><span>{l}</span><span className="font-medium">{n} · {pct(n as number, t.weapons)}%</span></div>{bar(n as number, t.weapons)}</div>)}
              <p className="text-xs text-muted-foreground">Ammunition reconciled: {t.ammunition.toLocaleString()} rounds</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Weapons by type</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
              {byType.length ? byType.map(({ k, n }) => <div key={k} className="space-y-1"><div className="flex justify-between"><span>{k}</span><span className="font-medium">{n}</span></div>{bar(n, weapons.length)}</div>) : <p className="text-muted-foreground">No weapons registered.</p>}
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">By command</CardTitle><CardDescription>Open a command to see its dashboard.</CardDescription></CardHeader><CardContent>
            <PagedSection items={rows} label="commands">{page => <div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Command</TableHead><TableHead>Level</TableHead><TableHead className="text-right">Weapons</TableHead><TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Serviceable</TableHead><TableHead className="text-right">Overdue insp.</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Qualified staff</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{page.map(({ c, a }) => <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{LEVELS.find(l => l.value === typeOf(c.id))?.label}</TableCell><TableCell className="text-right">{a.weapons}</TableCell><TableCell className="text-right">{a.issued}</TableCell><TableCell className="text-right">{pct(a.serviceable, a.weapons)}%</TableCell><TableCell className={`text-right ${a.overdue ? "font-semibold text-destructive" : ""}`}>{a.overdue}</TableCell><TableCell className="text-right">{a.pending}</TableCell><TableCell className="text-right">{a.trained}/{a.staff}</TableCell>
                <TableCell><Button variant="link" size="sm" className="h-auto px-0" asChild><Link to={`/armory-weapons/dashboard?command=${c.id}`}>Dashboard</Link></Button></TableCell></TableRow>)}</TableBody></Table></div>}</PagedSection>
          </CardContent></Card>
        </>}
      </>}
    </div>
  );
}
