import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText, FileSpreadsheet, FileType, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays, format, parseISO, isAfter } from "date-fns";
import { exportReport, getFormatLabel, type ExportFormat } from "@/lib/export-utils";

const ALL = "__all__";
const FORMATS: { key: ExportFormat; icon: any; label: string }[] = [
  { key: "pdf", icon: FileText, label: "PDF" },
  { key: "csv", icon: FileSpreadsheet, label: "CSV" },
  { key: "excel", icon: FileSpreadsheet, label: "Excel (.xlsx)" },
  { key: "word", icon: FileType, label: "Word (.doc)" },
];

export interface ScopedExportOptions {
  fromIso: string;
  toIso: string;
  departmentIds: string[]; // empty = all
  offices: string[]; // empty = all
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fill values pulled from the on-screen filters. */
  initial: {
    fromIso: string;
    toIso: string;
    departmentId: string; // ALL or id
    office: string; // ALL or value
  };
  /**
   * Runs the actual export. Receives the scoped options and the chosen format.
   * Should return the row count exported (used for the success toast).
   */
  onExport: (opts: ScopedExportOptions, fmt: ExportFormat) => Promise<number> | number;
}

export function AttendanceComplianceExportDialog({ open, onOpenChange, initial, onExport }: Props) {
  const [fromIso, setFromIso] = useState(initial.fromIso);
  const [toIso, setToIso] = useState(initial.toIso);
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [selectedOffices, setSelectedOffices] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  // Reset when dialog opens — pre-fill with the on-screen scope.
  useEffect(() => {
    if (!open) return;
    setFromIso(initial.fromIso);
    setToIso(initial.toIso);
    setSelectedDepartments(initial.departmentId !== ALL ? new Set([initial.departmentId]) : new Set());
    setSelectedOffices(initial.office !== ALL ? new Set([initial.office]) : new Set());
  }, [open, initial.fromIso, initial.toIso, initial.departmentId, initial.office]);

  const { data: departments = [] } = useQuery({
    queryKey: ["acr-export-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: offices = [] } = useQuery({
    queryKey: ["acr-export-offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("office")
        .eq("status", "active")
        .not("office", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((p: any) => { if (p.office) set.add(p.office); });
      return Array.from(set).sort();
    },
  });

  const rangeDays = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(toIso), parseISO(fromIso)) + 1;
    } catch { return 0; }
  }, [fromIso, toIso]);

  const rangeInvalid = !fromIso || !toIso || isAfter(parseISO(fromIso), parseISO(toIso));

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const handleExport = async (fmt: ExportFormat) => {
    if (rangeInvalid) {
      toast.error("Please choose a valid date range (From must be before To).");
      return;
    }
    setBusy(fmt);
    try {
      const count = await onExport(
        {
          fromIso, toIso,
          departmentIds: Array.from(selectedDepartments),
          offices: Array.from(selectedOffices),
        },
        fmt,
      );
      if (count === 0) {
        toast.warning("No staff matched the export scope. Nothing was downloaded.");
      } else {
        toast.success(`${getFormatLabel(fmt)} downloaded · ${count} staff`);
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" /> Scoped export
          </DialogTitle>
          <DialogDescription>
            Override the on-screen view to export only the records you need. The date range can span any
            interval — week, month, quarter, or custom.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={fromIso} max={toIso || undefined}
                onChange={(e) => setFromIso(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={toIso} min={fromIso || undefined}
                onChange={(e) => setToIso(e.target.value)} className="h-9" />
            </div>
          </div>
          {rangeInvalid ? (
            <p className="text-xs text-destructive">From date must be on or before To date.</p>
          ) : (
            <p className="text-xs text-muted-foreground">{rangeDays} day{rangeDays === 1 ? "" : "s"} selected.</p>
          )}

          {/* Departments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Departments</Label>
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" className="text-primary hover:underline"
                  onClick={() => setSelectedDepartments(new Set((departments as any[]).map((d) => d.id)))}>
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-muted-foreground hover:underline"
                  onClick={() => setSelectedDepartments(new Set())}>
                  Clear
                </button>
              </div>
            </div>
            <div className="rounded-md border">
              <ScrollArea className="h-32">
                <div className="p-2 space-y-1">
                  {(departments as any[]).map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedDepartments.has(d.id)}
                        onCheckedChange={() => toggle(selectedDepartments, setSelectedDepartments, d.id)}
                      />
                      <span className="truncate">{d.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {selectedDepartments.size === 0 ? "All departments will be included." : `${selectedDepartments.size} selected.`}
            </p>
          </div>

          {/* Offices */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Offices</Label>
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" className="text-primary hover:underline"
                  onClick={() => setSelectedOffices(new Set(offices as string[]))}>
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button type="button" className="text-muted-foreground hover:underline"
                  onClick={() => setSelectedOffices(new Set())}>
                  Clear
                </button>
              </div>
            </div>
            <div className="rounded-md border">
              <ScrollArea className="h-32">
                <div className="p-2 space-y-1">
                  {(offices as string[]).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic px-2 py-1">No offices configured yet.</p>
                  ) : (offices as string[]).map((o) => (
                    <label key={o} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedOffices.has(o)}
                        onCheckedChange={() => toggle(selectedOffices, setSelectedOffices, o)}
                      />
                      <span className="truncate">{o}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {selectedOffices.size === 0 ? "All offices will be included." : `${selectedOffices.size} selected.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Badge variant="outline" className="text-[11px]">{format(parseISO(fromIso || initial.fromIso), "dd/MM/yyyy")} → {format(parseISO(toIso || initial.toIso), "dd/MM/yyyy")}</Badge>
            <Badge variant="outline" className="text-[11px]">
              {selectedDepartments.size === 0 ? "All depts" : `${selectedDepartments.size} dept${selectedDepartments.size === 1 ? "" : "s"}`}
            </Badge>
            <Badge variant="outline" className="text-[11px]">
              {selectedOffices.size === 0 ? "All offices" : `${selectedOffices.size} office${selectedOffices.size === 1 ? "" : "s"}`}
            </Badge>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>Cancel</Button>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                variant={key === "pdf" ? "default" : "outline"}
                size="sm"
                disabled={!!busy || rangeInvalid}
                onClick={() => handleExport(key)}
                className="gap-1"
              >
                <Icon className="h-4 w-4" />
                {busy === key ? "Exporting…" : label}
              </Button>
            ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience trigger button — keeps the report file tidy. */
export function AttendanceComplianceExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="default" className="gap-1" onClick={onClick}>
      <Download className="h-4 w-4" />
      Export…
    </Button>
  );
}
