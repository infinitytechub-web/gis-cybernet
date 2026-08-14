import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Users, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string }[];
  shifts: { id: string; name: string; pattern: string }[];
}

export function ManualAssignDialog({ nightGuardStaff, shifts }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [comboOpen, setComboOpen] = useState(false);

  const selectedGuard = useMemo(
    () => nightGuardStaff.find((g) => g.id === profileId),
    [nightGuardStaff, profileId]
  );

  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["existing-assignments", startDate, shiftId],
    queryFn: async () => {
      if (!startDate) return [];
      let query = supabase
        .from("shift_assignments")
        .select("id, profile_id, start_date, profiles:profile_id(first_name, last_name, staff_id)")
        .eq("start_date", startDate);
      if (shiftId) query = query.eq("shift_id", shiftId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!startDate,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !shiftId || !startDate) throw new Error("Fill all required fields");
      const { error } = await supabase.from("shift_assignments").insert({
        profile_id: profileId,
        shift_id: shiftId,
        start_date: startDate,
        end_date: endDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["existing-assignments"] });
      setProfileId("");
      toast.success("Night guard manually assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetAndClose = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setProfileId("");
      setShiftId("");
      setStartDate("");
      setEndDate("");
      setComboOpen(false);
    }
  };

  const assignedProfileIds = new Set(existingAssignments.map((a: any) => a.profile_id));

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Manual Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Manual Night Guard Assignment</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
              <Label>End Date (optional)</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          {startDate && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Already assigned on {format(new Date(startDate + "T00:00:00"), "dd/MM/yyyy")}
              </p>
              {existingAssignments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No guards assigned yet</p>
              ) : (
                <ScrollArea className="max-h-[100px]">
                  <div className="flex flex-wrap gap-1.5">
                    {existingAssignments.map((a: any) => (
                      <Badge key={a.id} variant="secondary" className="text-[10px]">
                        {(a.profiles as any)?.staff_id} — {(a.profiles as any)?.last_name}, {(a.profiles as any)?.first_name?.charAt(0)}.
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Guard</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  className="w-full justify-between h-9 text-sm font-normal"
                >
                  {selectedGuard
                    ? `${selectedGuard.last_name}, ${selectedGuard.first_name} (${selectedGuard.staff_id})`
                    : "Search and select a guard..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type name or staff ID..." />
                  <CommandList>
                    <CommandEmpty>No guard found.</CommandEmpty>
                    <CommandGroup>
                      {nightGuardStaff.map((g) => {
                        const alreadyAssigned = assignedProfileIds.has(g.id);
                        return (
                          <CommandItem
                            key={g.id}
                            value={`${g.last_name} ${g.first_name} ${g.staff_id}`}
                            onSelect={() => {
                              setProfileId(profileId === g.id ? "" : g.id);
                              setComboOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check className={cn("h-4 w-4", profileId === g.id ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{g.last_name}, {g.first_name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{g.staff_id}</Badge>
                            {alreadyAssigned && <Badge variant="secondary" className="text-[9px] shrink-0">assigned</Badge>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !profileId || !shiftId || !startDate} className="w-full font-bold">
            {assignMutation.isPending ? "Assigning..." : "Assign Guard"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
