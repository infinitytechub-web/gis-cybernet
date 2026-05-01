// src/pages/GuardScheduleImport.tsx
import { useMemo, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Eye, CheckCircle2, XCircle, AlertTriangle, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  exportScheduleXlsx,
  exportScheduleCsv,
  type Assignment,
  type ScheduleHeader,
} from "@/lib/guard-schedule-export";

type Period = "DAY" | "NIGHT";
type Shift = "A" | "B" | "C" | "D";

type RawRow = {
  group: string;
  date: string; // ISO yyyy-mm-dd
  period: Period;
  serial_no: number;
  rank: string;
  name: string;
};

type ParseResult = {
  rows: RawRow[];
  warnings: string[];
  startDate?: string;
  endDate?: string;
};

const SHIFTS: Shift[] = ["A", "B", "C", "D"];

// ----- PDF text extraction -----
async function extractPdfText(file: File): Promise<string[]> {
  // Lazy import; configure worker via CDN to avoid Vite worker setup.
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // Reconstruct rows by Y coordinate.
    const items = (tc.items as any[])
      .map((it) => ({
        str: String(it.str ?? ""),
        x: it.transform?.[4] ?? 0,
        y: it.transform?.[5] ?? 0,
      }))
      .filter((it) => it.str.trim() !== "");
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) < 3) {
        last.parts.push({ x: it.x, str: it.str });
      } else {
        lines.push({ y: it.y, parts: [{ x: it.x, str: it.str }] });
      }
    }
    pages.push(
      lines
        .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" "))
        .join("\n")
    );
  }
  return pages;
}

// ----- Parser tuned to the May 2026 layout but tolerant of variants -----
const MONTHS: Record<string, number> = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2, APR: 3, APRIL: 3,
  MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6, AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9, OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
};

