import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAudit } from "@/lib/admin-audit";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Defaults to current month; the dialog shows month-of-period explicitly. */
  initialReferenceDate?: string; // yyyy-MM-dd
  /** Notify the parent so it can refetch the snapshot view. */
  onImported?: () => void;
}

interface ParsedRow {
  rowIndex: number; // 1-based row number in the spreadsheet (after header)
  raw: Record<string, string>;
  staff_id: string;
  name: string;
  department: string;
  office: string;
  shift: string;
  working_days: number;
  present: number;
  absent: number;
  late: number;
  leave_days: number;
  missing_logs: number;
  compliance_pct: number;
  log_completeness_pct: number;
}

interface MatchResult {
  matched: Array<ParsedRow & { profile_id: string; existed: boolean }>;
  unknown: ParsedRow[];
  invalid: { rowIndex: number; reason: string }[];
}

interface PeriodHint {
  /** Human-readable hint as found in the spreadsheet (e.g. "March 2026"). */
  raw: string;
  /** First day of the detected month in yyyy-MM-dd, when parseable. */
  startIso: string | null;
  /** Where the hint was discovered — surfaced in the mismatch warning. */
  source: "sheet_name" | "metadata_row" | "period_column";
}

const REQUIRED_HEADERS = [
  "Staff ID", "Name", "Department", "Office", "Shift",
  "Working Days", "Present", "Absent", "Late", "Leave",
  "Missing Logs", "Compliance %", "Log Completeness %",
];

