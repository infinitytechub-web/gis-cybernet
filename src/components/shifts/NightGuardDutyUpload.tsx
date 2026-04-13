import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Users, Trash2, CalendarIcon, Plus } from "lucide-react";
import { format, addDays, eachDayOfInterval, parseISO } from "date-fns";
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

export default function NightGuardDutyUpload({ nightGuardStaff, shifts }: Props) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedAssignment[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // Manual assign state
  const [manualDate, setManualDate] = useState("");
  const [manualGuardIds, setManualGuardIds] = useState<string[]>([]);
  const [manualSearch, setManualSearch] = useState("");

  const nightGuardShift = shifts.find((s: any) => s.name?.toLowerCase().includes("night guard"));

  const filteredManualGuards = useMemo(() => {
    if (!manualSearch) return nightGuardStaff;
    const q = manualSearch.toLowerCase();
    return nightGuardStaff.filter((g: any) =>
      `${g.first_name} ${g.last_name} ${g.staff_id}`.toLowerCase().includes(q)
    );
  }, [nightGuardStaff, manualSearch]);

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
          } else {
            const parsed = new Date(String(dateRaw));
            if (!isNaN(parsed.getTime())) {
              dateStr = format(parsed, "yyyy-MM-dd");
            }
          }

          const match = nightGuardStaff.find((s: any) => s.staff_id === staffId);
          assignments.push({
            staffId,
            staffName: staffName || (match ? `${match.first_name} ${match.last_name}` : "Unknown"),
            date: dateStr,
            profileId: match?.id,
            error: !staffId ? "Missing Staff ID" : !match ? "Staff not found in Night Guard dept" : !dateStr ? "Invalid date" : undefined,
          });
        }
        setParsed(assignments);
      } catch {
        toast.error("Failed to parse file");
      }
    };
    reader.readAsBinaryString(f);
  };

  const validAssignments = parsed.filter((a) => !a.error && a.profileId);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!nightGuardShift) throw new Error("No Night Guard shift found. Create one first.");
      if (validAssignments.length === 0) throw new Error("No valid assignments to upload");

      const rows = validAssignments.map((a) => ({
        profile_id: a.profileId!,
        shift_id: nightGuardShift.id,
        start_date: a.date,
        end_date: a.date,
      }));

      const { error } = await supabase.from("shift_assignments").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`${validAssignments.length} assignments created`);
      setParsed([]);
      setFile(null);
      setUploadOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const manualMutation = useMutation({
    mutationFn: async () => {
      if (!nightGuardShift) throw new Error("No Night Guard shift found");
      if (!manualDate || manualGuardIds.length === 0) throw new Error("Select date and guards");

      const rows = manualGuardIds.map((pid) => ({
        profile_id: pid,
        shift_id: nightGuardShift.id,
        start_date: manualDate,
        end_date: manualDate,
      }));

      const { error } = await supabase.from("shift_assignments").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`${manualGuardIds.length} guards assigned for ${manualDate}`);
      setManualDate("");
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

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(v) => { setUploadOpen(v); if (!v) { setParsed([]); setFile(null); } }}>
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
              Upload an Excel or CSV file with columns: <strong>Staff ID</strong>, <strong>Name</strong> (optional), <strong>Date</strong>. Each row creates a shift assignment for that guard on that date.
            </p>
            <div className="flex gap-2">
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="flex-1" />
              <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs shrink-0">
                Download Template
              </Button>
            </div>

            {parsed.length > 0 && (
              <>
                <div className="flex items-center gap-2">
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
                <ScrollArea className="max-h-[250px] border rounded-md">
                  <div className="p-2 space-y-1">
                    {parsed.map((a, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${a.error ? "bg-destructive/10" : "bg-emerald-50 dark:bg-emerald-900/20"}`}>
                        <span className="font-mono w-20 truncate">{a.staffId || "—"}</span>
                        <span className="flex-1 truncate">{a.staffName}</span>
                        <span className="w-24 text-muted-foreground">{a.date || "—"}</span>
                        {a.error && <span className="text-destructive text-[10px]">{a.error}</span>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || validAssignments.length === 0}
                  className="w-full"
                >
                  {uploadMutation.isPending ? "Creating assignments..." : `Create ${validAssignments.length} Assignments`}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Assign Dialog */}
      <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) { setManualDate(""); setManualGuardIds([]); setManualSearch(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-semibold">
            <Plus className="h-4 w-4" /> Assign Guards
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-[hsl(220,80%,18%)]" />
              Assign Guards to Date
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
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
              disabled={manualMutation.isPending || !manualDate || manualGuardIds.length === 0}
              className="w-full"
            >
              {manualMutation.isPending ? "Assigning..." : `Assign ${manualGuardIds.length} Guard(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
