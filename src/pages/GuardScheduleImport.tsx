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
import { Upload, FileText, Eye, CheckCircle2, XCircle, AlertTriangle, Download, ShieldCheck, FileJson, FileDown } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
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

// ----- Roster mapping template -----
// Users can upload a JSON file describing how raw PDF text maps to canonical fields.
// All sections are optional; missing sections fall back to defaults.
const MappingTemplateSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  name: z.string().max(120).optional(),
  // Free-text rank → canonical rank string
  rankAliases: z.record(z.string().max(40), z.string().max(40)).optional(),
  // Allowed canonical ranks. Anything outside is flagged as "unknown rank".
  // Empty/omitted = no rank whitelist (warnings only on empty rank).
  allowedRanks: z.array(z.string().max(40)).max(200).optional(),
  // Allowed group labels. Anything outside is flagged.
  allowedGroups: z.array(z.string().max(60)).max(200).optional(),
  // Group label → canonical group string
  groupAliases: z.record(z.string().max(60), z.string().max(60)).optional(),
  // Regex string for valid serial numbers (matched as text). Default: 1-3 digits.
  serialFormat: z.string().max(80).optional(),
  // Min and max acceptable serial number values.
  serialMin: z.number().int().min(0).max(99999).optional(),
  serialMax: z.number().int().min(0).max(99999).optional(),
  // Required fields per personnel row
  requireRank: z.boolean().optional(),
  requireSerial: z.boolean().optional(),
  requireName: z.boolean().optional(),
});
export type MappingTemplate = z.infer<typeof MappingTemplateSchema>;

const DEFAULT_TEMPLATE: MappingTemplate = {
  version: 1,
  name: "Default GIS roster mapping",
  rankAliases: {
    "DCO": "DCO", "ACI": "ACI", "CI": "CI", "AI": "AI", "AII": "AII", "AIII": "AIII",
    "SGT": "SGT", "CPL": "CPL", "L/CPL": "L/CPL", "LCPL": "L/CPL",
    "INSP": "INSP", "CINSP": "CINSP", "ASP": "ASP",
  },
  allowedRanks: [],
  allowedGroups: [],
  groupAliases: {},
  serialFormat: "^\\d{1,3}$",
  serialMin: 1,
  serialMax: 999,
  requireRank: true,
  requireSerial: true,
  requireName: true,
};

function canonicalize(value: string, aliases?: Record<string, string>) {
  if (!value) return value;
  const up = value.toUpperCase().trim();
  if (aliases && aliases[up]) return aliases[up];
  // Try case-insensitive lookup
  if (aliases) {
    const hit = Object.keys(aliases).find((k) => k.toUpperCase() === up);
    if (hit) return aliases[hit];
  }
  return up;
}

export type RowIssue = {
  level: "error" | "warning";
  field: "rank" | "serial" | "name" | "group" | "date" | "period";
  message: string;
  row: RawRow;
  index: number;
};

export type ValidationResult = {
  errors: RowIssue[];
  warnings: RowIssue[];
  unknownGroups: string[];
  unknownRanks: string[];
  serialOutOfRange: number;
};

