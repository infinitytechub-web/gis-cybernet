import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ApprovalChainEditor } from "@/components/detention/ApprovalChainEditor";
import { useAuth } from "@/hooks/useAuth";
import { SuspectCasePanel } from "@/components/detention/SuspectCasePanel";

const Enforcement = lazy(() => import("./Enforcement"));
const Operations = lazy(() => import("./Operations"));
const HoldingCenter = lazy(() => import("./HoldingCenter"));

type Row = {
  id: string; first_name: string; last_name: string; gender: string | null; nationality: string | null;
  status: string | null; crime_type: string | null; health_status: string | null; medical_alerts: string | null;
  intake_at: string | null; repatriated_at: string | null; id_type: string | null; id_number: string | null;
  phone: string | null; home_address: string | null; date_of_birth: string | null; photo_url: string | null;
};

function tally(rows: Row[], key: (r: Row) => string | null) {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = key(r) || "Not recorded"; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function SuspectAnalytics() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<{ dim: string; val: string } | null>(null);
  const [open, setOpen] = useState<Row | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["hub_detainees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("detention_records")
        .select("id,first_name,last_name,gender,nationality,status,crime_type,health_status,medical_alerts,intake_at,repatriated_at,id_type,id_number,phone,home_address,date_of_birth,photo_url")
        .is("deleted_at", null).order("intake_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Row[];
    },
  });
  const { data: offences = [] } = useQuery({
    queryKey: ["hub_offences"],
    queryFn: async () => (await supabase.from("suspect_offences").select("detention_id,offence")).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel(`hub-detention-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "detention_records" }, () => qc.invalidateQueries({ queryKey: ["hub_detainees"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "suspect_offences" }, () => qc.invalidateQueries({ queryKey: ["hub_offences"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const offByRec = useMemo(() => {
    const m = new Map<string, string[]>();
    offences.forEach((o: any) => m.set(o.detention_id, [...(m.get(o.detention_id) ?? []), o.offence]));
    return m;
  }, [offences]);
  const offOf = (r: Row) => offByRec.get(r.id) ?? (r.crime_type ? [r.crime_type] : []);
  const isRepat = (r: Row) => !!r.repatriated_at || r.status === "repatriated";

  const dims: Record<string, (r: Row) => string | null> = {
    Status: (r) => (isRepat(r) ? "repatriated" : r.status),
    Nationality: (r) => r.nationality, Sex: (r) => r.gender, "Health status": (r) => r.health_status,
  };
  const filtered = rows.filter((r) => {
    if (filter) {
      if (filter.dim === "Offence") { if (!offOf(r).includes(filter.val)) return false; }
      else if ((dims[filter.dim](r) || "Not recorded") !== filter.val) return false;
    }
    const s = q.trim().toLowerCase();
    return !s || `${r.first_name} ${r.last_name} ${r.nationality ?? ""} ${r.id_number ?? ""}`.toLowerCase().includes(s);
  });
  const offenceTally = useMemo(() => {
    const m = new Map<string, number>(); rows.forEach((r) => offOf(r).forEach((o) => m.set(o, (m.get(o) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, offByRec]);

  const softDelete = async (r: Row) => {
    if (!confirm(`Soft delete ${r.first_name} ${r.last_name}? It can be restored by an administrator.`)) return;
    const { error } = await supabase.from("detention_records").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    toast(error ? { title: "Could not delete", description: error.message, variant: "destructive" } : { title: "Record moved to deleted" });
    setOpen(null);
  };

  if (error) return <p className="text-destructive">Could not load suspect records: {(error as Error).message}</p>;
  const kpis = [
    ["Suspect cases", rows.length], ["In custody", rows.filter((r) => r.status === "in_custody").length],
    ["On bail", rows.filter((r) => r.status === "bail").length], ["Repatriated", rows.filter(isRepat).length],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([l, v]) => (
          <Card key={l}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{isLoading ? "…" : v}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[...Object.entries(dims).map(([d, fn]) => [d, tally(rows, fn)] as const), ["Offence", offenceTally] as const].map(([dim, list]) => (
          <Card key={dim}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{dim}</CardTitle></CardHeader>
            <CardContent className="max-h-48 space-y-1 overflow-y-auto">
              {list.slice(0, 15).map(([val, n]) => (
                <button key={val} onClick={() => setFilter(filter?.dim === dim && filter.val === val ? null : { dim, val })}
                  className={`flex w-full justify-between rounded px-2 py-1 text-sm hover:bg-muted ${filter?.dim === dim && filter.val === val ? "bg-primary/10 font-medium" : ""}`}>
                  <span className="truncate capitalize">{val.replace(/_/g, " ")}</span><span>{n}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-sm" placeholder="Search name, nationality, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        {filter && <Badge variant="secondary">{filter.dim}: {filter.val} <button className="ml-1" onClick={() => setFilter(null)}>×</button></Badge>}
        <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-muted/50"><tr>{["Name", "Sex", "Nationality", "Status", "Health", "Offences"].map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpen(r)}>
                <td className="p-2 font-medium">{r.first_name} {r.last_name}</td><td className="p-2">{r.gender}</td><td className="p-2">{r.nationality}</td>
                <td className="p-2 capitalize">{(isRepat(r) ? "repatriated" : r.status ?? "").replace(/_/g, " ")}</td>
                <td className="p-2">{r.health_status || r.medical_alerts || "—"}</td><td className="p-2">{offOf(r).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Suspect KYC</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-2 text-sm">
              {([["Name", `${open.first_name} ${open.last_name}`], ["Sex", open.gender], ["Date of birth", open.date_of_birth], ["Nationality", open.nationality],
                ["ID", `${open.id_type ?? ""} ${open.id_number ?? ""}`], ["Phone", open.phone], ["Address", open.home_address],
                ["Health", open.health_status || open.medical_alerts], ["Offences", offOf(open).join(", ")]] as const).map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-2"><span className="text-muted-foreground">{k}</span><span className="col-span-2">{v || "—"}</span></div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline"><a href={`/holding?record=${open.id}`}>Modify</a></Button>
                <Button variant="destructive" onClick={() => softDelete(open)}>Soft delete</Button>
              </div>
              <div className="border-t pt-3"><SuspectCasePanel id={open.id} /></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CommandOperationsHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "analytics";
  const { role } = useAuth();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Command Operations</h1>
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="enforcement">Enforcement</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="holding">Holding Center</TabsTrigger>
          {role === "admin" && <TabsTrigger value="chain">Chain of command</TabsTrigger>}
        </TabsList>
        <Suspense fallback={<p className="p-4 text-muted-foreground">Loading…</p>}>
          <TabsContent value="analytics"><SuspectAnalytics /></TabsContent>
          <TabsContent value="enforcement"><Enforcement /></TabsContent>
          <TabsContent value="operations"><Operations /></TabsContent>
          <TabsContent value="holding"><HoldingCenter /></TabsContent>
          {role === "admin" && <TabsContent value="chain"><ApprovalChainEditor /></TabsContent>}
        </Suspense>
      </Tabs>
    </div>
  );
}
