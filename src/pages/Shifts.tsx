import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Plus, Calendar, Shield, ChevronLeft, ChevronRight, Users, Pencil, Trash2 } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ShiftPattern = Database["public"]["Enums"]["shift_pattern"];

export default function Shifts() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");

  // Shift CRUD state
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [shiftName, setShiftName] = useState("");
  const [shiftPattern, setShiftPattern] = useState<ShiftPattern>("8h");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftEndTime, setShiftEndTime] = useState("");
  const [shiftDescription, setShiftDescription] = useState("");

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shifts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["shift-assignments", weekStart.toISOString()],
    queryFn: async () => {
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(addDays(weekStart, 6), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("shift_assignments")
        .select("*, profiles(first_name, last_name, staff_id, shift_group), shifts(name)")
        .lte("start_date", to)
        .or(`end_date.gte.${from},end_date.is.null`);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, shift_group, department_id, departments(name)")
        .eq("status", "active")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: nightGuardDept } = useQuery({
    queryKey: ["night-guard-dept"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .ilike("name", "%night guard%")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const nightGuardStaff = profiles.filter((p: any) => p.department_id === nightGuardDept?.id);

  // Shift CRUD
  const openCreateShift = () => {
    setEditingShift(null);
    setShiftName("");
    setShiftPattern("8h");
    setShiftStartTime("");
    setShiftEndTime("");
    setShiftDescription("");
    setShiftDialogOpen(true);
  };

  const openEditShift = (s: any) => {
    setEditingShift(s);
    setShiftName(s.name);
    setShiftPattern(s.pattern);
    setShiftStartTime(s.start_time || "");
    setShiftEndTime(s.end_time || "");
    setShiftDescription(s.description || "");
    setShiftDialogOpen(true);
  };

  const shiftSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shiftName.trim()) throw new Error("Shift name is required");
      const payload = {
        name: shiftName.trim(),
        pattern: shiftPattern,
        start_time: shiftStartTime || null,
        end_time: shiftEndTime || null,
        description: shiftDescription || null,
      };
      if (editingShift) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setShiftDialogOpen(false);
      toast.success(editingShift ? "Shift updated" : "Shift created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const shiftDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Shift deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedShiftId || !selectedProfileId || !assignStartDate) throw new Error("Fill required fields");
      const { error } = await supabase.from("shift_assignments").insert({
        shift_id: selectedShiftId,
        profile_id: selectedProfileId,
        start_date: assignStartDate,
        end_date: assignEndDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setAssignDialogOpen(false);
      setSelectedShiftId("");
      setSelectedProfileId("");
      setAssignStartDate("");
      setAssignEndDate("");
      toast.success("Shift assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getAssignmentsForDay = (day: Date, shiftId: string) => {
    return assignments.filter((a: any) => {
      if (a.shift_id !== shiftId) return false;
      const start = new Date(a.start_date);
      const end = a.end_date ? new Date(a.end_date) : null;
      return day >= start && (!end || day <= end);
    });
  };

  const getNightGuardRotation = (day: Date) => {
    if (nightGuardStaff.length === 0) return [];
    const dayOfYear = Math.floor((day.getTime() - new Date(day.getFullYear(), 0, 0).getTime()) / 86400000);
    const perNight = Math.max(1, Math.ceil(nightGuardStaff.length / 7));
    const startIdx = (dayOfYear * perNight) % nightGuardStaff.length;
    const assigned = [];
    for (let i = 0; i < perNight; i++) {
      assigned.push(nightGuardStaff[(startIdx + i) % nightGuardStaff.length]);
    }
    return assigned;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-secondary">Shifts & Scheduling</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateShift} className="gap-1">
              <Plus className="h-4 w-4" /> New Shift
            </Button>
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus className="h-4 w-4" /> Assign Shift</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Shift</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Shift</Label>
                    <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                      <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                      <SelectContent>
                        {shifts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name} ({s.pattern})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Staff Member</Label>
                    <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                      <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.staff_id} — {p.last_name}, {p.first_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start Date</Label>
                      <Input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>End Date (optional)</Label>
                      <Input type="date" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} min={assignStartDate} />
                    </div>
                  </div>
                  <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} className="w-full">
                    {assignMutation.isPending ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Shift overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {shifts.map((s) => (
          <Card key={s.id} className="border-border/50 relative group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{s.name}</span>
                </div>
                {isAdmin && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditShift(s)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This will remove the shift and all its assignments.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => shiftDeleteMutation.mutate(s.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              <Badge variant="outline" className="text-xs">{s.pattern}</Badge>
              {s.start_time && s.end_time && (
                <p className="text-xs text-muted-foreground mt-1">{s.start_time} – {s.end_time}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1"><Calendar className="h-4 w-4" /> Calendar</TabsTrigger>
          <TabsTrigger value="nightguard" className="gap-1"><Shield className="h-4 w-4" /> Night Guard</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              {format(weekStart, "dd MMM")} – {format(addDays(weekStart, 6), "dd MMM yyyy")}
            </span>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Shift</TableHead>
                  {weekDays.map((d) => (
                    <TableHead key={d.toISOString()} className={`text-center text-xs min-w-[90px] ${isSameDay(d, new Date()) ? "bg-primary/10" : ""}`}>
                      <div>{format(d, "EEE")}</div>
                      <div className="text-muted-foreground">{format(d, "dd")}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-xs">{s.name}</TableCell>
                    {weekDays.map((d) => {
                      const dayAssignments = getAssignmentsForDay(d, s.id);
                      return (
                        <TableCell key={d.toISOString()} className={`text-center p-1 ${isSameDay(d, new Date()) ? "bg-primary/5" : ""}`}>
                          {dayAssignments.length > 0 ? (
                            <div className="space-y-0.5">
                              {dayAssignments.slice(0, 3).map((a: any) => (
                                <div key={a.id} className="text-[10px] bg-accent rounded px-1 py-0.5 truncate">
                                  {a.profiles?.last_name}
                                </div>
                              ))}
                              {dayAssignments.length > 3 && (
                                <div className="text-[10px] text-muted-foreground">+{dayAssignments.length - 3}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="nightguard" className="space-y-3">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-secondary text-base">
                <Shield className="h-5 w-5 text-primary" />
                Night Guard Duty Rotation — Week of {format(weekStart, "dd MMM yyyy")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {nightGuardStaff.length} staff in Night Guard Duty dept — auto-rotated nightly
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {nightGuardStaff.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">
                  No staff assigned to Night Guard Duty department
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                  {weekDays.map((d) => {
                    const rotation = getNightGuardRotation(d);
                    const isToday = isSameDay(d, new Date());
                    return (
                      <Card key={d.toISOString()} className={isToday ? "border-primary" : ""}>
                        <CardContent className="p-3">
                          <div className={`text-xs font-semibold mb-2 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                            {format(d, "EEE dd")}
                          </div>
                          <div className="space-y-1">
                            {rotation.map((p: any) => (
                              <div key={p.id} className="flex items-center gap-1">
                                <Users className="h-3 w-3 text-primary" />
                                <span className="text-[11px] truncate">{p.last_name}, {p.first_name?.charAt(0)}.</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shift Create/Edit Dialog */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Create Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Shift Name</Label>
              <Input value={shiftName} onChange={(e) => setShiftName(e.target.value)} placeholder="e.g. Shift A" />
            </div>
            <div>
              <Label>Pattern</Label>
              <Select value={shiftPattern} onValueChange={(v) => setShiftPattern(v as ShiftPattern)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8h">8 Hours</SelectItem>
                  <SelectItem value="12h">12 Hours</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={shiftEndTime} onChange={(e) => setShiftEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={shiftDescription} onChange={(e) => setShiftDescription(e.target.value)} placeholder="Optional description" rows={2} />
            </div>
            <Button onClick={() => shiftSaveMutation.mutate()} disabled={shiftSaveMutation.isPending || !shiftName.trim()} className="w-full">
              {shiftSaveMutation.isPending ? "Saving..." : editingShift ? "Update Shift" : "Create Shift"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