function validateRows(rows: RawRow[], tpl: MappingTemplate): ValidationResult {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const unknownGroups = new Set<string>();
  const unknownRanks = new Set<string>();
  let serialOutOfRange = 0;

  let serialRe: RegExp | null = null;
  try {
    if (tpl.serialFormat) serialRe = new RegExp(tpl.serialFormat);
  } catch {
    // Invalid regex — surface once via a synthetic warning below
  }

  const allowedRanks = (tpl.allowedRanks ?? []).map((r) => r.toUpperCase());
  const allowedGroups = (tpl.allowedGroups ?? []).map((g) => g.toUpperCase());

  rows.forEach((r, i) => {
    // Name
    if (tpl.requireName !== false) {
      if (!r.name || r.name.trim().length < 2) {
        errors.push({ level: "error", field: "name", message: "Missing or too-short name", row: r, index: i });
      } else if (/[0-9]/.test(r.name)) {
        warnings.push({ level: "warning", field: "name", message: `Name contains digits: "${r.name}"`, row: r, index: i });
      }
    }

    // Rank
    const rankCanon = canonicalize(r.rank, tpl.rankAliases);
    if (tpl.requireRank !== false && !rankCanon) {
      errors.push({ level: "error", field: "rank", message: "Missing rank", row: r, index: i });
    } else if (rankCanon && allowedRanks.length && !allowedRanks.includes(rankCanon.toUpperCase())) {
      unknownRanks.add(rankCanon);
      warnings.push({
        level: "warning",
        field: "rank",
        message: `Unknown rank "${r.rank}" (canonical: ${rankCanon})`,
        row: r,
        index: i,
      });
    }

    // Serial
    const snStr = String(r.serial_no ?? "");
    if (tpl.requireSerial !== false && !r.serial_no) {
      errors.push({ level: "error", field: "serial", message: "Missing serial number", row: r, index: i });
    } else if (r.serial_no) {
      if (serialRe && !serialRe.test(snStr)) {
        errors.push({
          level: "error",
          field: "serial",
          message: `Serial "${snStr}" does not match format ${tpl.serialFormat}`,
          row: r,
          index: i,
        });
      }
      const min = tpl.serialMin ?? 0;
      const max = tpl.serialMax ?? 99999;
      if (r.serial_no < min || r.serial_no > max) {
        serialOutOfRange++;
        warnings.push({
          level: "warning",
          field: "serial",
          message: `Serial ${r.serial_no} out of range [${min}, ${max}]`,
          row: r,
          index: i,
        });
      }
    }

    // Group
    const groupCanon = canonicalize(r.group, tpl.groupAliases);
    if (allowedGroups.length && groupCanon && !allowedGroups.includes(groupCanon.toUpperCase())) {
      unknownGroups.add(groupCanon);
      warnings.push({
        level: "warning",
        field: "group",
        message: `Unknown group "${r.group}" (canonical: ${groupCanon})`,
        row: r,
        index: i,
      });
    }

    // Date / period sanity (period & date should already be set by parser)
    if (!r.date) errors.push({ level: "error", field: "date", message: "Missing date", row: r, index: i });
    if (!r.period) errors.push({ level: "error", field: "period", message: "Missing DAY/NIGHT period", row: r, index: i });
  });

  return {
    errors,
    warnings,
    unknownGroups: Array.from(unknownGroups).sort(),
    unknownRanks: Array.from(unknownRanks).sort(),
    serialOutOfRange,
  };
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
  const [template, setTemplate] = useState<MappingTemplate>(DEFAULT_TEMPLATE);
  const [templateFile, setTemplateFile] = useState<string>("Built-in default");
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const templateFileRef = useRef<HTMLInputElement>(null);

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

  // Validation against the active mapping template
  const validation = useMemo(
    () => (parsed ? validateRows(parsed.rows, template) : null),
    [parsed, template]
  );
  const blockedByErrors = (validation?.errors.length ?? 0) > 0;

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setFile(null); setParsed(null); setName(""); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTemplateFile = async (f: File) => {
    try {
      if (!/\.json$/i.test(f.name)) {
        toast.error("Mapping template must be a .json file");
        return;
      }
      if (f.size > 256 * 1024) {
        toast.error("Mapping template too large (max 256 KB)");
        return;
      }
      const text = await f.text();
      const raw = JSON.parse(text);
      const parsedTpl = MappingTemplateSchema.safeParse(raw);
      if (!parsedTpl.success) {
        const issues = parsedTpl.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        toast.error(`Invalid template — ${issues.join("; ")}`);
        return;
      }
      // Validate the regex up front so we fail fast
      if (parsedTpl.data.serialFormat) {
        try { new RegExp(parsedTpl.data.serialFormat); }
        catch { toast.error("serialFormat is not a valid regular expression"); return; }
      }
      setTemplate({ ...DEFAULT_TEMPLATE, ...parsedTpl.data });
      setTemplateFile(f.name);
      toast.success(`Mapping template loaded: ${parsedTpl.data.name ?? f.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to read template");
    } finally {
      if (templateFileRef.current) templateFileRef.current.value = "";
    }
  };

  const resetTemplate = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setTemplateFile("Built-in default");
    toast.success("Reverted to default mapping template");
  };

  const downloadTemplateSample = () => {
    const sample: MappingTemplate = {
      ...DEFAULT_TEMPLATE,
      name: "Sample roster mapping",
      allowedRanks: ["DCO", "ACI", "CI", "AI", "AII", "AIII", "INSP", "ASP", "SGT", "CPL", "L/CPL"],
      allowedGroups: ["GROUP A", "GROUP B", "GROUP C", "GROUP D"],
      groupAliases: { "GRP A": "GROUP A", "GRP B": "GROUP B" },
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "roster-mapping-template.sample.json"; a.click();
    URL.revokeObjectURL(url);
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

  const guardValidation = (action: string): boolean => {
    if (blockedByErrors) {
      toast.error(`${action} blocked: ${validation!.errors.length} validation error(s) — fix or adjust mapping template`);
      return false;
    }
    return true;
  };

  const handleExportXlsx = () => {
    if (!assignments.length) return;
    if (!guardValidation("Export")) return;
    exportScheduleXlsx(headerForExport, assignments);
  };
  const handleExportCsv = () => {
    if (!assignments.length) return;
    if (!guardValidation("Export")) return;
    exportScheduleCsv(headerForExport, assignments);
  };

  const handleCommit = async () => {
    if (!parsed || !assignments.length || !file) return;
    if (!guardValidation("Commit")) return;
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
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-primary" /> 2. Roster mapping template
          </CardTitle>
          <CardDescription>
            Upload a JSON template that defines rank aliases, allowed groups, and serial-number format. This keeps imports
            consistent across PDFs. The template is applied immediately and used for validation below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => templateFileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Upload template (.json)
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplateSample}>
              <FileDown className="h-4 w-4 mr-1" /> Download sample
            </Button>
            <Button variant="ghost" size="sm" onClick={resetTemplate}>
              <XCircle className="h-4 w-4 mr-1" /> Reset to default
            </Button>
            <input
              ref={templateFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTemplateFile(f); }}
            />
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
            <div><strong>Active template:</strong> {template.name ?? "(unnamed)"} <span className="text-muted-foreground">— source: {templateFile}</span></div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Rank aliases: {Object.keys(template.rankAliases ?? {}).length}</Badge>
              <Badge variant="outline">Allowed ranks: {(template.allowedRanks ?? []).length || "any"}</Badge>
              <Badge variant="outline">Allowed groups: {(template.allowedGroups ?? []).length || "any"}</Badge>
              <Badge variant="outline">Group aliases: {Object.keys(template.groupAliases ?? {}).length}</Badge>
              <Badge variant="outline">Serial format: <code className="ml-1">{template.serialFormat ?? "—"}</code></Badge>
              <Badge variant="outline">Serial range: {template.serialMin ?? 0}–{template.serialMax ?? "∞"}</Badge>
            </div>
            <div className="text-muted-foreground">
              Required fields: {[
                template.requireRank !== false && "rank",
                template.requireSerial !== false && "serial",
                template.requireName !== false && "name",
              ].filter(Boolean).join(", ") || "none"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Period mapping</CardTitle>
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
            <CardTitle>4. Duplicate handling</CardTitle>
            <CardDescription>
              Choose whether duplicate names should be collapsed for export and database commit. The full raw list is always
              preserved below for monitoring.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {([
                ["off", "Keep all (monitoring)", `${assignmentsRaw.length} rows`],
                ["exact", "Collapse exact duplicates", "same date+shift+S/N+name"],
                ["by-name", "Collapse by name", "same date+shift+name (any S/N)"],
              ] as const).map(([mode, label, hint]) => {
                const active = dedupeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDedupeMode(mode)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{hint}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Raw: <strong className="ml-1">{assignmentsRaw.length}</strong></Badge>
              <Badge variant="outline">Kept: <strong className="ml-1">{assignments.length}</strong></Badge>
              <Badge variant={dedupe.removed > 0 ? "default" : "outline"}>
                Collapsed: <strong className="ml-1">{dedupe.removed}</strong>
              </Badge>
              <Badge variant={dedupe.duplicates.length > 0 ? "destructive" : "outline"} className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Duplicate groups: {dedupe.duplicates.length}
              </Badge>
            </div>
            {dedupe.duplicates.length > 0 && (
              <details className="text-xs rounded-md border bg-amber-50 p-2 max-h-48 overflow-auto">
                <summary className="cursor-pointer font-medium text-amber-800">
                  View duplicate groups (monitoring) — first 50
                </summary>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {dedupe.duplicates.slice(0, 50).map((d) => (
                    <li key={d.key}>
                      <span className="font-mono">{d.sample.duty_date} · Shift {d.sample.shift}</span> ·{" "}
                      <strong>{d.sample.name_text}</strong> ({d.sample.rank_text}) — {d.count}× ·
                      S/N: {d.serials.join(", ")}
                    </li>
                  ))}
                  {dedupe.duplicates.length > 50 && <li>…and {dedupe.duplicates.length - 50} more</li>}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {parsed && validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${blockedByErrors ? "text-destructive" : "text-emerald-600"}`} />
              5. Validation
            </CardTitle>
            <CardDescription>
              {blockedByErrors
                ? `${validation.errors.length} error(s) must be resolved before exporting or saving. ${validation.warnings.length} warning(s).`
                : validation.warnings.length > 0
                ? `No errors — ${validation.warnings.length} warning(s) you may want to review.`
                : "All rows passed validation against the active mapping template."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={blockedByErrors ? "destructive" : "outline"}>
                Errors: <strong className="ml-1">{validation.errors.length}</strong>
              </Badge>
              <Badge variant={validation.warnings.length > 0 ? "secondary" : "outline"}>
                Warnings: <strong className="ml-1">{validation.warnings.length}</strong>
              </Badge>
              <Badge variant="outline">Unknown ranks: <strong className="ml-1">{validation.unknownRanks.length}</strong></Badge>
              <Badge variant="outline">Unknown groups: <strong className="ml-1">{validation.unknownGroups.length}</strong></Badge>
              <Badge variant="outline">Serial out-of-range: <strong className="ml-1">{validation.serialOutOfRange}</strong></Badge>
            </div>

            {(validation.unknownGroups.length > 0 || validation.unknownRanks.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {validation.unknownGroups.length > 0 && (
                  <div className="rounded-md border bg-amber-50 p-2">
                    <div className="font-medium text-amber-800 mb-1">Unknown groups</div>
                    <div className="font-mono text-[11px] break-words">{validation.unknownGroups.join(", ")}</div>
                  </div>
                )}
                {validation.unknownRanks.length > 0 && (
                  <div className="rounded-md border bg-amber-50 p-2">
                    <div className="font-medium text-amber-800 mb-1">Unknown ranks</div>
                    <div className="font-mono text-[11px] break-words">{validation.unknownRanks.join(", ")}</div>
                  </div>
                )}
              </div>
            )}

            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <details className="text-xs rounded-md border p-2 max-h-64 overflow-auto" open={blockedByErrors}>
                <summary className="cursor-pointer font-medium">
                  View row-level issues (first 100)
                </summary>
                <Table className="min-w-[700px] mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Level</TableHead>
                      <TableHead className="w-20">Field</TableHead>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-20">Group</TableHead>
                      <TableHead>Row</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...validation.errors, ...validation.warnings].slice(0, 100).map((iss, i) => (
                      <TableRow key={`${iss.level}-${iss.index}-${i}`}>
                        <TableCell>
                          <Badge variant={iss.level === "error" ? "destructive" : "secondary"} className="text-[10px]">
                            {iss.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono">{iss.field}</TableCell>
                        <TableCell className="text-[11px] font-mono">{iss.row.date || "—"}</TableCell>
                        <TableCell className="text-[11px]">{iss.row.group || "—"}</TableCell>
                        <TableCell className="text-[11px]">
                          {iss.row.serial_no ? `${iss.row.serial_no}.` : ""} {iss.row.rank} {iss.row.name}
                        </TableCell>
                        <TableCell className="text-[11px]">{iss.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" /> 6. Preview
            </CardTitle>
            <CardDescription>
              {assignments.length === 0
                ? "No assignments — check the period mapping above."
                : `Date range ${parsed.startDate ?? "?"} → ${parsed.endDate ?? "?"} · ${parsed.rows.length} source rows · ${assignmentsRaw.length} after mapping · ${assignments.length} after dedupe (${dedupeMode}).`}
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
              {dedupe.removed > 0 && (
                <Badge variant="secondary" className="text-xs">−{dedupe.removed} collapsed</Badge>
              )}
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
