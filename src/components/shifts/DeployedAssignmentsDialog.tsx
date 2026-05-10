// src/components/shifts/DeployedAssignmentsDialog.tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldAlert, Repeat } from "lucide-react";
import { toast } from "sonner";

const SHIFTS = ["A", "B", "C", "D"] as const;
type ShiftLetter = typeof SHIFTS[number];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  effectiveDate: string;
  importLabel: string;
}

type Assignment = {
  id: string;
  profile_id: string;
  start_date: string;
  end_date: string | null;
  shift_letter: ShiftLetter;
  staff_name: string;
  staff_id: string;
};

export function DeployedAssignmentsDialog({ open, onOpenChange, effectiveDate, importLabel }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [newShift, setNewShift] = useState<ShiftLetter>("A");
  const [reason, setReason] = useState("");
  const [overrideDate, setOverrideDate] = useState(effectiveDate);

  const { data = [], isLoading } = useQuery({
    queryKey: ["deployed-assignments", effectiveDate],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("id, profile_id, start_date, end_date, shifts!inner(name), profiles!inner(first_name, last_name, staff_id)")
        .lte("start_date", effectiveDate)
        .or(`end_date.is.null,end_date.gte.${effectiveDate}`);
      if (error) throw error;
      return ((data ?? []) as any[])
        .map((r) => {
          const m = String(r.shifts?.name ?? "").match(/Shift\s+([ABCD])/i);
          return m
            ? {
                id: r.id,
                profile_id: r.profile_id,
                start_date: r.start_date,
                end_date: r.end_date,
                shift_letter: m[1].toUpperCase() as ShiftLetter,
                staff_name: `${r.profiles?.last_name ?? ""}, ${r.profiles?.first_name ?? ""}`,
                staff_id: r.profiles?.staff_id ?? "—",
              } as Assignment
            : null;
        })
        .filter(Boolean) as Assignment[];
    },
  });

  const grouped = SHIFTS.reduce((acc, s) => {
    acc[s] = data.filter((d) => d.shift_letter === s).sort((a, b) => a.staff_name.localeCompare(b.staff_name));
    return acc;
  }, {} as Record<ShiftLetter, Assignment[]>);

  const override = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No assignment selected");
      if (reason.trim().length < 5) throw new Error("Reason must be at least 5 characters");
      const { data, error } = await supabase.rpc("override_shift_assignment", {
        _profile_id: editing.profile_id,
        _shift_letter: newShift,
        _start_date: overrideDate,
        _reason: reason.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      if (res?.changed === false) toast.info(res.message ?? "No change applied");
      else toast.success(`Moved to ${res?.new_shift ?? "new shift"} (audit recorded)`);
      setEditing(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["deployed-assignments"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Override failed"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Override deployed shift assignments
            </DialogTitle>
            <DialogDescription>
              {importLabel} · effective {effectiveDate}. Each change writes to the system audit trail with the reason you provide.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <Tabs defaultValue="A">
              <TabsList className="grid grid-cols-4 w-full max-w-md">
                {SHIFTS.map((s) => (
                  <TabsTrigger key={s} value={s} className="text-xs">
                    Shift {s} ({grouped[s].length})
                  </TabsTrigger>
                ))}
              </TabsList>
              {SHIFTS.map((s) => (
                <TabsContent key={s} value={s} className="mt-3">
                  <div className="rounded-lg border overflow-x-auto max-h-[420px]">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead className="w-32">Staff ID</TableHead>
                          <TableHead className="w-32">Since</TableHead>
                          <TableHead className="w-24 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grouped[s].length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">No staff currently on Shift {s}</TableCell></TableRow>
                        ) : grouped[s].map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs font-medium">{a.staff_name}</TableCell>
                            <TableCell className="text-xs font-mono">{a.staff_id}</TableCell>
                            <TableCell className="text-xs">{a.start_date}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                                onClick={() => {
                                  setEditing(a);
                                  setNewShift(SHIFTS.find((x) => x !== a.shift_letter) ?? "A");
                                  setOverrideDate(effectiveDate);
                                }}
                              >
                                <Repeat className="h-3 w-3" /> Override
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Override sub-dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override shift assignment</DialogTitle>
            <DialogDescription>
              Move <strong>{editing?.staff_name}</strong> ({editing?.staff_id}) from Shift{" "}
              <Badge variant="outline" className="text-[10px]">{editing?.shift_letter}</Badge> to a new shift.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">New shift</Label>
                <Select value={newShift} onValueChange={(v) => setNewShift(v as ShiftLetter)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map((s) => <SelectItem key={s} value={s}>Shift {s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective from</Label>
                <Input type="date" className="h-9" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (required, min 5 chars)</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Staff swap requested by OIC due to leave coverage" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => override.mutate()} disabled={override.isPending || reason.trim().length < 5}>
              {override.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Apply override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DeployedAssignmentsDialog;
