import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Search, Plus, Download, Users, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];

export function AdminAttendanceLog() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  // Manual log form state
  const [logStaffId, setLogStaffId] = useState("");
  const [logCheckIn, setLogCheckIn] = useState("");
  const [logCheckOut, setLogCheckOut] = useState("");
  const [logStatus, setLogStatus] = useState<AttendanceStatus>("present");
  const [logNotes, setLogNotes] = useState("");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("*, profiles(first_name, last_name, staff_id, shift_group)")
        .eq("date", selectedDate)
        .order("check_in", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, shift_group")
        .eq("status", "active")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      const dateStr = selectedDate;
      const checkIn = logCheckIn ? `${dateStr}T${logCheckIn}:00` : null;
      const checkOut = logCheckOut ? `${dateStr}T${logCheckOut}:00` : null;
      const { error } = await supabase.from("attendances").insert({
        profile_id: logStaffId,
        date: dateStr,
        check_in: checkIn,
        check_out: checkOut,
        status: logStatus,
        notes: logNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setLogDialogOpen(false);
      setLogStaffId("");
      setLogCheckIn("");
      setLogCheckOut("");
      setLogStatus("present");
      setLogNotes("");
      toast.success("Attendance logged");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = records.filter((r: any) => {
    const name = `${r.profiles?.last_name} ${r.profiles?.first_name} ${r.profiles?.staff_id}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Summary stats
  const total = records.length;
  const present = records.filter((r: any) => r.status === "present").length;
  const late = records.filter((r: any) => r.status === "late").length;
  const absent = records.filter((r: any) => r.status === "absent").length;

  const statusColor = (s: string) => {
    switch (s) {
      case "present": return "bg-emerald-100 text-emerald-800";
      case "late": return "bg-amber-100 text-amber-800";
      case "absent": return "bg-red-100 text-red-800";
      case "excused": return "bg-blue-100 text-blue-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const exportCSV = () => {
    const header = "Staff ID,Name,Shift,Check In,Check Out,Status,Notes\n";
    const rows = filtered.map((r: any) =>
      `${r.profiles?.staff_id},"${r.profiles?.last_name} ${r.profiles?.first_name}",${r.profiles?.shift_group ?? ""},${r.check_in ? format(new Date(r.check_in), "HH:mm") : ""},${r.check_out ? format(new Date(r.check_out), "HH:mm") : ""},${r.status},"${r.notes ?? ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">Total Logged</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <div className="text-2xl font-bold">{present}</div>
              <div className="text-xs text-muted-foreground">Present</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            <div>
              <div className="text-2xl font-bold">{late}</div>
              <div className="text-xs text-muted-foreground">Late</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold">{absent}</div>
              <div className="text-xs text-muted-foreground">Absent</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-auto"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="excused">Excused</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1">
              <Plus className="h-4 w-4" /> Log
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Attendance Manually</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Staff Member</Label>
                <Select value={logStaffId} onValueChange={setLogStaffId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.staff_id} — {p.last_name}, {p.first_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Check In</Label>
                  <Input type="time" value={logCheckIn} onChange={(e) => setLogCheckIn(e.target.value)} />
                </div>
                <div>
                  <Label>Check Out</Label>
                  <Input type="time" value={logCheckOut} onChange={(e) => setLogCheckOut(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={logStatus} onValueChange={(v) => setLogStatus(v as AttendanceStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="excused">Excused</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} />
              </div>
              <Button onClick={() => logMutation.mutate()} disabled={!logStaffId || logMutation.isPending} className="w-full">
                {logMutation.isPending ? "Saving..." : "Save Attendance"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="outline" onClick={exportCSV} className="gap-1">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Shift</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No attendance records for {format(new Date(selectedDate + "T00:00"), "PPP")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.profiles?.staff_id}</TableCell>
                    <TableCell className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{r.profiles?.shift_group ?? "—"}</TableCell>
                    <TableCell>{r.check_in ? format(new Date(r.check_in), "HH:mm") : "—"}</TableCell>
                    <TableCell>{r.check_out ? format(new Date(r.check_out), "HH:mm") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate text-xs text-muted-foreground">
                      {r.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
