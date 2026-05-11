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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Eye, Trash2, Rocket, Loader2, Settings2, History, CalendarRange } from "lucide-react";
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
  const [effectiveEndDate, setEffectiveEndDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [committing, setCommitting] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [overrideForImport, setOverrideForImport] = useState<string | null>(null);
  const [auditForImport, setAuditForImport] = useState<string | null>(null);

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
    setFile(null); setParsed(null); setNotes(""); setEffectiveEndDate("");
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
          effective_end_date: effectiveEndDate || null,
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="eff" className="text-xs">Effective from</Label>
              <Input id="eff" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="effEnd" className="text-xs">Effective to (optional)</Label>
              <Input id="effEnd" type="date" min={effectiveDate} value={effectiveEndDate} onChange={(e) => setEffectiveEndDate(e.target.value)} />
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
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={committing || parsed.rows.length === 0}>
                <CalendarRange className="h-4 w-4 mr-1" /> Preview schedule…
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
                  <TableHead className="w-64 text-right">Actions</TableHead>
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
                              size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                              onClick={() => setAuditForImport(i.id)}
                              title="View audit trail of deployed/overridden assignments"
                            >
                              <History className="h-3 w-3" /> Audit
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                              onClick={() => setOverrideForImport(i.id)}
                              title="Override deployed shift assignments"
                            >
                              <Settings2 className="h-3 w-3" /> Override
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                              disabled={deployingId === i.id}
                              onClick={() => handleRedeploy(i.id)}
                              title="Re-deploy A/B/C/D shift assignments using this import's effective date"
                            >
                              {deployingId === i.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Rocket className="h-3 w-3" />}
                              Deploy
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

      <SchedulePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        rows={parsed?.rows ?? []}
        counts={counts}
        effectiveDate={effectiveDate}
        effectiveEndDate={effectiveEndDate}
        committing={committing}
        onConfirm={() => { setPreviewOpen(false); handleCommit(); }}
      />

      <OverrideAssignmentsDialog
        importId={overrideForImport}
        onOpenChange={(open) => { if (!open) setOverrideForImport(null); }}
      />

      <DeploymentAuditDialog
        importId={auditForImport}
        onOpenChange={(open) => { if (!open) setAuditForImport(null); }}
      />
    </div>
  );
}

