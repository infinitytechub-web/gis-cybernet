import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UsersRound, Loader2 } from "lucide-react";
import { addDays, format, differenceInDays } from "date-fns";
import { toast } from "sonner";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string }[];
  shifts: { id: string; name: string; pattern: string }[];
}

export function BulkAssignDialog({ nightGuardStaff, shifts }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shiftId, setShiftId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedGuards, setSelectedGuards] = useState<Set<string>>(new Set());

  const toggleGuard = (id: string) => {
    setSelectedGuards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedGuards.size === nightGuardStaff.length) {
      setSelectedGuards(new Set());
    } else {
      setSelectedGuards(new Set(nightGuardStaff.map(s => s.id)));
    }
  };

  const dateCount = startDate && endDate
    ? Math.max(1, differenceInDays(new Date(endDate), new Date(startDate)) + 1)
    : startDate ? 1 : 0;

  const totalAssignments = selectedGuards.size * dateCount;

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!shiftId || !startDate || !endDate) throw new Error("Select shift and date range");
      if (selectedGuards.size === 0) throw new Error("Select at least one guard");

      const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
      if (days < 1) throw new Error("End date must be on or after start date");
      if (days > 31) throw new Error("Date range cannot exceed 31 days");

      // Build all rows
      const rows: { profile_id: string; shift_id: string; start_date: string; end_date: string | null }[] = [];
      for (let d = 0; d < days; d++) {
        const date = format(addDays(new Date(startDate), d), "yyyy-MM-dd");
        for (const guardId of selectedGuards) {
          rows.push({ profile_id: guardId, shift_id: shiftId, start_date: date, end_date: null });
        }
      }

      // Insert in batches
      const batchSize = 50;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("shift_assignments")
          .insert(batch)
          .select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }

      return { inserted };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      toast.success(`Bulk assignment complete: ${result.inserted} assignments created`);
      resetAndClose(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetAndClose = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setShiftId("");
      setStartDate("");
      setEndDate("");
      setSelectedGuards(new Set());
    }
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <UsersRound className="h-4 w-4" /> Bulk Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Bulk Night Guard Assignment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Shift</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {shifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.pattern})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          {dateCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {dateCount} day{dateCount !== 1 ? "s" : ""} selected
            </p>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Guards</Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAll}>
                {selectedGuards.size === nightGuardStaff.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <ScrollArea className="max-h-[180px] rounded-md border p-2">
              <div className="space-y-1.5">
                {nightGuardStaff.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedGuards.has(p.id)}
                      onCheckedChange={() => toggleGuard(p.id)}
                    />
                    <span className="truncate">{p.staff_id} — {p.last_name}, {p.first_name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              {selectedGuards.size} guard{selectedGuards.size !== 1 ? "s" : ""} selected
            </p>
          </div>

          {totalAssignments > 0 && (
            <div className="rounded-md bg-muted/50 border p-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total assignments to create:</span>
              <Badge variant="secondary" className="text-xs">{totalAssignments}</Badge>
            </div>
          )}

          <Button
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending || selectedGuards.size === 0 || !shiftId || !startDate || !endDate}
            className="w-full"
          >
            {bulkMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Assigning...</>
            ) : (
              `Assign ${totalAssignments} Shift${totalAssignments !== 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
