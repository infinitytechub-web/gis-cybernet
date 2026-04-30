import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Eye, Save, History, Download } from "lucide-react";
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

const TEMPLATE_HEADERS = [
  "staff_id", "first_name", "last_name", "rank", "department",
  "phone", "gender", "status", "unit", "shift_group",
  "ghana_card_number", "email", "blood_group", "intake",
  "training_designation", "staff_category", "office",
];

function downloadTemplateCsv() {
  const sample = [
    TEMPLATE_HEADERS.join(","),
    "GIS-2026-0001,Jane,Doe,Officer,CYBER & MISD,0244000000,female,active,Alpha,A,GHA-1234567-8,jane.doe@gis.local,O+,12,HUHUNYA,Cadet,HQ",
  ].join("\n");
  const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "staff-list-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

interface Props { trigger?: React.ReactNode }

export function BulkStaffUploadDialog({ trigger }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [previewResult, setPreviewResult] = useState<RunResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const reset = () => {
    setFileName(null); setRows([]); setPreviewResult(null); setCommitted(false);
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
              <Button variant="ghost" size="sm" onClick={downloadTemplateCsv} className="gap-1.5">
                <Download className="h-4 w-4" /> Download template
              </Button>
            </div>

            {fileName && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"}
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={reset}><X className="h-3 w-3" /></Button>
              </div>
            )}

            {counts && (
              <Alert variant={counts.errorCount > 0 ? "destructive" : "default"}>
                {counts.errorCount > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                <AlertTitle>
                  {counts.dryRun ? "Preview" : committed ? "Committed" : "Result"} — {counts.totalRows} row{counts.totalRows === 1 ? "" : "s"}
                </AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{counts.createdCount} create</Badge>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{counts.updatedCount} update</Badge>
                    <Badge variant="outline">{counts.skippedCount} skip</Badge>
                    {counts.errorCount > 0 && <Badge variant="destructive">{counts.errorCount} error</Badge>}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {previewResult && (
              <ScrollArea className="h-[280px] rounded border">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResult.outcomes.map((o) => (
                      <TableRow key={o.rowIndex}>
                        <TableCell className="text-xs text-muted-foreground">{o.rowIndex + 1}</TableCell>
                        <TableCell className="text-xs font-mono">{o.staffId ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={
                            o.status === "create" ? "default" :
                            o.status === "update" ? "secondary" :
                            o.status === "error" ? "destructive" : "outline"
                          } className="text-[10px] capitalize">{o.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {o.message ?? (o.changedFields?.length ? `Changed: ${o.changedFields.join(", ")}` : "—")}
                        </TableCell>
                      </TableRow>
                    ))}
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
                  if (!confirm(`Commit ${previewResult.createdCount + previewResult.updatedCount} change(s)? This cannot be undone in bulk.`)) return;
                  runMut.mutate(false);
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
    </Dialog>
  );
}
