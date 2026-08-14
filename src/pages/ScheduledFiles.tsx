import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileUp, Send, Trash2, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ScheduledFiles() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(Date.now() + 60 * 60 * 1000));
  const [scheduledTime, setScheduledTime] = useState(format(new Date(Date.now() + 60 * 60 * 1000), "HH:mm"));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Staff list
  const { data: staff = [] } = useQuery({
    queryKey: ["sched-staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, staff_id, departments(name)")
        .eq("status", "active")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data || []).filter((p: any) => p.user_id);
    },
  });

  // My deliveries
  const { data: deliveries = [], refetch } = useQuery({
    queryKey: ["my-scheduled-deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_file_deliveries")
        .select("*, scheduled_file_recipients(id, recipient_user_id, delivered, delivered_at, error)")
        .order("scheduled_for", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const filteredStaff = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return staff;
    return staff.filter((p: any) => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        p.staff_id?.toLowerCase().includes(q) ||
        p.departments?.name?.toLowerCase().includes(q)
      );
    });
  }, [staff, search]);

  const toggle = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelected(next);
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredStaff.map((p: any) => p.user_id as string);
    const allSelected = visibleIds.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const reset = () => {
    setTitle("");
    setMessage("");
    setFile(null);
    setSelected(new Set());
  };

  const submit = async () => {
    if (!user) return;
    if (!title.trim()) return toast.error("Title is required");
    if (!file) return toast.error("Please attach a file");
    if (selected.size === 0) return toast.error("Select at least one recipient");

    const [hh, mm] = scheduledTime.split(":").map(Number);
    const when = new Date(scheduledDate);
    when.setHours(hh || 0, mm || 0, 0, 0);
    if (when.getTime() < Date.now() - 60_000) return toast.error("Scheduled time must be in the future");

    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("scheduled-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: d, error: insErr } = await supabase
        .from("scheduled_file_deliveries")
        .insert({
          sender_id: user.id,
          title: title.trim(),
          message: message.trim() || null,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          scheduled_for: when.toISOString(),
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const rows = Array.from(selected).map((uid) => ({
        delivery_id: d!.id,
        recipient_user_id: uid,
      }));
      const { error: recErr } = await supabase.from("scheduled_file_recipients").insert(rows);
      if (recErr) throw recErr;

      toast.success(`Scheduled for ${format(when, "dd/MM/yyyy HH:mm")} to ${selected.size} recipient(s)`);
      reset();
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelDelivery = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_file_deliveries")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Cancelled");
      refetch();
    }
  };

  const deleteDelivery = async (id: string) => {
    const { error } = await supabase.from("scheduled_file_deliveries").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      refetch();
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      sent: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
      failed: "bg-rose-500/15 text-rose-700 border-rose-500/30",
      cancelled: "bg-muted text-muted-foreground",
    };
    return map[s] || "";
  };

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Scheduled File Delivery</h1>
        <p className="text-sm text-muted-foreground">
          Upload a file, pick recipients, and choose when it should be delivered.
        </p>
      </div>

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">New Delivery</TabsTrigger>
          <TabsTrigger value="manage">My Deliveries ({deliveries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="msg">Message (optional)</Label>
                  <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="file">Attachment *</Label>
                  <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  {file && (
                    <p className="text-xs text-muted-foreground">
                      <FileUp className="inline h-3 w-3 mr-1" />
                      {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(scheduledDate, "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={(d) => d && setScheduledDate(d)}
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="time">Time</Label>
                    <Input
                      id="time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Recipients
                  <Badge variant="outline" className="ml-auto">{selected.size} selected</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, ID, or department"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={toggleAllVisible}>
                    {filteredStaff.every((p: any) => selected.has(p.user_id)) && filteredStaff.length > 0
                      ? "Clear visible"
                      : "Select all"}
                  </Button>
                </div>
                <ScrollArea className="h-[340px] border rounded-md">
                  <div className="divide-y">
                    {filteredStaff.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">No staff match.</p>
                    ) : (
                      filteredStaff.map((p: any) => (
                        <label
                          key={p.user_id}
                          className="flex items-center gap-3 p-2.5 hover:bg-accent cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(p.user_id)}
                            onCheckedChange={() => toggle(p.user_id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {p.last_name}, {p.first_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {p.staff_id} · {p.departments?.name || "—"}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={submitting}>Reset</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Schedule Delivery
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader><CardTitle className="text-sm">My Scheduled Deliveries</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto" style={{ minWidth: "100%" }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No deliveries yet</TableCell></TableRow>
                    ) : (
                      deliveries.map((d: any) => {
                        const recs = d.scheduled_file_recipients || [];
                        const delivered = recs.filter((r: any) => r.delivered).length;
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium text-sm">{d.title}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{d.file_name}</TableCell>
                            <TableCell className="text-xs">{format(new Date(d.scheduled_for), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell className="text-xs">{delivered}/{recs.length}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusBadge(d.status)}>{d.status}</Badge>
                              {d.last_error && (
                                <p className="text-[10px] text-rose-600 mt-0.5 max-w-[200px] truncate" title={d.last_error}>
                                  {d.last_error}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {d.status === "pending" && (
                                <Button size="sm" variant="ghost" onClick={() => cancelDelivery(d.id)}>
                                  Cancel
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => deleteDelivery(d.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
