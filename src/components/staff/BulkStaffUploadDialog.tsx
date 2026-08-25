import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Eye, History, Download, ShieldAlert, RotateCcw, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { csvCell } from "@/lib/csv-safe";

type Outcome = {
  rowIndex: number;
  staffId: string | null;
  status: "create" | "update" | "skip" | "error" | "deactivate";
  message?: string;
  changedFields?: string[];
  diff?: Record<string, { from: any; to: any }>;
  fullName?: string;
  department?: string;
  rank?: string;
  designation?: string;
  office?: string;
};

type AutoRollback = {
  attempted: boolean;
  succeeded: boolean;
  message?: string;
  profilesRestored?: number;
  nightGuardRestored?: number;
};

type RunResult = {
  dryRun: boolean;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  deactivateCount?: number;
  rosterPlanned?: number;
  rosterDates?: string[];
  rosterErrors?: { rowIndex: number; message: string; staffId: string | null }[];
  snapshotId?: string | null;
  commitErrors: { staffId: string; error: string }[];
  autoRollback?: AutoRollback;
  outcomes: Outcome[];
};

type FilterKey = "all" | "create" | "update" | "skip" | "error";

const TEMPLATE_HEADERS = [
  "staff_id", "first_name", "last_name", "rank", "department",
  "phone", "gender", "status", "unit", "shift_group",
  "ghana_card_number", "email", "blood_group", "intake",
  "training_designation", "staff_category", "office",
];

const TEMPLATE_SAMPLE_ROWS: string[][] = [
  ["GIS-2026-0001","Jane","Doe","Officer","CYBER & MISD","0244000000","female","active","Alpha","A","GHA-1234567-8","jane.doe@gis.local","O+","12","HUHUNYA","Cadet","HQ"],
  ["GIS-2026-0002","Kwame","Mensah","Inspector","Operations","0201112233","male","active","Bravo","B","GHA-2345678-9","kwame.mensah@gis.local","A+","11","ASSIN FOSO","Regular","HQ"],
  ["GIS-2026-0003","Akosua","Owusu","Sergeant","Administration","0277223344","female","active","Charlie","C","GHA-3456789-0","akosua.owusu@gis.local","B+","10","HUHUNYA","Regular","HQ"],
];

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const lines = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_SAMPLE_ROWS.map((r) => r.map((v) => csvCell(v)).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "staff-list-template.csv"; a.click();
    URL.revokeObjectURL(url);
    return;
  }
  // xlsx
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_SAMPLE_ROWS]);
  ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Staff");
  XLSX.writeFile(wb, "staff-list-template.xlsx");
}

interface Props { trigger?: React.ReactNode }

