import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PagedSection } from "@/components/ui/paged-section";
import { buildCsv } from "@/lib/csv-safe";
import { downloadCSVString } from "@/lib/download-utils";
import { weaponLifecycle, weaponServiceSummary, weaponNextInspection, type ArmoryContext, type ArmoryRecord } from "@/lib/armory";

const KIND: Record<string, string> = { custody: "Custody", transfer: "Transfer", maintenance: "Inspection" };
const d = (s?: string | null) => { if (!s) return "—"; const x = new Date(s.length === 10 ? `${s}T00:00:00` : s); return Number.isNaN(x.getTime()) ? s : format(x, "dd/MM/yyyy"); };
const st = (s: string) => s.replace(/_/g, " ");

export default function WeaponLifecycle() {
  const { user } = useAuth();
  const { formatStaffId } = useStaffIdDisplay("directory");
  const [params, setParams] = useSearchParams();
  const weaponId = params.get("weapon") ?? "";
  const [kind, setKind] = useState("all");
  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const ctx = ctxQ.data ?? { commands: [], staff: [] };
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && !!ctx.commands.length, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  const records = recQ.data ?? [];
  const weapons = records.filter(r => r.kind === "weapon");
  const weapon = weapons.find(w => w.id === weaponId);
  const today = format(new Date(), "yyyy-MM-dd");
  const history = useMemo(() => weaponLifecycle(records, weaponId), [records, weaponId]);
  const shown = history.filter(e => kind === "all" || e.kind === kind);
  const baseSummary = weaponServiceSummary(history, today);
  const autoNext = weapon ? weaponNextInspection(weapon, records) : baseSummary.nextReview;
  const summary = { ...baseSummary, nextReview: autoNext, reviewOverdue: !!autoNext && autoNext < today };
  const cmd = (id: string | null) => ctx.commands.find(c => c.id === id)?.name ?? (id ? "Other command" : "—");
  const staff = (id: string | null, exp = false) => { const p = ctx.staff.find(s => s.id === id); return p ? `${p.first_name} ${p.last_name} · ${formatStaffId(p.staff_id, { ownerUserId: p.user_id, context: exp ? "export" : "directory" })}` : "—"; };
  const detailText = (r: ArmoryRecord) => r.kind === "custody" ? `Issued to ${staff(r.profile_id)}${r.details.purpose ? ` · ${r.details.purpose}` : ""}`
    : r.kind === "transfer" ? `${cmd(r.org_unit_id)} → ${cmd(r.destination_unit_id)}`
    : `${r.details.category ?? "Inspection"}${r.details.officer ? ` · ${r.details.officer}` : ""}${r.details.next_review ? ` · next review ${d(r.details.next_review)}` : ""}`;

  const exportCsv = async () => {
    if (!weapon) return;
    const { error } = await supabase.rpc("armory_export_log", { _unit: weapon.org_unit_id, _kind: "weapon_service_report", _count: history.length });
    if (error) { toast.error("Export not authorized"); return; }
    const head = buildCsv(["Serial", "Registration", "Type", "Model", "Condition", "Status", "Command", "Custody issues", "Open custody", "Transfers", "Transfers completed", "Inspections", "Inspections approved", "Last inspection", "Next review", "Review overdue"],
      [[weapon.details.serial ?? "", weapon.details.registration ?? "", weapon.details.weapon_type ?? "", weapon.details.model ?? "", weapon.details.condition ?? "", weapon.status, cmd(weapon.org_unit_id), summary.custodyIssues, summary.custodyOpen, summary.transfers, summary.transfersCompleted, summary.inspections, summary.inspectionsApproved, d(summary.lastInspection), d(summary.nextReview), summary.reviewOverdue ? "Yes" : "No"]]);
    const body = buildCsv(["Date", "Event", "Reference", "Title", "Details", "Status"], history.map(e => [d(e.date), KIND[e.kind], e.record.reference, e.record.title, e.kind === "custody" ? `Issued to ${staff(e.record.profile_id, true)}` : detailText(e.record), e.record.status]));
    downloadCSVString(`${head}\n\n${body}`, `weapon-service-${weapon.details.serial ?? weapon.reference}-${today}.csv`);
    toast.success("Service report downloaded");
  };

  const cards: [string, string, string][] = [
    ["Custody issues", String(summary.custodyIssues), `${summary.custodyOpen} currently out`],
    ["Transfers", String(summary.transfers), `${summary.transfersCompleted} completed`],
    ["Inspections", String(summary.inspections), `${summary.inspectionsApproved} approved`],
    ["Next review", d(summary.nextReview), summary.reviewOverdue ? "Overdue" : summary.lastInspection ? `Last inspected ${d(summary.lastInspection)}` : "Never inspected"],
  ];

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><History className="h-6 w-6 text-primary" aria-hidden="true" /><h1 className="text-xl font-bold sm:text-2xl">Weapon Lifecycle</h1></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/armory-weapons"><ArrowLeft className="mr-1 h-4 w-4" />Armory & Weapons</Link></Button>
          <Button variant="outline" size="sm" onClick={() => { void ctxQ.refetch(); void recQ.refetch(); }}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
          <Button size="sm" onClick={exportCsv} disabled={!weapon}><Download className="mr-1 h-4 w-4" />Service report CSV</Button>
        </div>
      </div>
      {ctxQ.isSuccess && !ctx.commands.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">You have no armory access for any command.</CardContent></Card> : <>
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div><Label>Weapon</Label><SearchableSelect value={weaponId} onValueChange={v => setParams(v ? { weapon: v } : {})} placeholder="Search serial, type or model"
            options={weapons.map(w => ({ value: w.id, label: `${w.details.serial ?? w.reference} · ${w.details.weapon_type ?? "Weapon"} ${w.details.model ?? w.title} · ${cmd(w.org_unit_id)}${w.status === "archived" ? " · deleted" : ""}` }))} /></div>
          <div><Label>Event type</Label><SearchableSelect value={kind} onValueChange={setKind} options={[{ value: "all", label: "All events" }, { value: "custody", label: "Custody" }, { value: "transfer", label: "Transfers" }, { value: "maintenance", label: "Inspections" }]} /></div>
        </CardContent></Card>
        {recQ.isError && <p className="text-sm text-destructive">Armory records could not be loaded.</p>}
        {!weapon ? <Card><CardContent className="p-6 text-sm text-muted-foreground">{recQ.isLoading ? "Loading weapons…" : weapons.length ? "Pick a weapon to see its history and service report." : "No weapons are registered in your commands yet."}</CardContent></Card> : <>
          <Card><CardHeader><CardTitle className="text-base">Service report · {weapon.details.serial ?? weapon.reference}</CardTitle>
            <CardDescription>{[weapon.details.weapon_type, weapon.details.manufacturer, weapon.details.model].filter(Boolean).join(" ")} · Registration {weapon.details.registration ?? "—"} · {cmd(weapon.org_unit_id)}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2"><Badge variant={["Unserviceable", "Condemned"].includes(weapon.details.condition ?? "") ? "destructive" : "outline"}>{weapon.details.condition ?? "Condition not set"}</Badge><Badge variant="outline" className="capitalize">{st(weapon.status)}</Badge>{summary.reviewOverdue && <Badge variant="destructive">Review overdue</Badge>}</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([l, v, s]) => <div key={l} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold text-primary">{v}</div><div className="text-xs text-muted-foreground">{s}</div></div>)}</div>
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader><CardContent>
            <PagedSection items={shown} label="events">{rows => <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Event</TableHead><TableHead>Reference</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map(e => <TableRow key={e.record.id}><TableCell className="whitespace-nowrap">{d(e.date)}</TableCell><TableCell>{KIND[e.kind]}</TableCell><TableCell><div className="font-medium">{e.record.reference}</div><div className="text-xs text-muted-foreground">{e.record.title}</div></TableCell><TableCell>{detailText(e.record)}</TableCell><TableCell><Badge variant="outline" className="capitalize">{st(e.record.status)}</Badge></TableCell></TableRow>)}
                {!rows.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No custody, transfer or inspection records for this weapon.</TableCell></TableRow>}</TableBody></Table>}</PagedSection>
          </CardContent></Card>
        </>}
      </>}
    </div>
  );
}