function pad(n: number) { return n.toString().padStart(2, "0"); }
function isoDate(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

function parseDateToken(tok: string, fallbackYear: number): string | null {
  const m = tok.match(/(\d{1,2})\s*(?:ST|ND|RD|TH)?\s*([A-Z]{3,9})\s*(\d{2,4})?/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthName = m[2].toUpperCase();
  if (!(monthName in MONTHS)) return null;
  const month = MONTHS[monthName];
  let year = m[3] ? parseInt(m[3], 10) : fallbackYear;
  if (year < 100) year += 2000;
  if (day < 1 || day > 31) return null;
  return isoDate(year, month, day);
}

function parsePages(pages: string[], fallbackYear: number): ParseResult {
  const warnings: string[] = [];
  const rows: RawRow[] = [];
  const allDates = new Set<string>();

  let groupCounter = 0;
  for (const text of pages) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let currentGroup = "";
    let currentDate = "";
    let currentPeriod: Period | "" = "";

    for (const line of lines) {
      const upper = line.toUpperCase();

      // Group header — look for "GROUP X" or "TEAM X"
      const grp = upper.match(/\b(?:GROUP|TEAM|SECTION)\s+([A-Z0-9]+)/);
      if (grp) {
        currentGroup = `${grp[0]}`;
        groupCounter++;
      }

      // Date line — try to find an embedded date anywhere
      const dt = parseDateToken(upper, fallbackYear);
      if (dt) {
        currentDate = dt;
        allDates.add(dt);
      }

      // Period
      if (/\bNIGHT\b/.test(upper)) currentPeriod = "NIGHT";
      else if (/\bDAY\b/.test(upper)) currentPeriod = "DAY";

      // Personnel row — pattern: "1. RANK NAME" or "1 RANK NAME"
      const personMatch = line.match(/^(\d{1,3})\.?\s+([A-Z][A-Z\/\.]{0,8})\s+([A-Z][A-Z\s\.\-']{2,})$/);
      if (personMatch) {
        const sn = parseInt(personMatch[1], 10);
        const rank = personMatch[2].trim();
        const name = personMatch[3].trim().replace(/\s+/g, " ");
        if (!currentDate) { warnings.push(`No date context for "${line}"`); continue; }
        if (!currentPeriod) { warnings.push(`No period (DAY/NIGHT) context for "${line}"`); continue; }
        rows.push({
          group: currentGroup || `GROUP ${groupCounter || 1}`,
          date: currentDate,
          period: currentPeriod,
          serial_no: sn,
          rank,
          name,
        });
      }
    }
  }

  const sortedDates = Array.from(allDates).sort();
  return {
    rows,
    warnings,
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
  };
}

// ----- Period → shift mapping -----
type Mapping = { day: Shift[]; night: Shift[] };
const DEFAULT_MAPPING: Mapping = { day: ["A", "B"], night: ["C"] };

function applyMapping(rows: RawRow[], mapping: Mapping): Assignment[] {
  const out: Assignment[] = [];
  for (const r of rows) {
    const shifts = r.period === "DAY" ? mapping.day : mapping.night;
    for (const s of shifts) {
      out.push({
        id: `${r.date}|${s}|${r.serial_no}|${r.name}`,
        duty_date: r.date,
        shift: s,
        rank_text: r.rank,
        name_text: r.name,
        serial_no: r.serial_no,
        unit: null,
        position_label: r.period,
      });
    }
  }
  return out;
}

// ----- Dedupe -----
// "off"        → keep every row (monitoring view shows raw 1:1)
// "exact"      → collapse only true exact duplicates (same date+shift+sn+name)
// "by-name"    → collapse to one row per (date, shift, name) ignoring S/N variations
export type DedupeMode = "off" | "exact" | "by-name";

function normName(s: string) {
  return s.toUpperCase().replace(/\s+/g, " ").trim();
}

export type DedupeResult = {
  kept: Assignment[];
  duplicates: { key: string; sample: Assignment; count: number; serials: number[] }[];
  removed: number;
};

function dedupeAssignments(rows: Assignment[], mode: DedupeMode): DedupeResult {
  if (mode === "off") return { kept: rows, duplicates: [], removed: 0 };
  const groups = new Map<string, Assignment[]>();
  for (const r of rows) {
    const key =
      mode === "exact"
        ? `${r.duty_date}|${r.shift}|${r.serial_no ?? ""}|${normName(r.name_text)}`
        : `${r.duty_date}|${r.shift}|${normName(r.name_text)}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const kept: Assignment[] = [];
  const duplicates: DedupeResult["duplicates"] = [];
  let removed = 0;
  for (const [key, arr] of groups) {
    kept.push(arr[0]);
    if (arr.length > 1) {
      removed += arr.length - 1;
      duplicates.push({
        key,
        sample: arr[0],
        count: arr.length,
        serials: Array.from(new Set(arr.map((a) => a.serial_no ?? 0))).sort((a, b) => a - b),
      });
    }
  }
  duplicates.sort((a, b) => b.count - a.count);
  return { kept, duplicates, removed };
}

// ----- Page -----
export default function GuardScheduleImport() {
  const { user, isAdminOrSupervisor, loading } = useAuthContext();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [fallbackYear, setFallbackYear] = useState<number>(new Date().getFullYear());
  const [dayShifts, setDayShifts] = useState<Shift[]>(DEFAULT_MAPPING.day);
  const [nightShifts, setNightShifts] = useState<Shift[]>(DEFAULT_MAPPING.night);
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>("off");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const recent = useQuery({
    queryKey: ["guard-schedules-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_schedules")
        .select("id, name, start_date, end_date, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isAdminOrSupervisor,
  });

  // Raw assignments after period mapping (kept intact for monitoring)
  const assignmentsRaw = useMemo(
    () => (parsed ? applyMapping(parsed.rows, { day: dayShifts, night: nightShifts }) : []),
    [parsed, dayShifts, nightShifts]
  );

  // Deduped result — used for export + commit
  const dedupe = useMemo(() => dedupeAssignments(assignmentsRaw, dedupeMode), [assignmentsRaw, dedupeMode]);
  const assignments = dedupe.kept;

  const counts = useMemo(() => {
    const acc: Record<Shift, number> = { A: 0, B: 0, C: 0, D: 0 };
    assignments.forEach((a) => { acc[a.shift] += 1; });
    return acc;
  }, [assignments]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setFile(null); setParsed(null); setName(""); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f); setParsed(null); setParsing(true);
    try {
      if (!/\.pdf$/i.test(f.name)) {
        toast.error("Please upload a PDF file");
        return;
      }
      const pages = await extractPdfText(f);
      const result = parsePages(pages, fallbackYear);
      setParsed(result);
      if (!name) setName(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
      if (result.rows.length === 0) toast.error("No personnel rows could be parsed");
      else toast.success(`Parsed ${result.rows.length} entries from ${pages.length} page(s)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to read PDF");
    } finally {
      setParsing(false);
    }
  };

  const headerForExport: ScheduleHeader = {
    name: name || file?.name || "Guard Schedule",
    start_date: parsed?.startDate ?? "",
    end_date: parsed?.endDate ?? "",
    status: "draft",
  };

  const handleExportXlsx = () => {
    if (!assignments.length) return;
    exportScheduleXlsx(headerForExport, assignments);
  };
  const handleExportCsv = () => {
    if (!assignments.length) return;
    exportScheduleCsv(headerForExport, assignments);
  };

  const handleCommit = async () => {
    if (!parsed || !assignments.length || !file) return;
    if (!parsed.startDate || !parsed.endDate) {
      toast.error("Could not determine date range from PDF");
      return;
    }
    setCommitting(true);
    try {
      const { data: sched, error: e1 } = await supabase
        .from("guard_schedules")
        .insert({
          name: name || file.name,
          start_date: parsed.startDate,
          end_date: parsed.endDate,
          status: "draft",
          notes: notes || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (e1 || !sched) throw e1 ?? new Error("Failed to create schedule");

      const payload = assignments.map((a) => ({
        schedule_id: sched.id,
        duty_date: a.duty_date,
        shift: a.shift,
        rank_text: a.rank_text,
        name_text: a.name_text,
        serial_no: a.serial_no,
        position_label: a.position_label,
      }));
      for (let i = 0; i < payload.length; i += 200) {
        const slice = payload.slice(i, i + 200);
        const { error: e2 } = await supabase.from("guard_schedule_assignments").insert(slice);
        if (e2) throw e2;
      }
      toast.success(`Saved schedule with ${payload.length} assignments`);
      qc.invalidateQueries({ queryKey: ["guard-schedules-recent"] });
      qc.invalidateQueries({ queryKey: ["guard-schedules"] });
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? "Commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const toggleShift = (set: Shift[], setSet: (v: Shift[]) => void, s: Shift) => {
    setSet(set.includes(s) ? set.filter((x) => x !== s) : [...set, s].sort());
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Guard Schedule — PDF Import
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a guard duty PDF, choose how DAY/NIGHT periods map to shifts (A–D), preview, then export or save into the system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload PDF</CardTitle>
          <CardDescription>
            Each page should list a group with date, DAY/NIGHT period, and numbered personnel rows like <code>1. SGT JOHN DOE</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label
            className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {parsing ? "Parsing PDF…" : file ? <strong>{file.name}</strong> : "Click to choose or drop a PDF here"}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="nm" className="text-xs">Schedule name</Label>
              <Input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Guard Duty Roster — May 2026" />
            </div>
            <div>
              <Label htmlFor="yr" className="text-xs">Fallback year</Label>
              <Input id="yr" type="number" value={fallbackYear} onChange={(e) => setFallbackYear(parseInt(e.target.value || "0", 10) || new Date().getFullYear())} />
            </div>
            <div>
              <Label htmlFor="nt" className="text-xs">Notes (optional)</Label>
              <Textarea id="nt" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context…" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Period mapping</CardTitle>
          <CardDescription>
            Pick which shift letters each period generates. By default <strong>DAY → A & B</strong> and <strong>NIGHT → C</strong>.
            Selecting more than one shift duplicates personnel into each chosen shift.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([["DAY", dayShifts, setDayShifts], ["NIGHT", nightShifts, setNightShifts]] as const).map(([label, set, setSet]) => (
              <div key={label} className="rounded-lg border p-3 space-y-2">
                <div className="text-sm font-medium">{label} period maps to:</div>
                <div className="flex flex-wrap gap-2">
                  {SHIFTS.map((s) => {
                    const active = set.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleShift(set, setSet, s)}
                        className={`px-3 py-1 rounded-md border text-sm transition-colors ${
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                        }`}
                      >
                        Shift {s}
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Selected: {set.length ? set.map((s) => `Shift ${s}`).join(", ") : <span className="text-destructive">None — entries will be skipped</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" /> 3. Preview
            </CardTitle>
            <CardDescription>
              {assignments.length === 0
                ? "No assignments — check the period mapping above."
                : `Date range ${parsed.startDate ?? "?"} → ${parsed.endDate ?? "?"} · ${parsed.rows.length} source rows · ${assignments.length} assignments after mapping.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SHIFTS.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  Shift {s}: <strong className="ml-1">{counts[s]}</strong>
                </Badge>
              ))}
              <Badge className="text-xs">Total: {assignments.length}</Badge>
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

            {assignments.length > 0 && (
              <Tabs defaultValue="A" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-4">
                  {SHIFTS.map((s) => (
                    <TabsTrigger key={s} value={s} className="text-xs">Shift {s} ({counts[s]})</TabsTrigger>
                  ))}
                </TabsList>
                {SHIFTS.map((s) => (
                  <TabsContent key={s} value={s} className="mt-3">
                    <div className="rounded-lg border overflow-x-auto max-h-[420px] overflow-y-auto">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead className="w-16">S/N</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="w-20">Period</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assignments.filter((a) => a.shift === s).slice(0, 500).map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="text-xs font-mono">{a.duty_date}</TableCell>
                              <TableCell className="text-xs font-mono">{a.serial_no}</TableCell>
                              <TableCell className="text-xs">{a.rank_text}</TableCell>
                              <TableCell className="text-xs font-medium">{a.name_text}</TableCell>
                              <TableCell className="text-xs">{a.position_label}</TableCell>
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
              <Button variant="outline" onClick={handleExportXlsx} disabled={!assignments.length}>
                <Download className="h-4 w-4 mr-1" /> Export XLSX
              </Button>
              <Button variant="outline" onClick={handleExportCsv} disabled={!assignments.length}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
              <Button variant="outline" onClick={reset} disabled={committing}>
                <XCircle className="h-4 w-4 mr-1" /> Discard
              </Button>
              <Button onClick={handleCommit} disabled={committing || !assignments.length}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> {committing ? "Saving…" : `Save schedule (${assignments.length})`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent schedules</CardTitle>
          <CardDescription>
            Open the <Link to="/guard-schedule" className="underline text-primary">Guard Schedule</Link> dashboard to publish or manage them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (recent.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No schedules yet</TableCell></TableRow>
                ) : (
                  (recent.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs font-mono">{s.start_date} → {s.end_date}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "published" ? "default" : "outline"} className="text-xs">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
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