function parsePct(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.toString().replace("%", "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseInt0(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.toString().trim());
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_BY_NAME: Record<string, number> = MONTHS.reduce((acc, m, i) => {
  acc[m.toLowerCase()] = i;
  acc[m.toLowerCase().slice(0, 3)] = i; // Jan, Feb, ...
  return acc;
}, {} as Record<string, number>);

/**
 * Try to extract a "Month YYYY" hint from any free-text string.
 * Recognises "March 2026", "Mar 2026", "2026-03", "03/2026", etc.
 * Returns the matched month (0-11) and year, or null.
 */
function detectMonthYear(text: string): { month: number; year: number } | null {
  if (!text) return null;
  const cleaned = String(text).trim();
  if (!cleaned) return null;

  // 1) "March 2026" / "Mar 2026"
  const mName = cleaned.match(/\b([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (mName) {
    const m = MONTH_BY_NAME[mName[1].toLowerCase()];
    const y = Number(mName[2]);
    if (m !== undefined && Number.isFinite(y)) return { month: m, year: y };
  }
  // 2) "2026-03" or "2026/03"
  const mIso = cleaned.match(/\b(\d{4})[-/](\d{1,2})\b/);
  if (mIso) {
    const y = Number(mIso[1]);
    const m = Number(mIso[2]) - 1;
    if (m >= 0 && m <= 11 && Number.isFinite(y)) return { month: m, year: y };
  }
  // 3) "03/2026" or "3-2026"
  const mUs = cleaned.match(/\b(\d{1,2})[-/](\d{4})\b/);
  if (mUs) {
    const m = Number(mUs[1]) - 1;
    const y = Number(mUs[2]);
    if (m >= 0 && m <= 11 && Number.isFinite(y)) return { month: m, year: y };
  }
  return null;
}

export function AttendanceComplianceImportDialog({ open, onOpenChange, initialReferenceDate, onImported }: Props) {
  const initialDate = initialReferenceDate ? parseISO(initialReferenceDate) : new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(initialDate.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(initialDate.getFullYear());
  const [parsing, setParsing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [periodHint, setPeriodHint] = useState<PeriodHint | null>(null);

  // Period is fully derived from the selected month + year — no free-form date entry, so
  // there is no way for the imported figures to land in the wrong column/period.
  const referenceDate = useMemo(
    () => format(new Date(selectedYear, selectedMonth, 15), "yyyy-MM-dd"),
    [selectedMonth, selectedYear],
  );
  const periodStartIso = useMemo(() => format(startOfMonth(parseISO(referenceDate)), "yyyy-MM-dd"), [referenceDate]);
  const periodEndIso = useMemo(() => format(endOfMonth(parseISO(referenceDate)), "yyyy-MM-dd"), [referenceDate]);
  const periodLabel = useMemo(() => format(parseISO(referenceDate), "MMMM yyyy"), [referenceDate]);

  // Year range: 5 years back through next year — covers re-imports of historical data without an unbounded list.
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now + 1; y >= now - 5; y--) out.push(y);
    return out;
  }, []);

  const reset = () => {
    setParsedRows([]);
    setMatch(null);
    setFilename(null);
    setPeriodHint(null);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setMatch(null);
    setParsedRows([]);
    setPeriodHint(null);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      // Prefer the "Compliance Data" sheet; otherwise first sheet.
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("compliance")) ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
      if (!aoa || aoa.length === 0) {
        toast.error("Sheet is empty");
        return;
      }
      // Find header row (must contain "Staff ID")
      const headerIdx = aoa.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim().toLowerCase() === "staff id"));
      if (headerIdx === -1) {
        toast.error("Could not find a 'Staff ID' header row. Use the downloadable template.");
        return;
      }
      const headers = (aoa[headerIdx] as string[]).map((h) => String(h).trim());

      // ---- Auto-detect period hint from sheet metadata so we can flag mismatches ----
      // Search order: (1) sheet name, (2) any cell above the header, (3) a "Period"/"Month" column's first value.
      let detected: PeriodHint | null = null;
      const sheetHit = detectMonthYear(sheetName);
      if (sheetHit) {
        detected = {
          raw: format(new Date(sheetHit.year, sheetHit.month, 1), "MMMM yyyy"),
          startIso: format(new Date(sheetHit.year, sheetHit.month, 1), "yyyy-MM-dd"),
          source: "sheet_name",
        };
      }
      if (!detected) {
        for (let i = 0; i < headerIdx; i++) {
          const row = aoa[i];
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            const hit = detectMonthYear(String(cell ?? ""));
            if (hit) {
              detected = {
                raw: format(new Date(hit.year, hit.month, 1), "MMMM yyyy"),
                startIso: format(new Date(hit.year, hit.month, 1), "yyyy-MM-dd"),
                source: "metadata_row",
              };
              break;
            }
          }
          if (detected) break;
        }
      }
      if (!detected) {
        const periodColIdx = headers.findIndex((h) => /^period$|^month$/i.test(h));
        if (periodColIdx >= 0) {
          for (let i = headerIdx + 1; i < Math.min(aoa.length, headerIdx + 10); i++) {
            const row = aoa[i];
            if (!Array.isArray(row)) continue;
            const hit = detectMonthYear(String(row[periodColIdx] ?? ""));
            if (hit) {
              detected = {
                raw: format(new Date(hit.year, hit.month, 1), "MMMM yyyy"),
                startIso: format(new Date(hit.year, hit.month, 1), "yyyy-MM-dd"),
                source: "period_column",
              };
              break;
            }
          }
        }
      }
      setPeriodHint(detected);

      const missing = REQUIRED_HEADERS.filter((h) => !headers.some((x) => x.toLowerCase() === h.toLowerCase()));
      if (missing.length > 0) {
        toast.error(`Missing column(s): ${missing.join(", ")}`);
        return;
      }
      const idx = (label: string) => headers.findIndex((h) => h.toLowerCase() === label.toLowerCase());
      const colMap = Object.fromEntries(REQUIRED_HEADERS.map((h) => [h, idx(h)])) as Record<string, number>;

      const rows: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!Array.isArray(r) || r.every((c) => !String(c ?? "").trim())) continue;
        const staffId = String(r[colMap["Staff ID"]] ?? "").trim();
        if (!staffId) continue; // silently skip blank rows
        rows.push({
          rowIndex: i + 1,
          raw: Object.fromEntries(headers.map((h, j) => [h, String(r[j] ?? "")])),
          staff_id: staffId,
          name: String(r[colMap["Name"]] ?? "").trim(),
          department: String(r[colMap["Department"]] ?? "").trim(),
          office: String(r[colMap["Office"]] ?? "").trim(),
          shift: String(r[colMap["Shift"]] ?? "").trim(),
          working_days: parseInt0(String(r[colMap["Working Days"]] ?? "")),
          present: parseInt0(String(r[colMap["Present"]] ?? "")),
          absent: parseInt0(String(r[colMap["Absent"]] ?? "")),
          late: parseInt0(String(r[colMap["Late"]] ?? "")),
          leave_days: parseInt0(String(r[colMap["Leave"]] ?? "")),
          missing_logs: parseInt0(String(r[colMap["Missing Logs"]] ?? "")),
          compliance_pct: parsePct(String(r[colMap["Compliance %"]] ?? "")),
          log_completeness_pct: parsePct(String(r[colMap["Log Completeness %"]] ?? "")),
        });
      }
      if (rows.length === 0) {
        toast.error("No data rows found in the sheet");
        return;
      }
      setParsedRows(rows);

      // Match against profiles
      setMatching(true);
      const ids = Array.from(new Set(rows.map((r) => r.staff_id)));
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, staff_id")
        .in("staff_id", ids);
      if (error) throw error;
      const byStaffId = new Map<string, string>();
      (profiles ?? []).forEach((p: any) => byStaffId.set(p.staff_id, p.id));

      // Existing snapshots for this period (so we can show "will update" vs "new")
      const profileIds = Array.from(byStaffId.values());
      let existingIds = new Set<string>();
      if (profileIds.length > 0) {
        const { data: existing } = await supabase
          .from("attendance_compliance_snapshots")
          .select("profile_id")
          .eq("period_type", "monthly")
          .eq("period_start", periodStartIso)
          .in("profile_id", profileIds);
        existingIds = new Set((existing ?? []).map((e: any) => e.profile_id));
      }

      const matched: MatchResult["matched"] = [];
      const unknown: ParsedRow[] = [];
      const invalid: MatchResult["invalid"] = [];
      for (const row of rows) {
        const profileId = byStaffId.get(row.staff_id);
        if (!profileId) {
          unknown.push(row);
          continue;
        }
        if (row.compliance_pct < 0 || row.compliance_pct > 100) {
          invalid.push({ rowIndex: row.rowIndex, reason: "Compliance % out of range (0–100)" });
          continue;
        }
        matched.push({ ...row, profile_id: profileId, existed: existingIds.has(profileId) });
      }
      setMatch({ matched, unknown, invalid });
      toast.success(`Parsed ${rows.length} row(s) — ${matched.length} ready to import`);
    } catch (e: any) {
      console.error("Import parse failure", e);
      toast.error(e?.message ?? "Could not read the file");
    } finally {
      setParsing(false);
      setMatching(false);
    }
  };

  const handleImport = async () => {
    if (!match || match.matched.length === 0) {
      toast.error("Nothing to import");
      return;
    }
    setImporting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;

      const payload = match.matched.map((r) => ({
        profile_id: r.profile_id,
        period_type: "monthly",
        period_start: periodStartIso,
        period_end: periodEndIso,
        staff_id_snapshot: r.staff_id,
        name_snapshot: r.name,
        department_snapshot: r.department,
        office_snapshot: r.office,
        shift_snapshot: r.shift,
        working_days: r.working_days,
        present: r.present,
        absent: r.absent,
        late: r.late,
        leave_days: r.leave_days,
        missing_logs: r.missing_logs,
        compliance_pct: r.compliance_pct,
        log_completeness_pct: r.log_completeness_pct,
        source: "import",
        imported_by: uid,
        imported_at: new Date().toISOString(),
        filters: { period_label: periodLabel, source_file: filename },
      }));

      const { error } = await supabase
        .from("attendance_compliance_snapshots")
        .upsert(payload, { onConflict: "profile_id,period_type,period_start" });
      if (error) throw error;

      const updated = match.matched.filter((r) => r.existed).length;
      const inserted = match.matched.length - updated;
      toast.success(`Imported ${match.matched.length} row(s) — ${inserted} new, ${updated} updated`);

      logAdminAudit("attendance_compliance_snapshots", "imported", {
        period_type: "monthly",
        period_start: periodStartIso,
        period_end: periodEndIso,
        period_label: periodLabel,
        source_file: filename,
        rows_total: parsedRows.length,
        rows_inserted: inserted,
        rows_updated: updated,
        rows_skipped_unknown: match.unknown.length,
        rows_invalid: match.invalid.length,
        unknown_staff_ids: match.unknown.map((r) => r.staff_id),
      });

      reset();
      onOpenChange(false);
      onImported?.();
    } catch (e: any) {
      console.error("Import failed", e);
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const updatedCount = match?.matched.filter((r) => r.existed).length ?? 0;
  const newCount = (match?.matched.length ?? 0) - updatedCount;

  // Mismatch = file clearly says one month, selector says another.
  const periodMismatch = !!(periodHint?.startIso && periodHint.startIso !== periodStartIso);

  const applyDetectedPeriod = () => {
    if (!periodHint?.startIso) return;
    const d = parseISO(periodHint.startIso);
    setSelectedMonth(d.getMonth());
    setSelectedYear(d.getFullYear());
    setMatch(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Import Monthly Compliance
          </DialogTitle>
          <DialogDescription>
            Re-importing for the same month <strong>updates</strong> existing staff figures instead of creating duplicates.
            Use the downloadable template to keep columns aligned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Target month</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => { setSelectedMonth(Number(v)); setMatch(null); }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => { setSelectedYear(Number(v)); setMatch(null); }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Period: <strong>{periodLabel}</strong> ({periodStartIso} → {periodEndIso}). All rows in this file are saved as <strong>monthly</strong> snapshots for this exact period — no mismatched columns possible.
              </p>
            </div>
            <div>
              <Label className="text-xs">Spreadsheet (.xlsx / .xls / .csv)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={parsing || importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
                className="h-9"
              />
              {filename && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> {filename}
                </p>
              )}
            </div>
          </div>

          {(parsing || matching) && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading spreadsheet…
            </div>
          )}

          {/* Period auto-detection feedback */}
          {periodHint && !periodMismatch && !parsing && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>File period matches selected month</AlertTitle>
              <AlertDescription className="text-xs">
                Detected <strong>{periodHint.raw}</strong> in the spreadsheet's {periodHint.source.replace("_", " ")} — same as the target period <strong>{periodLabel}</strong>.
              </AlertDescription>
            </Alert>
          )}
          {periodHint && periodMismatch && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Period mismatch — import blocked</AlertTitle>
              <AlertDescription className="text-xs space-y-2">
                <div>
                  The spreadsheet's {periodHint.source.replace("_", " ")} says <strong>{periodHint.raw}</strong>,
                  but the target month is set to <strong>{periodLabel}</strong>. Importing now would file these
                  figures under the wrong period.
                </div>
                <Button size="sm" variant="outline" onClick={applyDetectedPeriod} className="h-7">
                  Use detected period ({periodHint.raw})
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {match && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />{match.matched.length} ready</Badge>
                <Badge variant="outline" className="gap-1">{newCount} new · {updatedCount} will update</Badge>
                {match.unknown.length > 0 && (
                  <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />{match.unknown.length} unknown staff ID</Badge>
                )}
                {match.invalid.length > 0 && (
                  <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3 text-red-600" />{match.invalid.length} invalid</Badge>
                )}
              </div>

              {match.unknown.length > 0 && (
                <Alert variant="default" className="border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{match.unknown.length} row(s) will be skipped</AlertTitle>
                  <AlertDescription className="text-amber-800">
                    These Staff IDs were not found in the directory and will not be imported:
                    <ScrollArea className="mt-2 max-h-28 rounded border border-amber-200 bg-white/60 p-2 text-[11px]">
                      <ul className="space-y-0.5">
                        {match.unknown.map((r) => (
                          <li key={r.rowIndex}>Row {r.rowIndex}: <code>{r.staff_id}</code> — {r.name || "(no name)"}</li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </AlertDescription>
                </Alert>
              )}

              {match.invalid.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{match.invalid.length} invalid row(s)</AlertTitle>
                  <AlertDescription>
                    <ul className="text-xs mt-1 space-y-0.5">
                      {match.invalid.map((r) => (
                        <li key={r.rowIndex}>Row {r.rowIndex}: {r.reason}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {updatedCount > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Existing records will be updated</AlertTitle>
                  <AlertDescription className="text-xs">
                    {updatedCount} staff already have a {periodLabel} snapshot. Their figures will be overwritten with the values in this file.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={importing || parsing || !match || match.matched.length === 0 || periodMismatch}
            title={periodMismatch ? "Resolve the period mismatch before importing" : undefined}
          >
            {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Import {match ? `(${match.matched.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
