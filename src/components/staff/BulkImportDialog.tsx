import { useState, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type StaffStatus = Database["public"]["Enums"]["staff_status"];

interface ParsedRow {
  staff_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  serial_no?: string;
  gender?: string;
  phone?: string;
  unit?: string;
  shift_group?: string;
  rank_abbr?: string;
  department_name?: string;
  office?: string;
  status?: StaffStatus;
  error?: string;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  "staff id": "staff_id",
  "staff_id": "staff_id",
  "staffid": "staff_id",
  "id": "staff_id",
  "s/n": "serial_no",
  "sn": "serial_no",
  "serial": "serial_no",
  "serial no": "serial_no",
  "serial number": "serial_no",
  "name": "full_name",
  "full name": "full_name",
  "first name": "first_name",
  "first_name": "first_name",
  "firstname": "first_name",
  "last name": "last_name",
  "last_name": "last_name",
  "lastname": "last_name",
  "surname": "last_name",
  "gender": "gender",
  "sex": "gender",
  "phone": "phone",
  "telephone": "phone",
  "phone number": "phone",
  "mobile": "phone",
  "unit": "unit",
  "section": "unit",
  "shift": "shift_group",
  "shift group": "shift_group",
  "shift_group": "shift_group",
  "rank": "rank_abbr",
  "rank abbreviation": "rank_abbr",
  "department": "department_name",
  "dept": "department_name",
  "office": "office",
  "office location": "office",
  "location": "office",
  "duty post": "office",
  "status": "status",
};

const VALID_STATUSES: StaffStatus[] = ["active", "inactive", "study_leave", "transferred"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, "");
}

