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
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Eye, Trash2, Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

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

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setFile(null); setParsed(null); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (recent.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No imports yet</TableCell></TableRow>
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