export function BulkStaffUploadDialog({ trigger }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [rosterFileName, setRosterFileName] = useState<string | null>(null);
  const [rosterRows, setRosterRows] = useState<{ staff_id: string; date: string }[]>([]);
  const [deactivateMissing, setDeactivateMissing] = useState(true);
  const [takeSnapshot, setTakeSnapshot] = useState(true);
  const [previewResult, setPreviewResult] = useState<RunResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deactConfirmOpen, setDeactConfirmOpen] = useState(false);
  const [deactAcknowledged, setDeactAcknowledged] = useState(false);
  const CONFIRM_KEYWORD = "OVERRIDE";

  const reset = () => {
    setFileName(null); setRows([]);
    setRosterFileName(null); setRosterRows([]);
    setPreviewResult(null); setCommitted(false); setFilter("all");
    setDeactAcknowledged(false);
  };

  const exportDiffCsv = () => {
    if (!previewResult) return;
    const header = ["row", "staff_id", "status", "field", "from", "to", "message"];
    const lines = [header.join(",")];
    const esc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      return csvCell(s);
    };
    for (const o of previewResult.outcomes) {
      if (o.diff && Object.keys(o.diff).length) {
        for (const [k, v] of Object.entries(o.diff)) {
          lines.push([o.rowIndex + 1, o.staffId ?? "", o.status, k, esc(v.from), esc(v.to), ""].map(esc).join(","));
        }
      } else {
        lines.push([o.rowIndex + 1, o.staffId ?? "", o.status, "", "", "", esc(o.message ?? "")].map(esc).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dry-run-diff-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
      if (!json.length) {
        toast.error("File is empty");
        return;
      }
      if (json.length > 5000) {
        toast.error("Maximum 5,000 rows per upload");
        return;
      }
      setFileName(file.name);
      setRows(json);
      setPreviewResult(null);
      setCommitted(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to parse file");
    }
  };

  const handleRosterFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
      const parsed: { staff_id: string; date: string }[] = [];
      for (const r of json) {
        const sid = String(r["Staff ID"] ?? r["staff_id"] ?? r["staffId"] ?? "").trim();
        const dateRaw = r["Date"] ?? r["date"] ?? "";
        let dateStr = "";
        if (typeof dateRaw === "number") {
          const d = XLSX.SSF.parse_date_code(dateRaw);
          dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        } else if (String(dateRaw).trim()) {
          const pd = new Date(String(dateRaw));
          if (!isNaN(pd.getTime())) dateStr = format(pd, "yyyy-MM-dd");
        }
        if (sid) parsed.push({ staff_id: sid, date: dateStr });
      }
      if (parsed.length === 0) { toast.error("Roster file has no valid rows (need Staff ID + Date)"); return; }
      if (parsed.length > 10000) { toast.error("Maximum 10,000 roster rows"); return; }
      setRosterFileName(file.name);
      setRosterRows(parsed);
      setPreviewResult(null);
      setCommitted(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to parse roster file");
    }
  };

  const downloadRosterTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Staff ID", "Date"],
      ["GIS-2026-0001", format(new Date(), "yyyy-MM-dd")],
      ["GIS-2026-0002", format(new Date(), "yyyy-MM-dd")],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Night Guard Roster");
    XLSX.writeFile(wb, "night-guard-roster-template.xlsx");
  };

  const runMut = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.functions.invoke("bulk-upload-staff", {
        body: { rows, rosterRows, fileName, rosterFileName, dryRun, deactivateMissing, snapshot: takeSnapshot && !dryRun },
      });
      if (error) throw error;
      return data as RunResult;
    },
    onSuccess: (res, dryRun) => {
      setPreviewResult(res);
      setDeactAcknowledged(false);
      if (!dryRun) {
        const rb = res.autoRollback;
        if (rb?.attempted) {
          // Commit failed and rollback was triggered
          setCommitted(false);
          if (rb.succeeded) {
            toast.error(
              `Commit failed — automatically rolled back to snapshot. Restored ${rb.profilesRestored ?? 0} staff records and ${rb.nightGuardRestored ?? 0} roster rows. Errors: ${res.commitErrors.length}.`,
              { duration: 10000 }
            );
          } else {
            toast.error(
              `Commit failed AND auto-rollback failed: ${rb.message ?? "unknown"}. Restore manually from the Snapshots tab.`,
              { duration: 15000 }
            );
          }
        } else {
          setCommitted(true);
          toast.success(`Override applied — ${res.createdCount} created · ${res.updatedCount} updated · ${res.deactivateCount ?? 0} deactivated · ${res.rosterPlanned ?? 0} roster rows`);
        }
        qc.invalidateQueries({ queryKey: ["directory-staff"] });
        qc.invalidateQueries({ queryKey: ["bulk-staff-audit"] });
        qc.invalidateQueries({ queryKey: ["bulk-staff-snapshots"] });
        qc.invalidateQueries({ queryKey: ["night-guard-assignments"] });
        qc.invalidateQueries({ queryKey: ["shift-assignments"] });
      } else {
        toast.message(`Preview: ${res.createdCount} create · ${res.updatedCount} update · ${res.deactivateCount ?? 0} deactivate · ${res.rosterPlanned ?? 0} roster · ${res.errorCount} error`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
  });

  const restoreMut = useMutation({
    mutationFn: async (snapshotId: string) => {
      const { data, error } = await supabase.rpc("restore_staff_bulk_snapshot" as any, { p_snapshot_id: snapshotId });
      if (error) throw error;
      return data as { profiles_restored: number; night_guard_restored: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["directory-staff"] });
      qc.invalidateQueries({ queryKey: ["bulk-staff-snapshots"] });
      qc.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      qc.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`Restored ${res.profiles_restored} staff records and ${res.night_guard_restored} roster rows`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["bulk-staff-audit"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_bulk_upload_audit" as any)
        .select("id, uploaded_at, uploaded_by_name, file_name, total_rows, created_count, updated_count, skipped_count, error_count, dry_run")
        .order("uploaded_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["bulk-staff-snapshots"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_bulk_upload_snapshots" as any)
        .select("id, created_at, taken_by_name, file_name, note, profiles_count, night_guard_count, restored_at")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const counts = useMemo(() => {
    if (!previewResult) return null;
    return previewResult;
  }, [previewResult]);

  type DeactStaff = { staffId: string; fullName: string; rank: string; designation: string; office: string };
  const deactivationsByDept = useMemo(() => {
    if (!previewResult) return [] as { department: string; staff: DeactStaff[] }[];
    const map = new Map<string, DeactStaff[]>();
    for (const o of previewResult.outcomes) {
      if (o.status !== "deactivate") continue;
      const dept = o.department ?? "—";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push({
        staffId: o.staffId ?? "—",
        fullName: o.fullName ?? "—",
        rank: o.rank ?? "—",
        designation: o.designation ?? "—",
        office: o.office ?? "—",
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([department, staff]) => ({
        department,
        staff: staff.sort((a, b) => a.staffId.localeCompare(b.staffId)),
      }));
  }, [previewResult]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-4 w-4" /> Bulk upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Override Staff List &amp; Guard Duty Roster
          </DialogTitle>
          <DialogDescription>
            Upload a staff CSV/XLSX and (optionally) a Night Guard roster file in one batch.
            Existing staff are <strong>upserted by Staff ID</strong>; staff missing from the file can be auto-deactivated.
            A snapshot is taken before commit so you can roll back from the <strong>Snapshots</strong> tab.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList>
            <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1.5" /> Upload</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-4 w-4 mr-1.5" /> Recent uploads</TabsTrigger>
            <TabsTrigger value="snapshots"><Camera className="h-4 w-4 mr-1.5" /> Snapshots</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3">
            {/* Staff file */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Staff list (CSV/XLSX)</Label>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => downloadTemplate("csv")} className="gap-1.5 h-7 text-xs">
                    <Download className="h-3.5 w-3.5" /> CSV template
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadTemplate("xlsx")} className="gap-1.5 h-7 text-xs">
                    <Download className="h-3.5 w-3.5" /> XLSX template
                  </Button>
                </div>
              </div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {fileName && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} — {rows.length} staff row{rows.length === 1 ? "" : "s"}
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setFileName(null); setRows([]); setPreviewResult(null); }}><X className="h-3 w-3" /></Button>
                </div>
              )}
            </div>

            {/* Roster file */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Night Guard duty roster (optional)</Label>
                <Button variant="ghost" size="sm" onClick={downloadRosterTemplate} className="gap-1.5 h-7 text-xs">
                  <Download className="h-3.5 w-3.5" /> Roster template
                </Button>
              </div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRosterFile(f); }}
              />
              {rosterFileName && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {rosterFileName} — {rosterRows.length} roster row{rosterRows.length === 1 ? "" : "s"}
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setRosterFileName(null); setRosterRows([]); setPreviewResult(null); }}><X className="h-3 w-3" /></Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">Same format as the Night Guard duty upload: <strong>Staff ID</strong> + <strong>Date</strong> columns. Existing assignments on the same dates will be replaced.</p>
            </div>

            {/* Override safeguards */}
            <div className="rounded-lg border p-3 space-y-2.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Override behaviour</Label>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="deact" className="text-xs cursor-pointer">Deactivate staff missing from file</Label>
                  <p className="text-[10px] text-muted-foreground">Any active staff not listed in the upload will be set to <code className="text-[10px]">inactive</code>.</p>
                </div>
                <Switch id="deact" checked={deactivateMissing} onCheckedChange={setDeactivateMissing} />
              </div>
              <div className="flex items-start justify-between gap-3 pt-1.5 border-t">
                <div className="space-y-0.5">
                  <Label htmlFor="snap" className="text-xs cursor-pointer">Take snapshot before commit (recommended)</Label>
                  <p className="text-[10px] text-muted-foreground">Saves a restorable backup of all staff records and Night Guard assignments.</p>
                </div>
                <Switch id="snap" checked={takeSnapshot} onCheckedChange={setTakeSnapshot} />
              </div>
            </div>


            {counts && counts.dryRun && !committed && (
              <Alert className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600">
                <Eye className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-200 font-semibold">
                  DRY-RUN MODE — No changes have been written
                </AlertTitle>
                <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
                  Review the planned upserts below. Click <strong>Commit upload</strong> to apply, or upload a corrected file.
                </AlertDescription>
              </Alert>
            )}

            {counts && (
              <Alert variant={counts.errorCount > 0 ? "destructive" : "default"}>
                {counts.errorCount > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                <AlertTitle>
                  {counts.dryRun ? "Preview summary" : committed ? "Committed" : "Result"} — {counts.totalRows} row{counts.totalRows === 1 ? "" : "s"}
                </AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {([
                      { k: "all" as FilterKey, label: `${counts.totalRows} all`, cls: "" },
                      { k: "create" as FilterKey, label: `${counts.createdCount} insert`, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
                      { k: "update" as FilterKey, label: `${counts.updatedCount} update`, cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
                      { k: "skip" as FilterKey, label: `${counts.skippedCount} no-change`, cls: "bg-muted text-muted-foreground" },
                      { k: "error" as FilterKey, label: `${counts.errorCount} error`, cls: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
                    ]).map((b) => (
                      <button key={b.k} type="button" onClick={() => setFilter(b.k)}>
                        <Badge variant={filter === b.k ? "default" : "outline"} className={`cursor-pointer ${filter === b.k ? "" : b.cls}`}>{b.label}</Badge>
                      </button>
                    ))}
                    {(counts.deactivateCount ?? 0) > 0 && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                        {counts.deactivateCount} will deactivate
                      </Badge>
                    )}
                    {(counts.rosterPlanned ?? 0) > 0 && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                        {counts.rosterPlanned} roster · {counts.rosterDates?.length ?? 0} day(s)
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" onClick={exportDiffCsv} className="ml-auto h-6 gap-1 text-xs">
                      <Download className="h-3 w-3" /> Export diff CSV
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {previewResult && (
              <ScrollArea className="h-[300px] rounded border">
                <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Staff ID</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>From → To / Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResult.outcomes
                      .filter((o) => filter === "all" || o.status === filter)
                      .map((o) => {
                        const diffEntries = o.diff ? Object.entries(o.diff) : [];
                        if (!diffEntries.length) {
                          return (
                            <TableRow key={o.rowIndex}>
                              <TableCell className="text-xs text-muted-foreground">{o.rowIndex + 1}</TableCell>
                              <TableCell className="text-xs font-mono">{o.staffId ?? "—"}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  o.status === "error" ? "destructive" : "outline"
                                } className="text-[10px] capitalize">{o.status === "skip" ? "no-change" : o.status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">—</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{o.message ?? "—"}</TableCell>
                            </TableRow>
                          );
                        }
                        return diffEntries.map(([k, v], i) => (
                          <TableRow key={`${o.rowIndex}-${k}`}>
                            <TableCell className="text-xs text-muted-foreground">{i === 0 ? o.rowIndex + 1 : ""}</TableCell>
                            <TableCell className="text-xs font-mono">{i === 0 ? (o.staffId ?? "—") : ""}</TableCell>
                            <TableCell>
                              {i === 0 && (
                                <Badge variant={o.status === "create" ? "default" : "secondary"} className={`text-[10px] capitalize ${o.status === "create" ? "bg-emerald-600 hover:bg-emerald-600" : "bg-blue-600 text-white hover:bg-blue-600"}`}>
                                  {o.status === "create" ? "insert" : "update"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-medium">{k}</TableCell>
                            <TableCell className="text-xs">
                              <span className="text-muted-foreground line-through">{v.from === null || v.from === "" ? "∅" : String(v.from)}</span>
                              <span className="mx-1.5 text-muted-foreground">→</span>
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">{v.to === null || v.to === "" ? "∅" : String(v.to)}</span>
                            </TableCell>
                          </TableRow>
                        ));
                      })}
                  </TableBody>
                </Table>
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => runMut.mutate(true)}
                disabled={(!rows.length && !rosterRows.length) || runMut.isPending}
                className="gap-1.5"
              >
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!previewResult) {
                    toast.error("Please preview the upload first");
                    return;
                  }
                  setConfirmText("");
                  if (deactivateMissing && (previewResult.deactivateCount ?? 0) > 0 && !deactAcknowledged) {
                    setDeactConfirmOpen(true);
                    return;
                  }
                  setConfirmOpen(true);
                }}
                disabled={(!rows.length && !rosterRows.length) || runMut.isPending || committed}
                className="gap-1.5"
              >
                <ShieldAlert className="h-4 w-4" /> {runMut.isPending ? "Working…" : committed ? "Override applied" : "Apply override"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="audit">
            <ScrollArea className="h-[360px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">When</TableHead>
                    <TableHead className="text-xs">By</TableHead>
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs text-right">Rows</TableHead>
                    <TableHead className="text-xs text-right">Created</TableHead>
                    <TableHead className="text-xs text-right">Updated</TableHead>
                    <TableHead className="text-xs text-right">Errors</TableHead>
                    <TableHead className="text-xs">Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No uploads yet.</TableCell></TableRow>
                  )}
                  {auditLog.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(l.uploaded_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{l.uploaded_by_name ?? "—"}</TableCell>
                      <TableCell className="text-xs truncate max-w-[180px]">{l.file_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{l.total_rows}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-emerald-700 dark:text-emerald-400">{l.created_count}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-blue-700 dark:text-blue-400">{l.updated_count}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-destructive">{l.error_count}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{l.dry_run ? "preview" : "commit"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="snapshots">
            <ScrollArea className="h-[360px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">When</TableHead>
                    <TableHead className="text-xs">Taken by</TableHead>
                    <TableHead className="text-xs">Note</TableHead>
                    <TableHead className="text-xs text-right">Staff</TableHead>
                    <TableHead className="text-xs text-right">Roster</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No snapshots yet.</TableCell></TableRow>
                  )}
                  {snapshots.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(s.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{s.taken_by_name ?? "—"}</TableCell>
                      <TableCell className="text-xs truncate max-w-[220px]">{s.note ?? s.file_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{s.profiles_count}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{s.night_guard_count}</TableCell>
                      <TableCell className="text-xs">
                        {s.restored_at
                          ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">restored {format(parseISO(s.restored_at), "dd MMM HH:mm")}</Badge>
                          : <Badge variant="outline" className="text-[10px]">available</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                          disabled={restoreMut.isPending}
                          onClick={() => {
                            if (!confirm(`Restore this snapshot?\n\nThis will replace ALL Night Guard assignments and reset staff fields to the snapshot values. Cannot be undone except by another snapshot.`)) return;
                            restoreMut.mutate(s.id);
                          }}
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Confirmation step — type CONFIRM_KEYWORD to enable commit */}
      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!runMut.isPending) setConfirmOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Confirm override
            </DialogTitle>
            <DialogDescription>
              You are about to override the staff database{rosterRows.length ? " and replace Night Guard duty rosters" : ""}. This writes to live data{takeSnapshot ? " (a snapshot will be taken first for rollback)" : " WITHOUT a backup"}.
            </DialogDescription>
          </DialogHeader>

          {previewResult && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Inserts (new staff)</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{previewResult.createdCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Updates (modified)</span>
                  <span className="font-semibold text-blue-700 dark:text-blue-400 tabular-nums">{previewResult.updatedCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">No-change (skipped)</span>
                  <span className="font-semibold tabular-nums">{previewResult.skippedCount}</span>
                </div>
                {previewResult.errorCount > 0 && (
                  <div className="flex items-center justify-between text-sm pt-1.5 border-t">
                    <span className="text-destructive">Errors (will be skipped)</span>
                    <span className="font-semibold text-destructive tabular-nums">{previewResult.errorCount}</span>
                  </div>
                )}
                {(previewResult.deactivateCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-700 dark:text-orange-400">Will be deactivated (missing from file)</span>
                    <span className="font-semibold text-orange-700 dark:text-orange-400 tabular-nums">{previewResult.deactivateCount}</span>
                  </div>
                )}
                {(previewResult.rosterPlanned ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-700 dark:text-purple-400">Night Guard roster rows ({previewResult.rosterDates?.length ?? 0} day(s) replaced)</span>
                    <span className="font-semibold text-purple-700 dark:text-purple-400 tabular-nums">{previewResult.rosterPlanned}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm pt-1.5 border-t">
                  <span className="font-medium">Snapshot before commit</span>
                  <span className="font-bold tabular-nums">{takeSnapshot ? "yes" : "NO — irreversible"}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-destructive">{CONFIRM_KEYWORD}</span> to enable the commit button:
                </label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_KEYWORD}
                  autoComplete="off"
                  autoFocus
                  className="font-mono"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={runMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== CONFIRM_KEYWORD || runMut.isPending}
              onClick={() => {
                setConfirmOpen(false);
                runMut.mutate(false);
              }}
              className="gap-1.5"
            >
              <ShieldAlert className="h-4 w-4" /> {runMut.isPending ? "Applying…" : "Apply override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Second confirmation — list staff that will be deactivated */}
      <Dialog open={deactConfirmOpen} onOpenChange={(v) => { if (!runMut.isPending) setDeactConfirmOpen(v); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <ShieldAlert className="h-5 w-5" /> Confirm staff deactivations
            </DialogTitle>
            <DialogDescription>
              The following <strong>{previewResult?.deactivateCount ?? 0}</strong> staff are not present in your upload and will be set to <code className="text-[10px]">inactive</code>.
              Review by department before continuing to the final override confirmation.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[340px] rounded border bg-muted/20">
            <div className="p-3 space-y-3">
              {deactivationsByDept.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No staff will be deactivated.</p>
              )}
              {deactivationsByDept.map((group) => (
                <div key={group.department} className="rounded-md border bg-background">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                    <span className="text-xs font-semibold uppercase tracking-wide">{group.department}</span>
                    <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                      {group.staff.length} staff
                    </Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Staff ID</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Name</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Rank</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Designation</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Office</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.staff.map((s) => (
                          <TableRow key={s.staffId}>
                            <TableCell className="font-mono text-xs text-muted-foreground py-1.5">{s.staffId}</TableCell>
                            <TableCell className="text-xs font-medium py-1.5">{s.fullName}</TableCell>
                            <TableCell className="text-xs py-1.5">{s.rank}</TableCell>
                            <TableCell className="text-xs py-1.5">{s.designation}</TableCell>
                            <TableCell className="text-xs py-1.5">{s.office}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700">
            <AlertCircle className="h-4 w-4 text-orange-700 dark:text-orange-400" />
            <AlertDescription className="text-xs text-orange-900 dark:text-orange-200">
              Deactivated staff retain all historical records and can be reactivated later, but will lose access until restored.
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeactConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeactivateMissing(false);
                setDeactConfirmOpen(false);
                setDeactAcknowledged(true);
                setConfirmText("");
                setConfirmOpen(true);
                toast.message("Deactivation disabled — staff missing from file will be left untouched");
              }}
            >
              Skip deactivation
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => {
                setDeactAcknowledged(true);
                setDeactConfirmOpen(false);
                setConfirmText("");
                setConfirmOpen(true);
              }}
            >
              <ShieldAlert className="h-4 w-4" /> Acknowledge &amp; continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
