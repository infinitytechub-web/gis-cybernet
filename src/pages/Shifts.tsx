import { useState } from "react";
import { createNotification, getUserIdFromProfileId } from "@/lib/notifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Plus, Calendar, Shield, Pencil, Trash2 } from "lucide-react";
import { startOfWeek } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import ShiftCalendarTab from "@/components/shifts/ShiftCalendarTab";
import NightGuardTab from "@/components/shifts/NightGuardTab";

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

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [shiftName, setShiftName] = useState("");
  const [shiftPattern, setShiftPattern] = useState<ShiftPattern>("8h");
  const [shiftStartTime, setShiftStartTime] = useState("");
  const [shiftEndTime, setShiftEndTime] = useState("");
  const [shiftDescription, setShiftDescription] = useState("");

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
      const { format: fmt } = await import("date-fns");
      const from = fmt(weekStart, "yyyy-MM-dd");
      const to = fmt(new Date(weekStart.getTime() + 6 * 86400000), "yyyy-MM-dd");
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
        .select("id, first_name, last_name, staff_id, shift_group, department_id, phone, email, departments(name)")
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

  const openCreateShift = () => {
    setEditingShift(null); setShiftName(""); setShiftPattern("8h");
    setShiftStartTime(""); setShiftEndTime(""); setShiftDescription("");
    setShiftDialogOpen(true);
  };

  const openEditShift = (s: any) => {
    setEditingShift(s); setShiftName(s.name); setShiftPattern(s.pattern);
    setShiftStartTime(s.start_time || ""); setShiftEndTime(s.end_time || "");
    setShiftDescription(s.description || ""); setShiftDialogOpen(true);
  };

  const shiftSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shiftName.trim()) throw new Error("Shift name is required");
      const payload = { name: shiftName.trim(), pattern: shiftPattern, start_time: shiftStartTime || null, end_time: shiftEndTime || null, description: shiftDescription || null };
      if (editingShift) {
        const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shifts"] }); setShiftDialogOpen(false); toast.success(editingShift ? "Shift updated" : "Shift created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const shiftDeleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("shifts").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shifts"] }); toast.success("Shift deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedShiftId || !selectedProfileId || !assignStartDate) throw new Error("Fill required fields");
      const { error } = await supabase.from("shift_assignments").insert({ shift_id: selectedShiftId, profile_id: selectedProfileId, start_date: assignStartDate, end_date: assignEndDate || null });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      if (selectedProfileId) {
        const shift = shifts.find((s: any) => s.id === selectedShiftId);
        const userId = await getUserIdFromProfileId(selectedProfileId);
        if (userId) await createNotification({ userId, title: "New Shift Assignment", message: `You have been assigned to ${shift?.name ?? "a shift"} starting ${assignStartDate}.`, type: "shift" });
      }
      setAssignDialogOpen(false); setSelectedShiftId(""); setSelectedProfileId(""); setAssignStartDate(""); setAssignEndDate("");
      toast.success("Shift assigned");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-secondary">Shifts & Scheduling</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openCreateShift} className="gap-1"><Plus className="h-4 w-4" /> New Shift</Button>
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild><Button className="gap-1"><Plus className="h-4 w-4" /> Assign Shift</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Shift</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Shift</Label><Select value={selectedShiftId} onValueChange={setSelectedShiftId}><SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger><SelectContent>{shifts.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} ({s.pattern})</SelectItem>))}</SelectContent></Select></div>
                  <div><Label>Staff Member</Label><Select value={selectedProfileId} onValueChange={setSelectedProfileId}><SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger><SelectContent>{profiles.map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.staff_id} — {p.last_name}, {p.first_name}</SelectItem>))}</SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start Date</Label><Input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} /></div>
                    <div><Label>End Date (optional)</Label><Input type="date" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} min={assignStartDate} /></div>
                  </div>
                  <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending} className="w-full">{assignMutation.isPending ? "Assigning..." : "Assign"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {shifts.map((s, idx) => {
          const colors = [
            { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-300 dark:border-blue-700", icon: "text-blue-600 dark:text-blue-400", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
            { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-300 dark:border-emerald-700", icon: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
            { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-300 dark:border-amber-700", icon: "text-amber-600 dark:text-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
            { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-purple-300 dark:border-purple-700", icon: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
            { bg: "bg-rose-50 dark:bg-rose-950/40", border: "border-rose-300 dark:border-rose-700", icon: "text-rose-600 dark:text-rose-400", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300" },
            { bg: "bg-cyan-50 dark:bg-cyan-950/40", border: "border-cyan-300 dark:border-cyan-700", icon: "text-cyan-600 dark:text-cyan-400", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
            { bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", icon: "text-orange-600 dark:text-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
            { bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-300 dark:border-indigo-700", icon: "text-indigo-600 dark:text-indigo-400", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
          ];
          const c = colors[idx % colors.length];
          return (
            <Card key={s.id} className={`${c.bg} ${c.border} border-2 relative group`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2"><Clock className={`h-4 w-4 ${c.icon}`} /><span className="font-semibold text-sm">{s.name}</span></div>
                  {isAdmin && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditShift(s)}><Pencil className="h-3 w-3" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle><AlertDialogDescription>This will remove the shift and all its assignments.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => shiftDeleteMutation.mutate(s.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
                <Badge className={`text-xs border-0 ${c.badge}`}>{s.pattern}</Badge>
                {s.start_time && s.end_time && <p className="text-xs text-muted-foreground mt-1">{s.start_time} – {s.end_time}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1"><Calendar className="h-4 w-4" /> Calendar</TabsTrigger>
          <TabsTrigger value="nightguard" className="gap-1 relative">
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <Shield className="h-4 w-4" /> Night Guard
          </TabsTrigger>
        </TabsList>
        <TabsContent value="calendar">
          <ShiftCalendarTab shifts={shifts} assignments={assignments} weekStart={weekStart} setWeekStart={setWeekStart} />
        </TabsContent>
        <TabsContent value="nightguard">
          <NightGuardTab nightGuardStaff={nightGuardStaff} allStaff={profiles} shifts={shifts} weekStart={weekStart} setWeekStart={setWeekStart} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingShift ? "Edit Shift" : "Create Shift"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Shift Name</Label><Input value={shiftName} onChange={(e) => setShiftName(e.target.value)} placeholder="e.g. Shift A" /></div>
            <div><Label>Pattern</Label><Select value={shiftPattern} onValueChange={(v) => setShiftPattern(v as ShiftPattern)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="8h">8 Hours</SelectItem><SelectItem value="12h">12 Hours</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Time</Label><Input type="time" value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} /></div>
              <div><Label>End Time</Label><Input type="time" value={shiftEndTime} onChange={(e) => setShiftEndTime(e.target.value)} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={shiftDescription} onChange={(e) => setShiftDescription(e.target.value)} placeholder="Optional description" rows={2} /></div>
            <Button onClick={() => shiftSaveMutation.mutate()} disabled={shiftSaveMutation.isPending || !shiftName.trim()} className="w-full">{shiftSaveMutation.isPending ? "Saving..." : editingShift ? "Update Shift" : "Create Shift"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
