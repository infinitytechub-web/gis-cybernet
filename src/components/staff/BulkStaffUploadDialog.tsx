import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Eye, Save, History, Download, ShieldAlert, RotateCcw, Camera } from "lucide-react";
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

type Outcome = {
  rowIndex: number;
  staffId: string | null;
  status: "create" | "update" | "skip" | "error";
  message?: string;
  changedFields?: string[];
  diff?: Record<string, { from: any; to: any }>;
};

type RunResult = {
  dryRun: boolean;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  commitErrors: { staffId: string; error: string }[];
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
    const lines = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_SAMPLE_ROWS.map((r) => r.map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(","))];
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
  const [previewResult, setPreviewResult] = useState<RunResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const CONFIRM_KEYWORD = "COMMIT";

  const reset = () => {
    setFileName(null); setRows([]); setPreviewResult(null); setCommitted(false); setFilter("all");
  };

  const exportDiffCsv = () => {
    if (!previewResult) return;
    const header = ["row", "staff_id", "status", "field", "from", "to", "message"];
    const lines = [header.join(",")];
    const esc = (v: any) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

  const runMut = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.functions.invoke("bulk-upload-staff", {
        body: { rows, fileName, dryRun },
      });
      if (error) throw error;
      return data as RunResult;
    },
    onSuccess: (res, dryRun) => {
      setPreviewResult(res);
      if (!dryRun) {
        setCommitted(true);
        qc.invalidateQueries({ queryKey: ["directory-staff"] });
        qc.invalidateQueries({ queryKey: ["bulk-staff-audit"] });
        toast.success(`Uploaded — ${res.createdCount} created, ${res.updatedCount} updated, ${res.errorCount} errors`);
      } else {
        toast.message(`Preview: ${res.createdCount} create · ${res.updatedCount} update · ${res.skippedCount} skip · ${res.errorCount} error`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
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

  const counts = useMemo(() => {
    if (!previewResult) return null;
    return previewResult;
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
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Bulk Staff List Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or XLSX file to override the staff list. Existing staff (matched by <strong>staff_id</strong>) are updated;
            new staff_ids are created. Use <strong>Preview</strong> first to see what will change.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList>
            <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1.5" /> Upload</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-4 w-4 mr-1.5" /> Recent uploads</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                className="max-w-xs"
              />
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => downloadTemplate("csv")} className="gap-1.5">
                  <Download className="h-4 w-4" /> CSV template
                </Button>
                <Button variant="ghost" size="sm" onClick={() => downloadTemplate("xlsx")} className="gap-1.5">
                  <Download className="h-4 w-4" /> XLSX template
                </Button>
              </div>
            </div>

            {fileName && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"}
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={reset}><X className="h-3 w-3" /></Button>
              </div>
            )}

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
                disabled={!rows.length || runMut.isPending}
                className="gap-1.5"
              >
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button
                onClick={() => {
                  if (!previewResult) {
                    toast.error("Please preview the upload first");
                    return;
                  }
                  setConfirmText("");
                  setConfirmOpen(true);
                }}
                disabled={!rows.length || runMut.isPending || committed}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" /> {runMut.isPending ? "Working…" : committed ? "Committed" : "Commit upload"}
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
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(l.uploaded_at), "dd MMM yyyy HH:mm")}</TableCell>
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
        </Tabs>
      </DialogContent>

      {/* Confirmation step — type CONFIRM_KEYWORD to enable commit */}
      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!runMut.isPending) setConfirmOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" /> Confirm bulk commit
            </DialogTitle>
            <DialogDescription>
              You are about to apply the following changes to the staff database. This action will write to live data and cannot be undone in bulk.
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
                <div className="flex items-center justify-between text-sm pt-1.5 border-t">
                  <span className="font-medium">Total writes</span>
                  <span className="font-bold tabular-nums">{previewResult.createdCount + previewResult.updatedCount}</span>
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
              <Save className="h-4 w-4" /> {runMut.isPending ? "Committing…" : "Commit upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