// ───────────────────────── Schedule Preview Dialog ─────────────────────────
function SchedulePreviewDialog({
  open, onOpenChange, rows, counts, effectiveDate, effectiveEndDate, committing, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: Row[];
  counts: Record<string, number>;
  effectiveDate: string;
  effectiveEndDate: string;
  committing: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" /> Schedule preview
          </DialogTitle>
          <DialogDescription>
            Computed A/B/C/D shift assignments for{" "}
            <strong>{effectiveDate || "—"}</strong>
            {effectiveEndDate ? <> through <strong>{effectiveEndDate}</strong></> : <> (open-ended)</>}.
            Confirm to commit and auto-deploy. Unmatched names will queue for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SHIFTS.map((s) => (
            <div key={s} className="rounded-md border p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Shift {s}</div>
              <div className="text-2xl font-bold">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="A" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            {SHIFTS.map((s) => (
              <TabsTrigger key={s} value={s} className="text-xs">Shift {s}</TabsTrigger>
            ))}
          </TabsList>
          {SHIFTS.map((s) => (
            <TabsContent key={s} value={s} className="mt-2">
              <div className="rounded-lg border max-h-64 overflow-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">S/N</TableHead>
                      <TableHead className="w-24">Rank</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.filter((r) => r.shift === s).map((r) => (
                      <TableRow key={`${s}-${r.serial_no}-${r.name}`}>
                        <TableCell className="text-xs font-mono">{r.serial_no}</TableCell>
                        <TableCell className="text-xs">{r.rank}</TableCell>
                        <TableCell className="text-xs font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>Back</Button>
          <Button onClick={onConfirm} disabled={committing}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {committing ? "Saving…" : "Confirm & commit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Override Dialog ─────────────────────────
function OverrideAssignmentsDialog({
  importId, onOpenChange,
}: { importId: string | null; onOpenChange: (v: boolean) => void }) {
  const open = !!importId;
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sb: any = supabase;
  const matches = useQuery({
    queryKey: ["import-deployed-staff", importId],
    enabled: open,
    queryFn: async () => {
      const { data: imp } = await sb.from("duty_roster_imports")
        .select("effective_date").eq("id", importId).maybeSingle();
      const { data, error } = await sb
        .from("pending_staff_matches")
        .select("matched_profile_id, shift, name_text, rank_text")
        .eq("import_id", importId)
        .not("matched_profile_id", "is", null)
        .in("shift", ["A", "B", "C", "D"]);
      if (error) throw error;
      const profileIds = Array.from(new Set((data ?? []).map((d: any) => d.matched_profile_id)));
      const { data: assignments } = profileIds.length
        ? await sb.from("shift_assignments")
            .select("profile_id, shift_id, start_date, end_date, shifts(name)")
            .in("profile_id", profileIds)
        : { data: [] };
      const eff = imp?.effective_date as string | undefined;
      const currentByProfile = new Map<string, string>();
      (assignments ?? []).forEach((a: any) => {
        if (eff && a.start_date <= eff && (!a.end_date || a.end_date >= eff)) {
          const code = (a.shifts?.name ?? "").replace(/^SHIFT\s+/i, "").trim().toUpperCase();
          currentByProfile.set(a.profile_id, code);
        }
      });
      return (data ?? []).map((d: any) => ({
        profile_id: d.matched_profile_id,
        deployed_shift: d.shift,
        current_shift: currentByProfile.get(d.matched_profile_id) ?? "—",
        name: d.name_text,
        rank: d.rank_text,
      }));
    },
  });

  const apply = async (profileId: string, newShift: string) => {
    setSavingId(profileId);
    try {
      const { data: imp } = await sb.from("duty_roster_imports")
        .select("effective_date").eq("id", importId).maybeSingle();
      const { error } = await sb.rpc("override_shift_assignment", {
        _profile_id: profileId,
        _new_shift_code: newShift,
        _effective_date: imp?.effective_date ?? new Date().toISOString().slice(0, 10),
        _reason: reason || null,
      });
      if (error) throw error;
      toast.success(`Updated assignment to ${newShift === "REMOVE" ? "removed" : "Shift " + newShift}`);
      qc.invalidateQueries({ queryKey: ["import-deployed-staff", importId] });
      qc.invalidateQueries({ queryKey: ["import-audit", importId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Override failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Override deployed assignments
          </DialogTitle>
          <DialogDescription>
            Reassign individual staff to a different shift (A/B/C/D) or remove them.
            Every change is recorded to the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="ovreason" className="text-xs">Reason (recorded with each change)</Label>
          <Input id="ovreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Reassigned to cover leave" />
        </div>

        <div className="rounded-lg border max-h-[420px] overflow-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="w-24">Deployed</TableHead>
                <TableHead className="w-24">Current</TableHead>
                <TableHead className="w-40">Reassign to…</TableHead>
                <TableHead className="w-24 text-right">Apply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : (matches.data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No deployed staff in this import</TableCell></TableRow>
              ) : (
                (matches.data ?? []).map((r: any) => (
                  <TableRow key={r.profile_id}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-muted-foreground">{r.rank}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.deployed_shift}</Badge></TableCell>
                    <TableCell><Badge variant={r.current_shift === r.deployed_shift ? "default" : "secondary"} className="text-xs">{r.current_shift}</Badge></TableCell>
                    <TableCell>
                      <Select value={drafts[r.profile_id] ?? ""} onValueChange={(v) => setDrafts((d) => ({ ...d, [r.profile_id]: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">Shift A</SelectItem>
                          <SelectItem value="B">Shift B</SelectItem>
                          <SelectItem value="C">Shift C</SelectItem>
                          <SelectItem value="D">Shift D</SelectItem>
                          <SelectItem value="REMOVE">Remove from shift</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="outline" className="h-7 px-2 text-xs"
                        disabled={savingId === r.profile_id || !drafts[r.profile_id]}
                        onClick={() => apply(r.profile_id, drafts[r.profile_id]!)}
                      >
                        {savingId === r.profile_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Audit Dialog ─────────────────────────
function DeploymentAuditDialog({
  importId, onOpenChange,
}: { importId: string | null; onOpenChange: (v: boolean) => void }) {
  const open = !!importId;
  const sb: any = supabase;
  const audit = useQuery({
    queryKey: ["import-audit", importId],
    enabled: open,
    queryFn: async () => {
      // Fetch deployment audits for this import…
      const { data: deploy } = await sb
        .from("shift_assignment_overrides")
        .select("id, profile_id, action, effective_date, reason, source, created_at, performed_by, previous_shift_id, new_shift_id")
        .eq("import_id", importId)
        .order("created_at", { ascending: false });
      // …plus recent admin overrides for the same staff
      const profileIds = Array.from(new Set((deploy ?? []).map((d: any) => d.profile_id)));
      const { data: overrides } = profileIds.length
        ? await sb.from("shift_assignment_overrides")
            .select("id, profile_id, action, effective_date, reason, source, created_at, performed_by, previous_shift_id, new_shift_id")
            .in("profile_id", profileIds)
            .eq("source", "admin_override")
            .order("created_at", { ascending: false })
            .limit(200)
        : { data: [] };
      const all = [...(deploy ?? []), ...(overrides ?? [])];
      const seen = new Set<string>();
      const unique = all.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      const allProfileIds = Array.from(new Set(unique.map((r: any) => r.profile_id)));
      const performerIds = Array.from(new Set(unique.map((r: any) => r.performed_by).filter(Boolean)));
      const shiftIds = Array.from(new Set(unique.flatMap((r: any) => [r.previous_shift_id, r.new_shift_id]).filter(Boolean)));
      const [{ data: profs }, { data: performers }, { data: shifts }] = await Promise.all([
        allProfileIds.length ? sb.from("profiles").select("id, first_name, last_name").in("id", allProfileIds) : Promise.resolve({ data: [] }),
        performerIds.length ? sb.from("profiles").select("id, first_name, last_name").in("id", performerIds) : Promise.resolve({ data: [] }),
        shiftIds.length ? sb.from("shifts").select("id, name").in("id", shiftIds) : Promise.resolve({ data: [] }),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
      const permap = new Map((performers ?? []).map((p: any) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
      const smap = new Map((shifts ?? []).map((s: any) => [s.id, (s.name as string).replace(/^SHIFT\s+/i, "")]));
      return unique
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
        .map((r: any) => ({
          ...r,
          staff: pmap.get(r.profile_id) ?? "—",
          performer: r.performed_by ? (permap.get(r.performed_by) ?? "—") : "system",
          prev: r.previous_shift_id ? smap.get(r.previous_shift_id) ?? "?" : "—",
          next: r.new_shift_id ? smap.get(r.new_shift_id) ?? "?" : "—",
        }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Assignment audit trail
          </DialogTitle>
          <DialogDescription>
            All deployments and admin overrides linked to this import or the affected staff.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border max-h-[460px] overflow-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">When</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead className="w-28">Action</TableHead>
                <TableHead className="w-28">From → To</TableHead>
                <TableHead className="w-32">Effective</TableHead>
                <TableHead>By / Source</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : (audit.data ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No audit entries yet</TableCell></TableRow>
              ) : (
                (audit.data ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-medium">{r.staff}</TableCell>
                    <TableCell>
                      <Badge variant={r.action === "remove" ? "destructive" : r.action === "assign" ? "default" : "secondary"} className="text-xs">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.prev} → {r.next}</TableCell>
                    <TableCell className="text-xs">{r.effective_date}</TableCell>
                    <TableCell className="text-xs">
                      <div>{r.performer}</div>
                      <div className="text-[10px] text-muted-foreground">{r.source}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reason ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
