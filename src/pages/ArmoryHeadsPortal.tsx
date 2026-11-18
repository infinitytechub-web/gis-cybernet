import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ShieldCheck, ClipboardCheck, LayoutDashboard, RefreshCw } from "lucide-react";
import { ArmoryNav } from "@/components/armory/ArmoryNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PagedSection } from "@/components/ui/paged-section";
import { armoryCommandDashboard, type ArmoryContext, type ArmoryRecord } from "@/lib/armory";

/** Command Head Portal: every command the signed-in head is approved to sign for (server-decided can_approve), with armory status. */
export default function ArmoryHeadsPortal() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const ctxQ = useQuery({ queryKey: ["armory-context", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("armory_context"); if (error) throw error; return data as unknown as ArmoryContext; } });
  const heads = (ctxQ.data?.commands ?? []).filter(c => c.can_approve);
  const recQ = useQuery({ queryKey: ["armory-records", user?.id], enabled: !!user && heads.length > 0, refetchInterval: 30000, queryFn: async () => {
    const all: ArmoryRecord[] = [];
    for (let o = 0; ; o += 500) { const { data, error } = await supabase.from("armory_records").select("*").order("created_at", { ascending: false }).order("id").range(o, o + 499); if (error) throw error; all.push(...(data as unknown as ArmoryRecord[])); if (data.length < 500) break; }
    return all; } });
  useEffect(() => {
    const ch = supabase.channel("armory-heads-portal").on("postgres_changes", { event: "*", schema: "public", table: "armory_records" }, () => { void recQ.refetch(); }).subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const today = format(new Date(), "yyyy-MM-dd");
  const rows = useMemo(() => heads.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .map(c => ({ c, d: armoryCommandDashboard(recQ.data ?? [], c.id, today) }))
    .sort((a, b) => b.d.pending.length - a.d.pending.length || a.c.name.localeCompare(b.c.name)), [heads, q, recQ.data, today]);
  const totalPending = rows.reduce((n, r) => n + r.d.pending.length, 0);
  const totalOverdue = rows.reduce((n, r) => n + r.d.inspections.overdue, 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />Command Head Portal</h1>
          <p className="text-sm text-muted-foreground">Armory status and pending approvals for every command you are an approved head of.</p></div>
        <Button variant="outline" size="sm" onClick={() => { void ctxQ.refetch(); void recQ.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <ArmoryNav />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Commands you head</CardDescription><CardTitle className="text-3xl">{heads.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Awaiting your decision</CardDescription><CardTitle className="text-3xl">{totalPending}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Weapons overdue inspection</CardDescription><CardTitle className="text-3xl">{totalOverdue}</CardTitle></CardHeader></Card>
      </div>
      <Input placeholder="Search commands…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search commands" className="max-w-sm" />
      {ctxQ.isLoading || recQ.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
      : ctxQ.error || recQ.error ? <p className="text-sm text-destructive">Could not load armory status. Please refresh.</p>
      : !heads.length ? <Card><CardContent className="py-8 text-center text-muted-foreground">You are not an approved command head for any command. Approval rights are assigned to each command's OIC/2IC or by a Super Admin.</CardContent></Card>
      : <PagedSection items={rows} label="commands" hideSearch>{page => <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{page.map(({ c, d }) => (
          <Card key={c.id}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{c.name}</CardTitle>{!c.active && <Badge variant="outline">Paused</Badge>}</div>
            <CardDescription>{d.pending.length ? `${d.pending.length} awaiting decision` : "Nothing awaiting decision"}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground">Weapons</dt><dd className="font-semibold">{d.weaponsTotal}</dd></div>
                <div><dt className="text-muted-foreground">Issued</dt><dd className="font-semibold">{d.weaponsByStatus.issued}</dd></div>
                <div><dt className="text-muted-foreground">Custody / transfer / inspection pending</dt><dd className="font-semibold">{d.pendingByKind.custody} / {d.pendingByKind.transfer} / {d.pendingByKind.maintenance}</dd></div>
                <div><dt className="text-muted-foreground">Inspection overdue / due 30d</dt><dd className="font-semibold">{d.inspections.overdue} / {d.inspections.dueSoon}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild><Link to={`/armory-weapons/approvals?command=${c.id}`}><ClipboardCheck className="mr-1 h-4 w-4" />Approve requests</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to={`/armory-weapons/dashboard?command=${c.id}`}><LayoutDashboard className="mr-1 h-4 w-4" />Armory status</Link></Button>
              </div>
            </CardContent></Card>))}</div>}</PagedSection>}
    </div>
  );
}
