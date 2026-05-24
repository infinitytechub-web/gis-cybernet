import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { openPrintWindow } from "@/lib/safe-print";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, History, Printer, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { exportReport } from "@/lib/export-utils";
import { downloadCSVString } from "@/lib/download-utils";
import { PostingAuditTrailDialog } from "@/components/postings/PostingAuditTrailDialog";

export default function PostingsHistory() {
  const { isAdminOrSupervisor } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();

  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const [fromDept, setFromDept] = useState(sp.get("fromDept") ?? "all");
  const [toDept, setToDept] = useState(sp.get("toDept") ?? "all");
  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (fromDept !== "all") next.set("fromDept", fromDept);
    if (toDept !== "all") next.set("toDept", toDept);
    if (status !== "all") next.set("status", status);
    setSp(next, { replace: true });
  }, [from, to, fromDept, toDept, status, setSp]);

  const { data: departments = [] } = useQuery({
    queryKey: ["depts-all"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["postings-history", from, to, fromDept, toDept, status],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      let q = supabase
        .from("postings_transfers")
        .select(`
          id, effective_date, status, reason, approved_by, created_at,
          profile:profiles!postings_transfers_profile_id_fkey(id, staff_id, first_name, last_name),
          from_dept:departments!postings_transfers_from_department_id_fkey(id, name),
          to_dept:departments!postings_transfers_to_department_id_fkey(id, name)
        `)
        .order("effective_date", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (from) q = q.gte("effective_date", from);
      if (to) q = q.lte("effective_date", to);
      if (fromDept !== "all") q = q.eq("from_department_id", fromDept);
      if (toDept !== "all") q = q.eq("to_department_id", toDept);
      if (status !== "all") q = q.eq("status", status as any);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const mapped = useMemo(() => (rows as any[]).map((r) => ({
    id: r.id,
    staffId: r.profile?.staff_id ?? "—",
    name: `${r.profile?.last_name ?? ""}, ${r.profile?.first_name ?? ""}`.trim(),
    fromDept: r.from_dept?.name ?? "—",
    toDept: r.to_dept?.name ?? "—",
    effective: r.effective_date,
    status: r.status ?? "—",
    reason: r.reason ?? "—",
  })), [rows]);

  const headers = ["Staff ID", "Name", "From", "To", "Effective Date", "Status", "Reason"];
  const exportRows = mapped.map((r) => [
    r.staffId, r.name, r.fromDept, r.toDept,
    r.effective ? format(new Date(r.effective), "dd MMM yyyy") : "—",
    r.status, r.reason,
  ]);

  const doExport = (fmt: "pdf" | "csv" | "excel" | "word") => {
    exportReport(fmt, {
      title: "Staff Transfer History",
      filename: `transfer-history-${format(new Date(), "yyyy-MM-dd")}`,
      headers,
      rows: exportRows,
      subtitle: `${mapped.length} records · Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    });
  };

  const quickCSV = () => {
    const csv = [headers.join(","), ...exportRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    downloadCSVString(csv, `transfer-history-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  const doPrint = () => {
    const w = window.open("", "_blank"); if (!w) return;
    const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    w.document.write(`<html><head><title>Transfer History</title><style>body{font-family:system-ui;padding:24px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:6px}th{background:#f5f5f5}</style></head><body><h1>Staff Transfer History</h1><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${exportRows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  if (!isAdminOrSupervisor) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Command-tier only.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-secondary" />
        <h1 className="text-2xl font-bold text-secondary">Staff Transfer History</h1>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><Label className="text-xs">From date</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To date</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label className="text-xs">From department</Label>
            <Select value={fromDept} onValueChange={setFromDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">To department / office</Label>
            <Select value={toDept} onValueChange={setToDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
            Results <span className="text-xs font-normal text-muted-foreground">({mapped.length})</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={quickCSV}><Download className="h-3 w-3" />CSV</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("excel")}><FileSpreadsheet className="h-3 w-3" />XLSX</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("pdf")}><FileText className="h-3 w-3" />PDF</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doExport("word")}><FileText className="h-3 w-3" />DOCX</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={doPrint}><Printer className="h-3 w-3" />Print</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  {headers.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                  <TableHead className="text-xs">Audit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : mapped.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No records match filters.</TableCell></TableRow>
                ) : (
                  mapped.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/postings`)}>
                      <TableCell className="text-xs font-mono">{r.staffId}</TableCell>
                      <TableCell className="text-xs font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{r.fromDept}</TableCell>
                      <TableCell className="text-xs">{r.toDept}</TableCell>
                      <TableCell className="text-xs">{r.effective ? format(new Date(r.effective), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell className="text-xs"><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={r.reason}>{r.reason}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Audit trail"
                          onClick={(e) => { e.stopPropagation(); setAuditId(r.id); setAuditOpen(true); }}>
                          <ScrollText className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground pt-3">
            Data as of: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "dd MMM yyyy HH:mm:ss") : "—"}
          </p>
        </CardContent>
      </Card>

      <PostingAuditTrailDialog open={auditOpen} onOpenChange={setAuditOpen} postingId={auditId} />
    </div>
  );
}
