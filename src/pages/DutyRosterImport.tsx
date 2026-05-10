// src/pages/DutyRosterImport.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Eye, Trash2, Rocket, Loader2, Settings2, CalendarRange, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { DeployedAssignmentsDialog } from "@/components/shifts/DeployedAssignmentsDialog";
import { downloadCSVString } from "@/lib/download-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  shift: "A" | "B" | "C" | "D";
  serial_no: number;
  rank: string;
  name: string;
  gender: string;
  unit: string;
};

type ParseResult = {
  rows: Row[];
  warnings: string[];
};

const SHIFTS = ["A", "B", "C", "D"] as const;

function normaliseHeader(h: string) {
  return (h || "").toString().trim().toLowerCase().replace(/[^a-z]/g, "");
}

function detectColumn(headers: string[], candidates: string[]): number {
  const norm = headers.map(normaliseHeader);
  for (const c of candidates) {
    const idx = norm.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseSheet(rowsAoA: any[][]): ParseResult {
  const warnings: string[] = [];
  if (!rowsAoA.length) return { rows: [], warnings: ["Empty sheet"] };

  // Find the header row — it's the first row containing "name" + "rank"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rowsAoA.length); i++) {
    const norm = rowsAoA[i].map((c) => normaliseHeader(String(c ?? "")));
    if (norm.includes("name") && norm.includes("rank")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    warnings.push("Could not find a header row (need columns including 'Name' and 'Rank')");
    return { rows: [], warnings };
  }

  const headers = rowsAoA[headerIdx].map((c) => String(c ?? ""));
  const colShift = detectColumn(headers, ["shift"]);
  const colSn = detectColumn(headers, ["sn", "serialno", "serial", "no"]);
  const colRank = detectColumn(headers, ["rank"]);
  const colName = detectColumn(headers, ["name", "fullname"]);
  const colSex = detectColumn(headers, ["fm", "sex", "gender"]);
  const colUnit = detectColumn(headers, ["unit", "units"]);

  if (colRank === -1 || colName === -1) {
    warnings.push("Required columns 'Rank' and 'Name' missing");
    return { rows: [], warnings };
  }

  const rows: Row[] = [];
  let currentShift: Row["shift"] | null = colShift === -1 ? "A" : null;

  for (let i = headerIdx + 1; i < rowsAoA.length; i++) {
    const r = rowsAoA[i];
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;

    // Shift label rows like "SHIFT B" with the rest empty (or shift cell only)
    const joined = r.map((c) => String(c ?? "").trim()).join(" ").toUpperCase();
    const shiftLabel = joined.match(/SHIFT\s+([ABCD])\b/);
    if (shiftLabel && (colShift === -1 || !r[colName])) {
      currentShift = shiftLabel[1] as Row["shift"];
      continue;
    }

    const shiftCell = colShift !== -1 ? String(r[colShift] ?? "").trim().toUpperCase() : "";
    const shift = (SHIFTS.includes(shiftCell as any) ? shiftCell : currentShift) as Row["shift"] | null;
    const snRaw = String(r[colSn === -1 ? -1 : colSn] ?? "").replace(/\.$/, "").trim();
    const rank = String(r[colRank] ?? "").trim();
    const name = String(r[colName] ?? "").trim();
    const gender = colSex === -1 ? "" : String(r[colSex] ?? "").trim().toUpperCase();
    const unit = colUnit === -1 ? "" : String(r[colUnit] ?? "").trim();

    if (!shift) { warnings.push(`Row ${i + 1}: cannot determine shift, skipped`); continue; }
    if (!rank || !name) continue;
    const sn = parseInt(snRaw || "0", 10);
    if (!sn) { warnings.push(`Row ${i + 1}: invalid S/N "${snRaw}", skipped`); continue; }

    rows.push({ shift, serial_no: sn, rank, name, gender, unit });
  }

  // Duplicate detection per shift
  const seen = new Map<string, number>();
  const deduped: Row[] = [];
  for (const r of rows) {
    const k = `${r.shift}|${r.serial_no}|${r.name.toUpperCase()}`;
    if (seen.has(k)) { warnings.push(`Duplicate ${r.shift}/${r.serial_no}/${r.name} merged`); continue; }
    seen.set(k, 1);
    deduped.push(r);
  }

  return { rows: deduped, warnings };
}

async function readFileAsAoA(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // If workbook has multiple sheets, prefer "All Shifts" or the first
  const preferred = wb.SheetNames.find((n) => /all/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[preferred];
  return XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
}

export default function DutyRosterImport() {
  const { user, isAdminOrSupervisor, loading } = useAuthContext();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [committing, setCommitting] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{ effective_date: string; label: string } | null>(null);
  const [previewEndDate, setPreviewEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!previewEndDate || previewEndDate < effectiveDate) setPreviewEndDate(effectiveDate);
  }, [effectiveDate]);

  const handleRedeploy = async (importId: string) => {
    setDeployingId(importId);
    try {
      const { data, error } = await supabase.rpc("auto_deploy_roster_assignments", { _import_id: importId });
      if (error) throw error;
      const d: any = data ?? {};
      toast.success(
        `Deployed ${d.assigned ?? 0} staff to shifts · ${d.skipped_already_on_shift ?? 0} already current · ${d.missing_shift_definition ?? 0} unmapped`
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Deploy failed");
    } finally {
      setDeployingId(null);
    }
  };

  const recent = useQuery({
    queryKey: ["duty-roster-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("duty_roster_imports")
        .select("id, source_filename, effective_date, row_count, status, committed_at, created_at, notes")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isAdminOrSupervisor,
  });

  const counts = useMemo(() => {
    const acc: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    parsed?.rows.forEach((r) => { acc[r.shift] = (acc[r.shift] ?? 0) + 1; });
    return acc;
  }, [parsed]);

  // Schedule preview — fetch directory once parsed rows exist
  const directory = useQuery({
    queryKey: ["roster-preview-directory"],
    enabled: !!parsed && parsed.rows.length > 0 && isAdminOrSupervisor,
    queryFn: async () => {
      const [{ data: profs, error: e1 }, { data: depts, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, staff_id, shift_group, department_id, office"),
        supabase.from("departments").select("id, name"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const deptMap = new Map<string, string>();
      (depts ?? []).forEach((d: any) => deptMap.set(d.id, d.name));
      return {
        profiles: (profs ?? []) as Array<{
          id: string; first_name: string | null; last_name: string | null;
          staff_id: string | null; shift_group: string | null;
          department_id: string | null; office: string | null;
        }>,
        deptMap,
      };
    },
  });

  const previewPlan = useMemo(() => {
    if (!parsed || !directory.data) return null;
    const { profiles: dir, deptMap } = directory.data;
    const upper = (s: string | null | undefined) => (s ?? "").toUpperCase().trim();
    const emptyShifts = () => ({ A: 0, B: 0, C: 0, D: 0 } as Record<"A"|"B"|"C"|"D", number>);

    const matches: Array<{
      shift: "A"|"B"|"C"|"D"; staff_name: string; staff_id: string | null;
      previous: string | null; next: "A"|"B"|"C"|"D"; status: "matched"|"new";
      department: string; office: string;
    }> = [];

    parsed.rows.forEach((r) => {
      const parts = r.name.trim().split(/\s+/);
      const last = parts[0] ?? "";
      const first = parts[1] ?? "";
      let p = dir.find((x) =>
        upper(x.last_name) === upper(last) &&
        (first === "" || upper(x.first_name).startsWith(upper(first)))
      );
      if (!p && first) {
        p = dir.find((x) =>
          upper(x.first_name) === upper(last) &&
          upper(x.last_name).startsWith(upper(first))
        );
      }
      const department =
        (p?.department_id && deptMap.get(p.department_id)) ||
        (r.unit?.trim() ? r.unit.trim() : "Unassigned");
      const office = p?.office?.trim() || "Unassigned";
      matches.push({
        shift: r.shift,
        staff_name: p ? `${p.last_name ?? ""}, ${p.first_name ?? ""}` : r.name,
        staff_id: p?.staff_id ?? null,
        previous: p?.shift_group ?? null,
        next: r.shift,
        status: p ? "matched" : "new",
        department,
        office,
      });
    });

    const summary = emptyShifts();
    let changed = 0, kept = 0, created = 0;
    const byDepartment = new Map<string, Record<"A"|"B"|"C"|"D", number> & { total: number }>();
    const byOffice = new Map<string, Record<"A"|"B"|"C"|"D", number> & { total: number }>();
    const bump = (m: Map<string, any>, key: string, shift: "A"|"B"|"C"|"D") => {
      let row = m.get(key);
      if (!row) { row = { ...emptyShifts(), total: 0 }; m.set(key, row); }
      row[shift]++; row.total++;
    };
    matches.forEach((m) => {
      summary[m.next]++;
      if (m.status === "new") created++;
      else if (m.previous === m.next) kept++;
      else changed++;
      bump(byDepartment, m.department, m.next);
      bump(byOffice, m.office, m.next);
    });
    const sortRows = (m: Map<string, any>) =>
      Array.from(m.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
      matches, summary, changed, kept, created,
      byDepartment: sortRows(byDepartment),
      byOffice: sortRows(byOffice),
    };
  }, [parsed, directory.data]);



  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setFile(null); setParsed(null); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const previewRangeLabel = previewEndDate && previewEndDate !== effectiveDate
    ? `${effectiveDate} to ${previewEndDate}`
    : effectiveDate;

  const exportPreviewCSV = () => {
    if (!previewPlan) { toast.error("Preview not ready"); return; }
    const header = ["Shift", "Staff Name", "Staff ID", "Current Shift", "Will Become", "Status"];
    const lines = [header.join(",")];
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    previewPlan.matches.forEach((m) => {
      lines.push([
        m.shift,
        esc(m.staff_name),
        esc(m.staff_id ?? ""),
        esc(m.status === "new" ? "new stub" : (m.previous ?? "")),
        `Shift ${m.next}`,
        m.status === "new" ? "new" : (m.previous === m.next ? "unchanged" : "changing"),
      ].join(","));
    });
    lines.push("");
    lines.push(`# Effective range,${previewRangeLabel}`);
    (["A","B","C","D"] as const).forEach((s) => lines.push(`# Shift ${s} count,${previewPlan.summary[s]}`));
    lines.push(`# Changing,${previewPlan.changed}`);
    lines.push(`# Unchanged,${previewPlan.kept}`);
    lines.push(`# New stubs,${previewPlan.created}`);
    downloadCSVString(lines.join("\n"), `schedule-preview_${effectiveDate}.csv`);
    toast.success("CSV exported");
  };

  const exportPreviewPDF = () => {
    if (!previewPlan) { toast.error("Preview not ready"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Duty Roster — Schedule Preview (A/B/C/D)", 40, 40);
    doc.setFontSize(10);
    doc.text(`Effective: ${previewRangeLabel}`, 40, 58);
    const summary = `Shift A: ${previewPlan.summary.A}   Shift B: ${previewPlan.summary.B}   Shift C: ${previewPlan.summary.C}   Shift D: ${previewPlan.summary.D}   |   Changing: ${previewPlan.changed}   Unchanged: ${previewPlan.kept}   New stubs: ${previewPlan.created}`;
    doc.text(summary, 40, 74);

    autoTable(doc, {
      startY: 90,
      head: [["Shift", "Staff Name", "Staff ID", "Current", "Will Become", "Status"]],
      body: previewPlan.matches.map((m) => [
        m.shift,
        m.staff_name,
        m.staff_id ?? "—",
        m.status === "new" ? "new stub" : (m.previous ?? "—"),
        `Shift ${m.next}`,
        m.status === "new" ? "new" : (m.previous === m.next ? "unchanged" : "changing"),
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 35], textColor: 255 },
      didDrawPage: () => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        const page = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(8);
        doc.text(
          `Generated ${new Date().toLocaleString()}  ·  Page ${page} of ${pageCount}  ·  CONFIDENTIAL`,
          40, doc.internal.pageSize.getHeight() - 20,
        );
      },
    });

    doc.save(`schedule-preview_${effectiveDate}.pdf`);
    toast.success("PDF exported");
  };


  const handleFile = async (f: File) => {
    setFile(f); setParsed(null);
    try {
      const aoA = await readFileAsAoA(f);
      const result = parseSheet(aoA);
      setParsed(result);
      if (result.rows.length === 0) toast.error("No valid rows found");
      else toast.success(`Parsed ${result.rows.length} rows — review before saving`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to read file");
    }
  };

  const handleCommit = async () => {
    if (!parsed || parsed.rows.length === 0 || !file) return;
    setCommitting(true);
    try {
      const { data: imp, error: e1 } = await supabase
        .from("duty_roster_imports")
        .insert({
          effective_date: effectiveDate,
          source_filename: file.name,
          row_count: parsed.rows.length,
          status: "preview",
          notes: notes || null,
          uploaded_by: user.id,
        })
        .select("id")
        .single();
      if (e1 || !imp) throw e1 ?? new Error("Failed to create import");

      // Insert entries in batches of 200
      const entries = parsed.rows.map((r) => ({ ...r, import_id: imp.id }));
      for (let i = 0; i < entries.length; i += 200) {
        const slice = entries.slice(i, i + 200);
        const { error: e2 } = await supabase.from("duty_roster_entries").insert(slice);
        if (e2) throw e2;
      }

      const { error: e3 } = await supabase
        .from("duty_roster_imports")
        .update({ status: "committed", committed_at: new Date().toISOString() })
        .eq("id", imp.id);
      if (e3) throw e3;

      // Auto-match staff by name; create pending stubs for unmatched
      const { data: matchRes, error: e4 } = await supabase.rpc("auto_match_roster_entries", { _import_id: imp.id });
      if (e4) {
        toast.warning(`Saved ${entries.length} rows, but auto-match failed: ${e4.message}`);
      } else {
        const r: any = matchRes ?? {};
        // Auto-deploy A/B/C/D shift assignments for matched staff
        const { data: depRes, error: e5 } = await supabase.rpc("auto_deploy_roster_assignments", { _import_id: imp.id });
        if (e5) {
          toast.warning(
            `Saved ${entries.length} rows · ${r.matched ?? 0} matched · ${r.pending ?? 0} pending · deploy failed: ${e5.message}`
          );
        } else {
          const d: any = depRes ?? {};
          toast.success(
            `Saved ${entries.length} rows · ${r.matched ?? 0} matched · ${d.assigned ?? 0} deployed to A/B/C/D · ${r.pending ?? 0} pending approval`
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["duty-roster-imports"] });
      qc.invalidateQueries({ queryKey: ["pending-staff-matches"] });
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Commit failed");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" /> Duty Roster Import
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or XLSX duty roster, preview parsed rows, then commit to the system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload file</CardTitle>
          <CardDescription>
            Accepts <code>.csv</code>, <code>.xlsx</code>. Required columns: <strong>Rank</strong>, <strong>Name</strong>. Optional: <strong>Shift</strong>, <strong>S/N</strong>, <strong>F/M</strong>, <strong>Unit</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">{file ? <strong>{file.name}</strong> : "Click to choose or drop a file here"}</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="eff" className="text-xs">Effective date</Label>
              <Input id="eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="nt" className="text-xs">Notes (optional)</Label>
              <Textarea id="nt" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context for this import…" />
            </div>
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" /> 2. Preview
            </CardTitle>
            <CardDescription>
              {parsed.rows.length === 0 ? "No rows could be parsed." : "Review parsed rows before saving. Nothing is written until you click Commit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SHIFTS.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  Shift {s}: <strong className="ml-1">{counts[s]}</strong>
                </Badge>
              ))}
              <Badge className="text-xs">Total: {parsed.rows.length}</Badge>
              {parsed.warnings.length > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" /> {parsed.warnings.length} warning{parsed.warnings.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            {parsed.warnings.length > 0 && (
              <details className="text-xs rounded-md border bg-amber-50 p-2 max-h-32 overflow-auto">
                <summary className="cursor-pointer font-medium text-amber-800">View warnings</summary>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {parsed.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}
                  {parsed.warnings.length > 50 && <li>…and {parsed.warnings.length - 50} more</li>}
                </ul>
              </details>
            )}

            {parsed.rows.length > 0 && (
              <Tabs defaultValue="A" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-4">
                  {SHIFTS.map((s) => (
                    <TabsTrigger key={s} value={s} className="text-xs">Shift {s} ({counts[s]})</TabsTrigger>
                  ))}
                </TabsList>
                {SHIFTS.map((s) => (
                  <TabsContent key={s} value={s} className="mt-3">
                    <div className="rounded-lg border overflow-x-auto">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">S/N</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-16">F/M</TableHead>
                            <TableHead>Unit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsed.rows.filter((r) => r.shift === s).map((r) => (
                            <TableRow key={`${r.shift}-${r.serial_no}-${r.name}`}>
                              <TableCell className="font-mono text-xs">{r.serial_no}</TableCell>
                              <TableCell className="text-xs">{r.rank}</TableCell>
                              <TableCell className="text-xs font-medium">{r.name}</TableCell>
                              <TableCell className="text-xs">{r.gender}</TableCell>
                              <TableCell className="text-xs">{r.unit}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}

            {/* Schedule preview — what auto-deploy will do for the effective date */}
            {parsed.rows.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Schedule preview</span>
                  <span className="text-xs text-muted-foreground">
                    Computed A/B/C/D assignments effective <strong>{effectiveDate}</strong>
                    {previewEndDate && previewEndDate !== effectiveDate ? <> through <strong>{previewEndDate}</strong></> : null}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Label htmlFor="prev-end" className="text-[11px] text-muted-foreground">Range end</Label>
                    <Input
                      id="prev-end" type="date" className="h-7 text-xs w-36"
                      value={previewEndDate}
                      min={effectiveDate}
                      onChange={(e) => setPreviewEndDate(e.target.value)}
                    />
                    <Button
                      type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={exportPreviewCSV}
                      disabled={!previewPlan}
                      title="Download preview as CSV"
                    >
                      <Download className="h-3 w-3 mr-1" /> CSV
                    </Button>
                    <Button
                      type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={exportPreviewPDF}
                      disabled={!previewPlan}
                      title="Download preview as PDF"
                    >
                      <FileText className="h-3 w-3 mr-1" /> PDF
                    </Button>
                  </div>
                </div>

                {directory.isLoading || !previewPlan ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="h-3 w-3 animate-spin" /> Computing planned assignments…
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {(["A","B","C","D"] as const).map((s) => (
                        <Badge key={s} variant="outline">Shift {s}: <strong className="ml-1">{previewPlan.summary[s]}</strong></Badge>
                      ))}
                      <Badge className="bg-primary/15 text-primary border-primary/30">Changing: {previewPlan.changed}</Badge>
                      <Badge variant="outline">Unchanged: {previewPlan.kept}</Badge>
                      <Badge variant="outline">New stubs: {previewPlan.created}</Badge>
                    </div>
                    {previewPlan.changed === 0 && previewPlan.created === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">All staff already match this shift configuration.</p>
                    ) : (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          View {previewPlan.changed + previewPlan.created} planned change{previewPlan.changed + previewPlan.created === 1 ? "" : "s"}
                        </summary>
                        <div className="rounded border mt-2 overflow-x-auto max-h-60">
                          <Table className="min-w-[640px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">Shift</TableHead>
                                <TableHead>Staff</TableHead>
                                <TableHead className="w-28">Staff ID</TableHead>
                                <TableHead className="w-32">Current</TableHead>
                                <TableHead className="w-32">Will become</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewPlan.matches
                                .filter((m) => m.status === "new" || m.previous !== m.next)
                                .slice(0, 200)
                                .map((m, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-[11px]"><Badge variant="outline">{m.shift}</Badge></TableCell>
                                    <TableCell className="text-xs">{m.staff_name}</TableCell>
                                    <TableCell className="text-[11px] font-mono">{m.staff_id ?? "—"}</TableCell>
                                    <TableCell className="text-[11px]">
                                      {m.status === "new" ? <span className="italic text-muted-foreground">new stub</span> : (m.previous ?? "—")}
                                    </TableCell>
                                    <TableCell className="text-[11px] font-medium">Shift {m.next}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset} disabled={committing}>
                <XCircle className="h-4 w-4 mr-1" /> Discard
              </Button>
              <Button onClick={handleCommit} disabled={committing || parsed.rows.length === 0}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> {committing ? "Saving…" : `Commit ${parsed.rows.length} rows`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-20">Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Saved at</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (recent.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No imports yet</TableCell></TableRow>
                ) : (
                  (recent.data ?? []).map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs">{i.effective_date}</TableCell>
                      <TableCell className="text-xs">{i.source_filename}</TableCell>
                      <TableCell className="text-xs font-mono">{i.row_count}</TableCell>
                      <TableCell>
                        <Badge variant={i.status === "committed" ? "default" : i.status === "cancelled" ? "destructive" : "outline"} className="text-xs">
                          {i.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{i.committed_at ? new Date(i.committed_at).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        {i.status === "committed" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={deployingId === i.id}
                              onClick={() => handleRedeploy(i.id)}
                              title="Re-deploy A/B/C/D shift assignments using this import's effective date"
                            >
                              {deployingId === i.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Rocket className="h-3 w-3" />}
                              Deploy
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => setOverrideTarget({
                                effective_date: i.effective_date,
                                label: i.source_filename,
                              })}
                              title="Override individual staff shift assignments (audited)"
                            >
                              <Settings2 className="h-3 w-3" /> Override
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {overrideTarget && (
        <DeployedAssignmentsDialog
          open={!!overrideTarget}
          onOpenChange={(o) => { if (!o) setOverrideTarget(null); }}
          effectiveDate={overrideTarget.effective_date}
          importLabel={overrideTarget.label}
        />
      )}
    </div>
  );
}
