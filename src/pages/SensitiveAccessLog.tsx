import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Loader2, ShieldCheck, Download } from "lucide-react";
import { format } from "date-fns";
import { downloadCSVString } from "@/lib/download-utils";
import { SecurityHero } from "@/components/security/SecurityHero";
import { csvCell } from "@/lib/csv-safe";

export default function SensitiveAccessLog() {
  const { isAdmin, is2ic, isOic } = useAuth();
  const allowed = isAdmin || is2ic || isOic;

  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sensitive-access-log"],
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sensitive_table_access_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const tables = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (s) {
        const blob = `${r.accessed_by_name ?? ""} ${r.table_name} ${r.action} ${r.reason ?? ""}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [rows, tableFilter, actionFilter, search]);

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      <SecurityHero
        icon={ShieldCheck}
        title="Sensitive Data Access Log"
        subtitle="Every read of sensitive tables (recipients lists, failed login attempts, etc.) is recorded here."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Recent access events
            <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-[200px] flex-1">
              <Input placeholder="Search user, table, reason…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="search">Search</SelectItem>
                <SelectItem value="view_detail">View detail</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={filtered.length === 0}
              onClick={() => {
                const esc = (v: any) => {
                  const s = v === null || v === undefined ? "" : String(v);
                  return csvCell(s);
                };
                const headers = ["When", "User", "User ID", "Table", "Action", "Records", "Reason", "Filters"];
                const lines = [headers.join(",")];
                for (const r of filtered) {
                  lines.push([
                    format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
                    r.accessed_by_name ?? "",
                    r.accessed_by ?? "",
                    r.table_name,
                    r.action,
                    r.record_count ?? "",
                    r.reason ?? "",
                    r.filters ? JSON.stringify(r.filters) : "",
                  ].map(esc).join(","));
                }
                downloadCSVString(lines.join("\n"), `sensitive-access-log-${format(new Date(), "yyyyMMdd-HHmm")}.csv`);
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Reason / context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground italic">
                    No access events match your filters.
                  </TableCell></TableRow>
                ) : (
                  filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs">{r.accessed_by_name ?? <span className="font-mono text-muted-foreground">{(r.accessed_by ?? "—").slice(0, 8)}</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{r.table_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.action}</Badge></TableCell>
                      <TableCell className="text-right text-xs">{r.record_count ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.reason ?? (r.filters ? <code className="text-[10px]">{JSON.stringify(r.filters)}</code> : "—")}
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
