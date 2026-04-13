import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createNotification, getUserIdFromProfileId } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, CalendarIcon, Plus, RefreshCw } from "lucide-react";
import { format, addDays, eachDayOfInterval, parseISO, startOfWeek } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  nightGuardStaff: any[];
  shifts: any[];
}

interface ParsedAssignment {
  staffId: string;
  staffName: string;
  date: string;
  profileId?: string;
  error?: string;
}

async function notifyGuards(profileIds: string[], dateLabel: string, shiftName: string) {
  for (const pid of [...new Set(profileIds)]) {
    const userId = await getUserIdFromProfileId(pid);
    if (userId) {
      await createNotification({
        userId,
        title: "Night Guard Duty Assignment",
        message: `You have been assigned to ${shiftName} duty for ${dateLabel}.`,
        type: "shift",
      });
    }
  }
}

export default function NightGuardDutyUpload({ nightGuardStaff, shifts }: Props) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedAssignment[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // Upload date range override
  const [uploadStartDate, setUploadStartDate] = useState("");
  const [uploadEndDate, setUploadEndDate] = useState("");
  const [useUploadDateRange, setUseUploadDateRange] = useState(false);

  // Manual assign state
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualEndDate, setManualEndDate] = useState("");
  const [manualGuardIds, setManualGuardIds] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");

  // Replace week state
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceWeekStart, setReplaceWeekStart] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceParsed, setReplaceParsed] = useState<ParsedAssignment[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nightGuardShift = shifts.find((s: any) => s.name?.toLowerCase().includes("night guard"));

  const filteredManualGuards = useMemo(() => {
    if (!manualSearch) return nightGuardStaff;
    const q = manualSearch.toLowerCase();
    return nightGuardStaff.filter((g: any) =>
      `${g.first_name} ${g.last_name} ${g.staff_id}`.toLowerCase().includes(q)
    );
  }, [nightGuardStaff, manualSearch]);

  const manualDateCount = useMemo(() => {
    if (!manualStartDate) return 0;
    if (!manualEndDate || manualEndDate < manualStartDate) return 1;
    return eachDayOfInterval({ start: parseISO(manualStartDate), end: parseISO(manualEndDate) }).length;
  }, [manualStartDate, manualEndDate]);

  const uploadDateRange = useMemo(() => {
    if (!useUploadDateRange || !uploadStartDate) return null;
    if (!uploadEndDate || uploadEndDate < uploadStartDate) return [uploadStartDate];
    return eachDayOfInterval({ start: parseISO(uploadStartDate), end: parseISO(uploadEndDate) }).map((d) => format(d, "yyyy-MM-dd"));
  }, [useUploadDateRange, uploadStartDate, uploadEndDate]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const assignments: ParsedAssignment[] = [];
        for (const row of rows) {
          const staffId = String(row["Staff ID"] || row["staff_id"] || "").trim();
          const staffName = String(row["Name"] || row["Staff Name"] || row["name"] || "").trim();
          const dateRaw = row["Date"] || row["date"] || "";

          let dateStr = "";
          if (typeof dateRaw === "number") {
            const d = XLSX.SSF.parse_date_code(dateRaw);
            dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          } else if (String(dateRaw).trim()) {
            const parsedDate = new Date(String(dateRaw));
            if (!isNaN(parsedDate.getTime())) {
              dateStr = format(parsedDate, "yyyy-MM-dd");
            }
          }

          const match = nightGuardStaff.find((s: any) => s.staff_id === staffId);
          const needsDate = !dateStr && !useUploadDateRange;
          assignments.push({
            staffId,
            staffName: staffName || (match ? `${match.first_name} ${match.last_name}` : "Unknown"),
            date: dateStr,
            profileId: match?.id,
            error: !staffId ? "Missing Staff ID" : !match ? "Staff not found in Night Guard dept" : needsDate ? "Invalid date (use date range or add Date column)" : undefined,
          });
        }
        setParsed(assignments);
      } catch {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsBinaryString(f);
  };

  // Re-validate when date range toggle changes
  const validAssignments = parsed.filter((a) => {
    if (a.error && a.error !== "Invalid date (use date range or add Date column)") return false;
    if (!a.profileId) return false;
    if (!a.date && !uploadDateRange) return false;
    return true;
  });

  // Build final rows to insert, expanding date range
  const buildUploadRows = () => {
    if (!nightGuardShift) return [];
    const rows: { profile_id: string; shift_id: string; start_date: string; end_date: string }[] = [];

    for (const a of validAssignments) {
      if (uploadDateRange) {
        // Apply date range to every staff member
        for (const d of uploadDateRange) {
          rows.push({ profile_id: a.profileId!, shift_id: nightGuardShift.id, start_date: d, end_date: d });
        }
      } else {
        rows.push({ profile_id: a.profileId!, shift_id: nightGuardShift.id, start_date: a.date, end_date: a.date });
      }
    }
    return rows;
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!nightGuardShift) throw new Error("No Night Guard shift found. Create one first.");
      const rows = buildUploadRows();
      if (rows.length === 0) throw new Error("No valid assignments to upload");

      const { error } = await supabase.from("shift_assignments").insert(rows);
      if (error) throw error;
      return rows;
    },
    onSuccess: async (rows) => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`${rows.length} assignments created`);

      // Send notifications
      const dateLabel = uploadDateRange
        ? `${uploadDateRange[0]} to ${uploadDateRange[uploadDateRange.length - 1]}`
        : `${rows.length} date(s)`;
      const profileIds = validAssignments.map((a) => a.profileId!);
      notifyGuards(profileIds, dateLabel, nightGuardShift?.name ?? "Night Guard");

      setParsed([]);
      setFile(null);
      setUploadOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const manualMutation = useMutation({
    mutationFn: async () => {
      if (!nightGuardShift) throw new Error("No Night Guard shift found");
      if (!manualStartDate || manualGuardIds.length === 0) throw new Error("Select date and guards");

      const dates = manualEndDate && manualEndDate >= manualStartDate
        ? eachDayOfInterval({ start: parseISO(manualStartDate), end: parseISO(manualEndDate) }).map((d) => format(d, "yyyy-MM-dd"))
        : [manualStartDate];

      const rows = manualGuardIds.flatMap((pid) =>
        dates.map((d) => ({ profile_id: pid, shift_id: nightGuardShift.id, start_date: d, end_date: d }))
      );

      const { error } = await supabase.from("shift_assignments").insert(rows);
      if (error) throw error;
      return { count: rows.length, dates };
    },
    onSuccess: async ({ count, dates }) => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`${count} assignments created`);

      // Send notifications
      const dateLabel = dates.length > 1 ? `${dates[0]} to ${dates[dates.length - 1]}` : dates[0];
      notifyGuards(manualGuardIds, dateLabel, nightGuardShift?.name ?? "Night Guard");

      setManualStartDate("");
      setManualEndDate("");
      setManualGuardIds([]);
      setManualOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Staff ID", "Name", "Date"],
      ["GIS-001", "Doe, John", format(new Date(), "yyyy-MM-dd")],
      ["GIS-002", "Smith, Jane", format(addDays(new Date(), 1), "yyyy-MM-dd")],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Night Guard Duty");
    XLSX.writeFile(wb, "night_guard_duty_template.xlsx");
    toast.success("Template downloaded");
  };

  const totalUploadAssignments = uploadDateRange
    ? validAssignments.length * uploadDateRange.length
    : validAssignments.length;

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(v) => { setUploadOpen(v); if (!v) { setParsed([]); setFile(null); setUseUploadDateRange(false); setUploadStartDate(""); setUploadEndDate(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-semibold">
            <Upload className="h-4 w-4" /> Upload Duty List
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-[hsl(220,80%,18%)]" />
              Upload Night Guard Duty List
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload an Excel or CSV with <strong>Staff ID</strong> column. Optionally include a <strong>Date</strong> column per row, or use the date range below to assign all guards across multiple days.
            </p>
            <div className="flex gap-2">
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs shrink-0">
                Template
              </Button>
            </div>

            {/* Date range override */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dateRangeToggle"
                  checked={useUploadDateRange}
                  onChange={(e) => setUseUploadDateRange(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="dateRangeToggle" className="text-xs cursor-pointer">
                  Apply date range to all staff in file (overrides per-row dates)
                </Label>
              </div>
              {useUploadDateRange && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Start Date</Label>
                    <Input type="date" value={uploadStartDate} onChange={(e) => setUploadStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">End Date</Label>
                    <Input type="date" value={uploadEndDate} onChange={(e) => setUploadEndDate(e.target.value)} min={uploadStartDate} />
                  </div>
                </div>
              )}
              {useUploadDateRange && uploadDateRange && (
                <p className="text-[10px] text-muted-foreground">
                  {uploadDateRange.length} day(s) × {validAssignments.length} guard(s) = <strong>{totalUploadAssignments}</strong> total assignments
                </p>
              )}
            </div>

            {parsed.length > 0 && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {parsed.length} rows parsed
                  </Badge>
                  <Badge className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {validAssignments.length} valid
                  </Badge>
                  {parsed.length - validAssignments.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" /> {parsed.length - validAssignments.length} errors
                    </Badge>
                  )}
                </div>
                <ScrollArea className="max-h-[200px] border rounded-md">
                  <div className="p-2 space-y-1">
                    {parsed.map((a, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${a.error ? "bg-destructive/10" : "bg-emerald-50 dark:bg-emerald-900/20"}`}>
                        <span className="font-mono w-20 truncate">{a.staffId || "—"}</span>
                        <span className="flex-1 truncate">{a.staffName}</span>
                        <span className="w-24 text-muted-foreground">{useUploadDateRange ? "range" : a.date || "—"}</span>
                        {a.error && !(useUploadDateRange && a.error.includes("date")) && (
                          <span className="text-destructive text-[10px]">{a.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || totalUploadAssignments === 0}
                  className="w-full"
                >
                  {uploadMutation.isPending ? "Creating assignments..." : `Create ${totalUploadAssignments} Assignment(s)`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Assign Dialog */}
      <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) { setManualStartDate(""); setManualEndDate(""); setManualGuardIds([]); setManualSearch(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-semibold">
            <Plus className="h-4 w-4" /> Assign Guards
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-[hsl(220,80%,18%)]" />
              Assign Guards to Dates
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input type="date" value={manualEndDate} onChange={(e) => setManualEndDate(e.target.value)} min={manualStartDate} />
              </div>
            </div>
            {manualDateCount > 1 && (
              <p className="text-[10px] text-muted-foreground">
                {manualDateCount} days × {manualGuardIds.length} guard(s) = <strong>{manualDateCount * manualGuardIds.length}</strong> assignments
              </p>
            )}
            <div>
              <Label>Search Guards</Label>
              <Input placeholder="Search by name or ID..." value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
            </div>
            <ScrollArea className="max-h-[200px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredManualGuards.map((g: any) => {
                  const selected = manualGuardIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${selected ? "bg-primary/10 border border-primary/30" : "hover:bg-accent"}`}
                      onClick={() => setManualGuardIds((prev) => selected ? prev.filter((id) => id !== g.id) : [...prev, g.id])}
                    >
                      <input type="checkbox" checked={selected} readOnly className="pointer-events-none" />
                      <span className="font-mono text-xs w-20">{g.staff_id}</span>
                      <span className="flex-1 truncate">{g.last_name}, {g.first_name}</span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">{manualGuardIds.length} guard(s) selected</p>
            <Button
              onClick={() => manualMutation.mutate()}
              disabled={manualMutation.isPending || !manualStartDate || manualGuardIds.length === 0}
              className="w-full"
            >
              {manualMutation.isPending ? "Assigning..." : `Assign ${manualDateCount * manualGuardIds.length} Total`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
