import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crosshair, ClipboardCheck, UserRound, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { armoryStatusLabel } from "@/lib/armory";
import { formatDisplayDate } from "@/lib/armoryPortal";

type Weapon = { id: string; serial?: string; model?: string; type?: string; condition?: string; status?: string };
type Custody = { id: string; reference: string; title: string; status: string; created_at: string; due_date?: string; purpose?: string; weapon: Weapon };
type Inspection = { id: string; reference: string; status: string; date?: string; next_review?: string; category?: string; serial?: string; model?: string };
type Auth = { id: string; kind: string; reference: string; title: string; status: string; expiry?: string };
type Portal = { profile: null | Record<string, string | null>; custody: Custody[]; inspections: Inspection[]; authorizations: Auth[] };

export const OPEN_CUSTODY = ["approved", "handed_over", "acknowledged", "discrepancy"];

export default function ArmoryOfficerPortal() {
  const q = useQuery({
    queryKey: ["armory-my-portal"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("armory_my_portal" as never);
      if (error) throw error;
      return data as unknown as Portal;
    },
    refetchInterval: 30000,
  });
  const d = q.data;
  const issued = (d?.custody ?? []).filter((c) => OPEN_CUSTODY.includes(c.status));
  const history = (d?.custody ?? []).filter((c) => !OPEN_CUSTODY.includes(c.status));
  const p = d?.profile;

  return (
    <div className="space-y-4 p-2 sm:p-4 md:p-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">My Armory Portal</h1>
          <p className="text-sm text-muted-foreground">Your issued weapons, upcoming inspections and profile.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      {q.isError && <Card><CardContent className="p-4 text-sm text-destructive">Could not load your armory details. Try again.</CardContent></Card>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {d && !p && <Card><CardContent className="p-4 text-sm">No staff profile is linked to your account.</CardContent></Card>}
      {p && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Card><CardHeader className="pb-2"><CardDescription className="flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:text-sm"><Crosshair className="h-4 w-4" />Weapons on issue</CardDescription><CardTitle className="text-2xl sm:text-3xl">{issued.length}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription className="flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:text-sm"><ClipboardCheck className="h-4 w-4" />Upcoming inspections</CardDescription><CardTitle className="text-2xl sm:text-3xl">{d.inspections.length}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription className="flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:text-sm"><ShieldCheck className="h-4 w-4" />Authorizations & certificates</CardDescription><CardTitle className="text-2xl sm:text-3xl">{d.authorizations.length}</CardTitle></CardHeader></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="h-5 w-5" />My profile</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[["Name", p.name], ["Staff ID", p.staff_id], ["Rank", p.rank], ["Grade", p.grade], ["Command", p.command], ["Status", p.status], ["Email", p.email], ["Phone", p.phone]].map(([k, v]) => (
                <div key={k as string}><div className="text-muted-foreground">{k}</div><div className="font-medium break-words">{v || "—"}</div></div>
              ))}
            </CardContent>
          </Card>

          <Section title="Issued weapons" empty="No weapons are issued to you right now.">
            {issued.length > 0 && <CustodyTable rows={issued} />}
          </Section>
          <Section title="Upcoming inspections" empty="No inspections are scheduled for weapons you hold.">
            {d.inspections.length > 0 && (<>
              <MobileList items={d.inspections.map((i) => ({ id: i.id, title: `${i.serial ?? ""} · ${i.model ?? ""}`, badge: armoryStatusLabel({ kind: "maintenance", status: i.status } as never), lines: [["Reference", i.reference], ["Category", i.category || "—"], ["Inspected", formatDisplayDate(i.date)], ["Next review", formatDisplayDate(i.next_review)]] }))} />
              <div className="hidden overflow-x-auto sm:block"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Weapon</TableHead><TableHead>Category</TableHead><TableHead>Date</TableHead><TableHead>Next review</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{d.inspections.map((i) => <TableRow key={i.id}><TableCell>{i.reference}</TableCell><TableCell>{i.serial} · {i.model}</TableCell><TableCell>{i.category || "—"}</TableCell><TableCell>{formatDisplayDate(i.date)}</TableCell><TableCell>{formatDisplayDate(i.next_review)}</TableCell><TableCell><Badge variant="outline">{armoryStatusLabel({ kind: "maintenance", status: i.status } as never)}</Badge></TableCell></TableRow>)}</TableBody></Table></div>
            </>)}
          </Section>
          <Section title="Authorizations & certificates" empty="No firearm authorizations or certificates on record.">
            {d.authorizations.length > 0 && (<>
              <MobileList items={d.authorizations.map((a) => ({ id: a.id, title: a.title, badge: armoryStatusLabel({ kind: a.kind, status: a.status } as never), lines: [["Reference", a.reference], ["Type", a.kind === "personnel" ? "Authorization" : "Certificate"], ["Expiry", formatDisplayDate(a.expiry)]] }))} />
              <div className="hidden overflow-x-auto sm:block"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{d.authorizations.map((a) => <TableRow key={a.id}><TableCell>{a.reference}</TableCell><TableCell>{a.title}</TableCell><TableCell>{a.kind === "personnel" ? "Authorization" : "Certificate"}</TableCell><TableCell>{formatDisplayDate(a.expiry)}</TableCell><TableCell><Badge variant="outline">{armoryStatusLabel({ kind: a.kind, status: a.status } as never)}</Badge></TableCell></TableRow>)}</TableBody></Table></div>
            </>)}
          </Section>
          <Section title="Custody history" empty="No past custody records.">
            {history.length > 0 && <CustodyTable rows={history} />}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent>{children || <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function CustodyTable({ rows }: { rows: Custody[] }) {
  return (
    <>
    <MobileList items={rows.map((c) => ({ id: c.id, title: `${c.weapon?.serial ?? ""} · ${c.weapon?.type ?? ""} ${c.weapon?.model ?? ""}`, badge: armoryStatusLabel({ kind: "custody", status: c.status } as never), lines: [["Reference", c.reference], ["Condition", c.weapon?.condition || "—"], ["Purpose", c.purpose || "—"], ["Due back", formatDisplayDate(c.due_date)]] }))} />
    <div className="hidden overflow-x-auto sm:block"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Weapon</TableHead><TableHead>Condition</TableHead><TableHead>Purpose</TableHead><TableHead>Due back</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((c) => <TableRow key={c.id}><TableCell>{c.reference}</TableCell><TableCell>{c.weapon?.serial} · {c.weapon?.type} {c.weapon?.model}</TableCell><TableCell>{c.weapon?.condition || "—"}</TableCell><TableCell>{c.purpose || "—"}</TableCell><TableCell>{formatDisplayDate(c.due_date)}</TableCell><TableCell><Badge variant="outline">{armoryStatusLabel({ kind: "custody", status: c.status } as never)}</Badge></TableCell></TableRow>)}</TableBody></Table></div>
    </>
  );
}

function MobileList({ items }: { items: { id: string; title: string; badge: string; lines: [string, string][] }[] }) {
  return (
    <ul className="space-y-2 sm:hidden">
      {items.map((it) => (
        <li key={it.id} className="rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-2"><span className="font-medium break-words">{it.title}</span><Badge variant="outline" className="shrink-0">{it.badge}</Badge></div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">{it.lines.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
        </li>
      ))}
    </ul>
  );
}
