import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Filter, Download, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const ACTIONS = ["all", "INSERT", "UPDATE", "DELETE"];

export default function AuditLogDashboard() {
  const { isAdmin } = useAuth();
  const [entityType, setEntityType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [details, setDetails] = useState<any>(null);
  const [limit, setLimit] = useState<number>(200);

  // Distinct entity types for filter dropdown
  const { data: entityTypes = [] } = useQuery({
    queryKey: ["audit-entity-types"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("system_audit_log").select("entity_type").limit(2000);
      return Array.from(new Set((data ?? []).map((r: any) => r.entity_type))).sort();
    },
  });

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-log-list", entityType, action, from, to, limit],
    enabled: isAdmin,
    queryFn: async () => {
      let q = supabase.from("system_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (entityType !== "all") q = q.eq("entity_type", entityType);
      if (action !== "all") q = q.eq("action", action);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: actorMap = {} } = useQuery<Record<string, any>>({
    queryKey: ["audit-actors", rows.map((r: any) => r.performed_by).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(rows.map((r: any) => r.performed_by).filter(Boolean)));
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, staff_id, first_name, last_name").in("user_id", ids);
      const m: Record<string, any> = {};
      (data ?? []).forEach((p: any) => { m[p.user_id] = p; });
      return m;
    },
  });

  const filtered = useMemo(() => {
    if (!staffSearch.trim()) return rows;
    const q = staffSearch.toLowerCase();
    return rows.filter((r: any) => {
      const a = actorMap[r.performed_by];
      if (!a) return false;
      return (
        a.staff_id?.toLowerCase().includes(q) ||
        a.first_name?.toLowerCase().includes(q) ||
        a.last_name?.toLowerCase().includes(q)
      );
    });
  }, [rows, staffSearch, actorMap]);

  const exportCsv = () => {
    const header = ["timestamp", "action", "entity_type", "entity_id", "actor_staff_id", "actor_name"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const a = actorMap[r.performed_by] ?? {};
      lines.push([
        r.created_at,
        r.action,
        r.entity_type,
        r.entity_id ?? "",
        a.staff_id ?? "",
        `"${(a.last_name ?? "")} ${(a.first_name ?? "")}"`.trim(),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} entries`);
  };

  if (!isAdmin) {
    return <Alert><AlertDescription>Admin access required to view system audit logs.</AlertDescription></Alert>;
  }

  const actionColor = (a: string) =>
    a === "INSERT" ? "bg-emerald-100 text-emerald-800" :
    a === "DELETE" ? "bg-red-100 text-red-800" :
    "bg-sky-100 text-sky-800";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-secondary">Audit Log Dashboard</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label>Table / Entity</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All tables</SelectItem>
                  {entityTypes.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a === "all" ? "All actions" : a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Staff (ID or name)</Label>
              <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="e.g. ADMIN-001" />
            </div>
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={() => refetch()} variant="outline" size="sm">Apply</Button>
            <Button
              onClick={() => { setEntityType("all"); setAction("all"); setStaffSearch(""); setFrom(""); setTo(""); }}
              variant="ghost" size="sm"
            >Clear</Button>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[100, 200, 500, 1000].map((n) => <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={exportCsv} variant="outline" size="sm" className="gap-1 ml-auto">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground">Loading…</div>
          ) : (
            <div className="rounded border overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="hidden md:table-cell">Entity ID</TableHead>
                    <TableHead className="w-12">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No matching entries</TableCell></TableRow>
                  ) : filtered.map((r: any) => {
                    const a = actorMap[r.performed_by];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "PP HH:mm")}</TableCell>
                        <TableCell><Badge variant="secondary" className={actionColor(r.action)}>{r.action}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{r.entity_type}</TableCell>
                        <TableCell className="text-xs">
                          {a ? (
                            <span><span className="font-mono">{a.staff_id}</span> — {a.last_name}, {a.first_name}</span>
                          ) : (
                            <span className="text-muted-foreground">{r.performed_by ? r.performed_by.slice(0, 8) : "system"}</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{r.entity_id?.slice(0, 8) ?? "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetails(r)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!details} onOpenChange={(o) => { if (!o) setDetails(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Entry — {details?.action} on {details?.entity_type}</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Time:</span> {format(new Date(details.created_at), "PPpp")}</div>
              <div><span className="text-muted-foreground">Entity ID:</span> <code className="text-xs">{details.entity_id ?? "—"}</code></div>
              <div className="text-muted-foreground">Details:</div>
              <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-[400px]">{JSON.stringify(details.details, null, 2)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