function splitFullName(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return { first_name: "", last_name: "" };
  if (cleaned.includes(",")) {
    const [last, ...rest] = cleaned.split(",");
    return {
      first_name: rest.join(" ").trim(),
      last_name: last.trim(),
    };
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return {
    first_name: parts.slice(0, -1).join(" ").trim(),
    last_name: parts[parts.length - 1].trim(),
  };
}

function inferStaffId(row: Partial<ParsedRow>, rowIndex: number) {
  if (row.staff_id) return row.staff_id;
  const serial = String(row.serial_no ?? "").replace(/\D/g, "");
  if (serial) return `IMP-${serial.padStart(4, "0")}`;
  return `IMP-${String(rowIndex + 1).padStart(4, "0")}`;
}

export function BulkImportDialog({ open, onOpenChange }: BulkImportDialogProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const { data } = await supabase.from("ranks").select("*");
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("*");
      return data ?? [];
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (raw.length === 0) {
          toast.error("No data found in the file");
          return;
        }

        const headers = Object.keys(raw[0]);
        const mapping: Record<string, keyof ParsedRow> = {};
        headers.forEach((h) => {
          const key = normalizeHeader(h);
          if (COLUMN_MAP[key]) mapping[h] = COLUMN_MAP[key];
          else if (h.trim() === "#") mapping[h] = "serial_no";
        });

        const parsed: ParsedRow[] = raw.map((row, rowIndex) => {
          const p: Partial<ParsedRow> = {};
          Object.entries(mapping).forEach(([orig, field]) => {
            (p as any)[field] = String(row[orig] ?? "").trim();
          });

          if ((!p.first_name || !p.last_name) && p.full_name) {
            const split = splitFullName(p.full_name);
            p.first_name = p.first_name || split.first_name;
            p.last_name = p.last_name || split.last_name;
          }

          p.staff_id = inferStaffId(p, rowIndex);

          const errors: string[] = [];
          if (!p.staff_id) errors.push("Missing Staff ID");
          if (!p.first_name) errors.push("Missing First Name");
          if (!p.last_name) errors.push("Missing Last Name");
          if (p.status && !VALID_STATUSES.includes(p.status as StaffStatus)) {
            p.status = "active";
          }

          return {
            staff_id: p.staff_id || "",
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            gender: p.gender || undefined,
            phone: p.phone || undefined,
            unit: p.unit || undefined,
            shift_group: p.shift_group || undefined,
            rank_abbr: p.rank_abbr || undefined,
            department_name: p.department_name || undefined,
            office: p.office || undefined,
            status: (p.status as StaffStatus) || "active",
            error: errors.length ? errors.join(", ") : undefined,
          };
        });

        setRows(parsed);
      } catch {
        toast.error("Failed to parse file. Please upload a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setProgress(0);
    let success = 0;
    let failed = 0;

    const rankMap = new Map(ranks.map((r) => [r.abbreviation.toLowerCase(), r.id]));
    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));

    const BATCH = 20;
    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH).map((r) => ({
        staff_id: r.staff_id,
        first_name: r.first_name,
        last_name: r.last_name,
        gender: r.gender || null,
        phone: r.phone || null,
        unit: r.unit || null,
        shift_group: r.shift_group || null,
        rank_id: r.rank_abbr ? rankMap.get(r.rank_abbr.toLowerCase()) ?? null : null,
        department_id: r.department_name ? deptMap.get(r.department_name.toLowerCase()) ?? null : null,
        office: r.office || null,
        status: r.status || "active",
      }));

      const { error } = await supabase.from("profiles").insert(batch as any);
      if (error) {
        // Try one by one
        for (const item of batch) {
          const { error: e2 } = await supabase.from("profiles").insert(item as any);
          if (e2) failed++;
          else success++;
        }
      } else {
        success += batch.length;
      }
      setProgress(Math.round(((i + batch.length) / validRows.length) * 100));
    }

    setResult({ success, failed });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["staff"] });
    if (success > 0) toast.success(`${success} staff imported successfully`);
    if (failed > 0) toast.error(`${failed} records failed to import`);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Staff ID", "First Name", "Last Name", "Gender", "Phone", "Unit", "Shift Group", "Rank", "Department", "Office", "Status"],
      ["GIS-00001", "John", "Doe", "Male", "0201234567", "Operations", "A", "Cpl", "Administration", "Amasaman HQ", "active"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff Template");
    XLSX.writeFile(wb, "staff_import_template.xlsx");
  };

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Bulk Staff Import
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 && !result ? (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">Click to upload Excel or CSV file</p>
              <p className="text-sm text-muted-foreground mt-1">Supports .xlsx, .xls, .csv formats</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
              <Download className="h-4 w-4" /> Download Import Template
            </Button>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Expected columns:</p>
              <p>Staff ID, First Name, Last Name, Gender, Phone, Unit, Shift Group, Rank (abbreviation), Department (name), Office, Status</p>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
            <div>
              <p className="text-lg font-semibold">Import Complete</p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.success} imported successfully{result.failed > 0 && `, ${result.failed} failed`}
              </p>
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                File: <span className="font-medium text-foreground">{fileName}</span>
              </p>
              <div className="flex gap-2">
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">{validRows.length} valid</Badge>
                {errorRows.length > 0 && <Badge variant="secondary" className="bg-red-100 text-red-800">{errorRows.length} errors</Badge>}
              </div>
            </div>

            {importing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{progress}% — Importing...</p>
              </div>
            )}

            <div className="rounded border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map((r, i) => (
                    <TableRow key={i} className={r.error ? "bg-red-50" : ""}>
                      <TableCell className="text-xs">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{r.staff_id || "—"}</TableCell>
                      <TableCell>{r.first_name} {r.last_name}</TableCell>
                      <TableCell className="text-xs">{r.rank_abbr || "—"}</TableCell>
                      <TableCell className="text-xs">{r.department_name || "—"}</TableCell>
                      <TableCell>
                        {r.error ? (
                          <span className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {r.error}
                          </span>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-xs">{r.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 100 && <p className="text-xs text-muted-foreground p-2 text-center">Showing first 100 of {rows.length} rows</p>}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={importing}>Reset</Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0} className="gap-2">
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> : `Import ${validRows.length} Staff`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
