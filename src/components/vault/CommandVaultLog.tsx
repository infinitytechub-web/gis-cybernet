import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { downloadCSVString } from "@/lib/download-utils";
import { VAULT_ACTION_LABEL, vaultActionLabel, buildVaultLogCsv, type VaultLogRow } from "@/lib/vault-log";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Who uploaded, viewed, downloaded, changed, archived and restored each file in one command's vault. */
export function CommandVaultLog({ orgUnitId, commandName }: { orgUnitId: string; commandName?: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(iso(subDays(new Date(), 90)));
  const [to, setTo] = useState(iso(new Date()));
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");

  const log = useQuery({
    queryKey: ["command-vault-log", orgUnitId, from, to],
    enabled: !!orgUnitId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const end = to ? new Date(`${to}T00:00:00`) : null; if (end) end.setDate(end.getDate() + 1);
      const { data, error } = await supabase.rpc("command_vault_activity", {
        _org_unit_id: orgUnitId,
        _from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        _to: end ? end.toISOString() : undefined,
      });
      if (error) throw error; return (data ?? []) as VaultLogRow[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`vault-log-${orgUnitId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "command_vault_file_audit" }, () => qc.invalidateQueries({ queryKey: ["command-vault-log"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgUnitId, qc]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (log.data ?? []).filter(r => (action === "all" || r.action === action)
      && (!t || `${r.file_title} ${r.file_name} ${r.actor_name ?? ""} ${r.actor_staff_id ?? ""} ${r.detail ?? ""}`.toLowerCase().includes(t)));
  }, [log.data, action, q]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; (log.data ?? []).forEach(r => { m[r.action] = (m[r.action] ?? 0) + 1; }); return m; }, [log.data]);
  const pager = usePagedList(rows);

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
      <div><CardTitle className="text-lg">Vault log</CardTitle>
        <CardDescription>Who uploaded, viewed, downloaded, changed, archived and restored each file{commandName ? ` in ${commandName}` : ""}. Entries cannot be edited or deleted.</CardDescription></div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => log.refetch()} disabled={log.isFetching}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCSVString(buildVaultLogCsv(rows), `vault-log-${from}-to-${to}.csv`)}><Download className="mr-1 h-4 w-4" />CSV</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{Object.keys(VAULT_ACTION_LABEL).map(a => <Badge key={a} variant={action === a ? "default" : "outline"} className="cursor-pointer" onClick={() => setAction(action === a ? "all" : a)}>{vaultActionLabel(a)}: {counts[a] ?? 0}</Badge>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label>From</Label><DateInput value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><DateInput value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <div><Label>Action</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{Object.keys(VAULT_ACTION_LABEL).map(a => <SelectItem key={a} value={a}>{vaultActionLabel(a)}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="vault-log-q">Search</Label><Input id="vault-log-q" value={q} onChange={e => setQ(e.target.value)} placeholder="File, officer or staff ID" /></div>
      </div>
      {log.error && <p className="text-sm text-destructive">Could not load the vault log. {(log.error as Error).message}</p>}
      <div className="overflow-x-auto"><Table className="min-w-[800px]"><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>File</TableHead><TableHead>By</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
        <TableBody>{pager.pageItems.map(r => <TableRow key={r.id}>
          <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
          <TableCell className="whitespace-nowrap">{format(new Date(r.created_at), "HH:mm:ss")}</TableCell>
          <TableCell><Badge variant="outline">{vaultActionLabel(r.action)}</Badge></TableCell>
          <TableCell><div className="font-medium">{r.file_title}</div><div className="text-xs text-muted-foreground">{r.file_name}</div></TableCell>
          <TableCell><div>{r.actor_name ?? "Unknown user"}</div><div className="text-xs text-muted-foreground">{[r.actor_rank, r.actor_staff_id].filter(Boolean).join(" · ")}</div></TableCell>
          <TableCell className="text-sm text-muted-foreground">{r.detail || "—"}</TableCell></TableRow>)}
          {!log.isLoading && !rows.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No activity in this period.</TableCell></TableRow>}
          {log.isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
        </TableBody></Table></div>
      <ListPagination {...pager} label="log entries" />
    </CardContent>
  </Card>;
}
