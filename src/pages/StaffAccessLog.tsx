/**
 * Staff Access Log — command-tier view of who opened which staff record and
 * which action they performed, including who reached their own staff portal.
 * Data comes from the `staff_access_log_feed` RPC, which re-checks the
 * viewer's authority server-side.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Eye, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { format, subDays } from "date-fns";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCell } from "@/lib/csv-safe";
import { SecurityHero } from "@/components/security/SecurityHero";

type FeedRow = {
  id: string;
  created_at: string;
  action: string;
  detail: string | null;
  path: string | null;
  user_agent: string | null;
  actor_name: string | null;
  actor_staff_id: string | null;
  target_name: string | null;
  target_staff_id: string | null;
};

const RANGES = [
  { key: "1", label: "Last 24 hours" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const ACTION_LABELS: Record<string, string> = {
  view: "Opened record",
  edit: "Edited record",
  create: "Created record",
  delete: "Deleted record",
  download: "Downloaded",
  print: "Printed",
  vault: "Document vault",
  portal: "Reached portal",
};

export default function StaffAccessLog() {
  const { isAdmin, isOic, is2ic, role } = useAuth();
  const allowed = isAdmin || isOic || is2ic || role === "staff_officer";

  const [range, setRange] = useState("7");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["staff-access-log", range, action],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FeedRow[]> => {
      const { data, error } = await (supabase as any).rpc("staff_access_log_feed", {
        _from: subDays(new Date(), Number(range)).toISOString(),
        _to: new Date().toISOString(),
        _action: action === "all" ? null : action,
        _search: null,
        _limit: 1000,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedRow[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.actor_name ?? ""} ${r.actor_staff_id ?? ""} ${r.target_name ?? ""} ${r.target_staff_id ?? ""} ${r.detail ?? ""} ${r.path ?? ""}`
        .toLowerCase()
        .includes(s),
    );
  }, [rows, search]);

  const portalReached = useMemo(
    () => new Set(filtered.filter((r) => r.action === "portal").map((r) => r.actor_name ?? "")).size,
    [filtered],
  );

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  const exportCsv = () => {
    const headers = ["When", "Who", "Their staff ID", "Action", "Staff record", "Record staff ID", "Detail", "Page", "Device"];
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
          r.actor_name ?? "",
          r.actor_staff_id ?? "",
          ACTION_LABELS[r.action] ?? r.action,
          r.target_name ?? "",
          r.target_staff_id ?? "",
          r.detail ?? "",
          r.path ?? "",
          r.user_agent ?? "",
        ]
          .map((v) => csvCell(String(v ?? "")))
          .join(","),
      );
    }
    downloadCSVString(lines.join("\n"), `staff-access-log-${format(new Date(), "yyyyMMdd-HHmm")}.csv`);
  };

  return (
    <div className="space-y-4 p-1">
      <SecurityHero
        icon={ShieldCheck}
        title="Staff Access Log"
        subtitle="Who opened which staff record, what they did with it, and who reached their own staff portal."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Recorded events</p>
          <p className="text-2xl font-semibold">{filtered.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Officers who reached the portal</p>
          <p className="text-2xl font-semibold">{portalReached}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Staff records touched</p>
          <p className="text-2xl font-semibold">
            {new Set(filtered.filter((r) => r.target_name).map((r) => r.target_staff_id ?? r.target_name)).size}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Access events
            <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              className="h-9 min-w-[220px] flex-1"
              placeholder="Search by name, staff ID or note…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Staff record</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm italic text-muted-foreground">
                    No access events in this period.
                  </TableCell></TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.actor_name || "—"}
                        {r.actor_staff_id && <span className="ml-1 text-muted-foreground">({r.actor_staff_id})</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {ACTION_LABELS[r.action] ?? r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.target_name || <span className="text-muted-foreground">Own portal</span>}
                        {r.target_staff_id && <span className="ml-1 text-muted-foreground">({r.target_staff_id})</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.detail || "—"}</TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground" title={r.user_agent ?? undefined}>
                        {r.path || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
