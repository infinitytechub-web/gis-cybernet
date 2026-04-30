import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, CheckCircle2, AlertCircle, RefreshCw, FileText, FileSpreadsheet, Search, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  exportComplianceAuditCSV,
  exportComplianceAuditPDF,
  type AuditExportRow,
} from "@/lib/compliance-audit-export";

interface AuditRow {
  id: string;
  batch_id: string;
  performed_by: string;
  target_profile_id: string;
  kind: "documents" | "certifications";
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  outcome: "uploaded" | "failed";
  error_message: string | null;
  created_at: string;
  performer: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
  target: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
}

const DOC_TYPES = ["Passport", "National ID", "Service ID", "Visa", "Work Permit", "Driver's License", "Medical Certificate", "Other"];

function labelFor(p: { first_name: string | null; last_name: string | null; staff_id: string | null } | null, fallback: string): string {
  if (!p) return fallback;
  return `${p.last_name ?? ""}, ${p.first_name ?? ""}${p.staff_id ? ` (${p.staff_id})` : ""}`.trim();
}

export function ComplianceBulkAuditDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ["compliance-upload-audit"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_upload_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const base = (data ?? []) as unknown as AuditRow[];
      const userIds = Array.from(new Set(base.map((r) => r.performed_by)));
      const profileIds = Array.from(new Set(base.map((r) => r.target_profile_id)));
      const [performersRes, targetsRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, first_name, last_name, staff_id").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        profileIds.length
          ? supabase.from("profiles").select("id, first_name, last_name, staff_id").in("id", profileIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const performerMap = new Map((performersRes.data ?? []).map((p: any) => [p.user_id, p]));
      const targetMap = new Map((targetsRes.data ?? []).map((p: any) => [p.id, p]));
      return base.map((r) => ({
        ...r,
        performer: performerMap.get(r.performed_by) ?? null,
        target: targetMap.get(r.target_profile_id) ?? null,
      }));
    },
  });

  // Realtime: refresh on any new audit insert while dialog is open
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel("compliance-audit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "compliance_upload_audit" },
        () => qc.invalidateQueries({ queryKey: ["compliance-upload-audit"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, qc]);

  // Build the unique target-staff list visible in the current dataset
  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.target_profile_id, labelFor(r.target, r.target_profile_id.slice(0, 8)));
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (staffFilter !== "all" && r.target_profile_id !== staffFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (outcomeFilter !== "all" && r.outcome !== outcomeFilter) return false;
      if (docTypeFilter !== "all") {
        // document type lives on the certifications/staff_documents row, not the audit row;
        // approximate by matching the file_name containing the type or the type itself.
        const hay = `${r.file_name} ${r.file_type ?? ""}`.toLowerCase();
        if (!hay.includes(docTypeFilter.toLowerCase())) return false;
      }
      if (q) {
        const hay = [
          r.file_name,
          r.file_type ?? "",
          r.error_message ?? "",
          labelFor(r.performer, ""),
          labelFor(r.target, ""),
          r.batch_id,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fromDate, toDate, staffFilter, kindFilter, docTypeFilter, outcomeFilter, search]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, AuditRow[]>>((acc, r) => {
      (acc[r.batch_id] ||= []).push(r);
      return acc;
    }, {});
  }, [filtered]);

  function toExportRows(): AuditExportRow[] {
    return filtered.map((r) => ({
      created_at: r.created_at,
      batch_id: r.batch_id,
      kind: r.kind,
      outcome: r.outcome,
      file_name: r.file_name,
      file_size: r.file_size,
      file_type: r.file_type,
      error_message: r.error_message,
      performer_label: labelFor(r.performer, r.performed_by.slice(0, 8)),
      target_label: labelFor(r.target, r.target_profile_id.slice(0, 8)),
    }));
  }

  function filterSummary(): string[] {
    const parts: string[] = [];
    if (fromDate) parts.push(`From: ${fromDate}`);
    if (toDate) parts.push(`To: ${toDate}`);
    if (kindFilter !== "all") parts.push(`Kind: ${kindFilter}`);
    if (outcomeFilter !== "all") parts.push(`Outcome: ${outcomeFilter}`);
    if (docTypeFilter !== "all") parts.push(`Type: ${docTypeFilter}`);
    if (staffFilter !== "all") {
      const lbl = staffOptions.find(([id]) => id === staffFilter)?.[1] ?? staffFilter;
      parts.push(`Staff: ${lbl}`);
    }
    if (search.trim()) parts.push(`Search: "${search.trim()}"`);
    return parts;
  }

  function handleExportCSV() {
    if (filtered.length === 0) {
      toast.error("No rows to export");
      return;
    }
    exportComplianceAuditCSV(toExportRows());
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? "" : "s"} to CSV`);
  }

  async function handleExportPDF() {
    if (filtered.length === 0) {
      toast.error("No rows to export");
      return;
    }
    await exportComplianceAuditPDF(toExportRows(), filterSummary());
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? "" : "s"} to PDF`);
  }

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setStaffFilter("all");
    setKindFilter("all");
    setDocTypeFilter("all");
    setOutcomeFilter("all");
  }

  const hasFilters =
    search || fromDate || toDate ||
    staffFilter !== "all" || kindFilter !== "all" ||
    docTypeFilter !== "all" || outcomeFilter !== "all";

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-1">
        <History className="h-4 w-4" /> Upload history
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk upload audit log</DialogTitle>
            <DialogDescription>
              Records who uploaded each file, when, the target staff member, and the outcome.
              Showing the most recent 500 entries you have access to. Updates live.
            </DialogDescription>
          </DialogHeader>

          {/* Filters */}
          <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="File name, error, performer, batch…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Staff</Label>
                <Select value={staffFilter} onValueChange={setStaffFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">All staff</SelectItem>
                    {staffOptions.map(([id, label]) => (
                      <SelectItem key={id} value={id}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Kind</Label>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="documents">Documents</SelectItem>
                    <SelectItem value="certifications">Certifications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Document type</Label>
                <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">All</SelectItem>
                    {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Outcome</Label>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="uploaded">Uploaded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {filtered.length} of {rows.length} entries
              </Badge>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-7">
                  <X className="h-3 w-3" /> Clear filters
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {isFetching ? "Loading..." : hasFilters ? "No entries match these filters." : "No bulk uploads recorded yet."}
            </div>
          ) : (
            <div className="space-y-4 mt-3">
              {Object.entries(grouped).map(([batchId, items]) => {
                const first = items[0];
                const ok = items.filter((i) => i.outcome === "uploaded").length;
                const failed = items.filter((i) => i.outcome === "failed").length;
                return (
                  <div key={batchId} className="rounded-lg border">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                      <Badge variant="outline" className="capitalize">{first.kind}</Badge>
                      <span className="font-medium">{labelFor(first.performer, first.performed_by.slice(0, 8))}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{labelFor(first.target, first.target_profile_id.slice(0, 8))}</span>
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(first.created_at), "dd MMM yyyy HH:mm")}
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-800">{ok} uploaded</Badge>
                      {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs font-medium truncate max-w-[260px]" title={r.file_name}>{r.file_name}</TableCell>
                              <TableCell className="text-xs">{r.file_size != null ? `${(r.file_size / 1024).toFixed(0)} KB` : "—"}</TableCell>
                              <TableCell>
                                {r.outcome === "uploaded" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 gap-1"><CheckCircle2 className="h-3 w-3" /> Uploaded</Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[300px]" title={r.error_message ?? ""}>
                                {r.error_message ?? r.file_type ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
