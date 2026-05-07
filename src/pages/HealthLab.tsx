import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Activity, FileHeart, Stethoscope, CalendarClock, Pill, FilePlus2, Package, ClipboardList, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  scheduled: "bg-sky-100 text-sky-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-slate-200 text-slate-800",
  no_show: "bg-rose-100 text-rose-900",
};

export default function HealthLab() {
  const { isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  // Records
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState({ staff_profile_id: "", chief_complaint: "", diagnosis: "", treatment: "", notes: "" });

  // Excuse duty review
  const [excuseDecision, setExcuseDecision] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [excuseComment, setExcuseComment] = useState("");

  if (!isAdminOrSupervisor) {
    return <div className="p-6 text-sm text-muted-foreground">Access restricted to System Administrator and Command Tier.</div>;
  }

  const { data: profiles = [] } = useQuery({
    queryKey: ["health-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, staff_id").eq("status", "active").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["medical-records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medical_records" as any).select("*").order("visit_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["health-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("health_reports" as any).select("*").order("report_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["medical-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medical_appointments" as any).select("*").order("scheduled_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["healthcare-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("healthcare_services" as any).select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["medical-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("medical_inventory" as any).select("*").order("item_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: excuseForms = [] } = useQuery({
    queryKey: ["excuse-duty-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("excuse_duty_forms" as any).select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    (profiles as any[]).forEach((p) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r: any) => {
      const p = profileMap[r.staff_profile_id];
      const name = p ? `${p.first_name} ${p.last_name} ${p.staff_id}`.toLowerCase() : "";
      return name.includes(q) || (r.diagnosis ?? "").toLowerCase().includes(q);
    });
  }, [records, search, profileMap]);

  const createRecord = useMutation({
    mutationFn: async () => {
      if (!recordForm.staff_profile_id) throw new Error("Select a staff member");
      const { error } = await supabase.from("medical_records" as any).insert({
        staff_profile_id: recordForm.staff_profile_id,
        chief_complaint: recordForm.chief_complaint || null,
        diagnosis: recordForm.diagnosis || null,
        treatment: recordForm.treatment || null,
        notes: recordForm.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-records"] });
      toast.success("Medical record saved");
      setRecordOpen(false);
      setRecordForm({ staff_profile_id: "", chief_complaint: "", diagnosis: "", treatment: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const decideExcuse = useMutation({
    mutationFn: async () => {
      if (!excuseDecision) throw new Error("No selection");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("excuse_duty_forms" as any).update({
        status: excuseDecision.action,
        review_comment: excuseComment || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", excuseDecision.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["excuse-duty-all"] });
      toast.success("Excuse duty form updated");
      setExcuseDecision(null);
      setExcuseComment("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lowStock = (inventory as any[]).filter((i) => (i.quantity ?? 0) <= (i.reorder_threshold ?? 0));
  const pendingExcuse = (excuseForms as any[]).filter((e) => e.status === "pending");

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border border-emerald-700/20 bg-gradient-to-r from-emerald-900 via-emerald-700 to-teal-600 p-5 shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/20">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight">GIS HEALTH LAB</h1>
            <p className="text-xs text-white/80">Medical records, health reports, appointments, healthcare services & inventory</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-emerald-600"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Records</div><div className="text-2xl font-bold text-emerald-700">{records.length}</div></CardContent></Card>
        <Card className="border-l-4 border-l-sky-600"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Appointments</div><div className="text-2xl font-bold text-sky-700">{appointments.length}</div></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending Excuse Duty</div><div className="text-2xl font-bold text-amber-600">{pendingExcuse.length}</div></CardContent></Card>
        <Card className="border-l-4 border-l-purple-600"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Reports</div><div className="text-2xl font-bold text-purple-700">{reports.length}</div></CardContent></Card>
        <Card className="border-l-4 border-l-rose-600"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Low-stock items</div><div className="text-2xl font-bold text-rose-700">{lowStock.length}</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto bg-muted/60 p-1">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5"><FileHeart className="h-4 w-4" /> Records</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Reports</TabsTrigger>
          <TabsTrigger value="appointments" className="gap-1.5"><CalendarClock className="h-4 w-4" /> Appointments</TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5"><Stethoscope className="h-4 w-4" /> Services</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5"><Pill className="h-4 w-4" /> Inventory</TabsTrigger>
          <TabsTrigger value="excuse" className="gap-1.5"><FilePlus2 className="h-4 w-4" /> Excuse Duty</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>Latest record: {records[0] ? format(new Date(records[0].visit_date), "dd MMM yyyy") : "—"}</div>
              <div>Latest report: {reports[0] ? reports[0].title : "—"}</div>
              <div>Pending excuse duty: <strong>{pendingExcuse.length}</strong></div>
              <div>Low stock items: <strong>{lowStock.length}</strong></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search staff or diagnosis…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><FilePlus2 className="h-4 w-4" /> New Record</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Medical Record</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Staff *</Label>
                    <StaffCombobox
                      staff={(profiles as any[]).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, staff_id: p.staff_id ?? "—" }))}
                      value={recordForm.staff_profile_id}
                      onValueChange={(v) => setRecordForm({ ...recordForm, staff_profile_id: v })}
                      placeholder="Search staff…"
                    />
                  </div>
                  <div><Label>Chief complaint</Label><Textarea rows={2} value={recordForm.chief_complaint} onChange={(e) => setRecordForm({ ...recordForm, chief_complaint: e.target.value })} /></div>
                  <div><Label>Diagnosis</Label><Input value={recordForm.diagnosis} onChange={(e) => setRecordForm({ ...recordForm, diagnosis: e.target.value })} /></div>
                  <div><Label>Treatment</Label><Textarea rows={2} value={recordForm.treatment} onChange={(e) => setRecordForm({ ...recordForm, treatment: e.target.value })} /></div>
                  <div><Label>Notes</Label><Textarea rows={2} value={recordForm.notes} onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button>
                  <Button onClick={() => createRecord.mutate()} disabled={createRecord.isPending}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead>Diagnosis</TableHead><TableHead>Treatment</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No records.</TableCell></TableRow>}
                    {filteredRecords.map((r: any) => {
                      const p = profileMap[r.staff_profile_id];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{format(new Date(r.visit_date), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs font-medium">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                          <TableCell className="text-xs">{r.diagnosis ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.treatment ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Summary</TableHead></TableRow></TableHeader>
                <TableBody>
                  {reports.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No reports.</TableCell></TableRow>}
                  {reports.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{format(new Date(r.report_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-xs font-medium">{r.title}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{r.category}</Badge></TableCell>
                      <TableCell className="text-xs">{r.summary ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {appointments.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No appointments.</TableCell></TableRow>}
                  {appointments.map((a: any) => {
                    const p = profileMap[a.staff_profile_id];
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{format(new Date(a.scheduled_at), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell className="text-xs">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                        <TableCell><Badge className={STATUS_COLOR[a.status] ?? ""}>{a.status}</Badge></TableCell>
                        <TableCell className="text-xs">{a.notes ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Fee</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
                <TableBody>
                  {services.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No services configured.</TableCell></TableRow>}
                  {services.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs">{s.category ?? "—"}</TableCell>
                      <TableCell className="text-xs text-right">{Number(s.fee ?? 0).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Yes" : "No"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
                <TableBody>
                  {inventory.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No inventory.</TableCell></TableRow>}
                  {inventory.map((i: any) => {
                    const low = (i.quantity ?? 0) <= (i.reorder_threshold ?? 0);
                    return (
                      <TableRow key={i.id} className={low ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}>
                        <TableCell className="text-xs font-medium">{i.item_name}</TableCell>
                        <TableCell className="text-xs">{i.category ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right">{i.quantity} {i.unit ?? ""}</TableCell>
                        <TableCell className="text-xs">{i.expiry_date ? format(new Date(i.expiry_date), "dd MMM yyyy") : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excuse">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Submitted</TableHead><TableHead>Staff</TableHead><TableHead>Period</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {excuseForms.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No submissions.</TableCell></TableRow>}
                  {excuseForms.map((e: any) => {
                    const p = profileMap[e.staff_profile_id];
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{format(new Date(e.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs font-medium">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(e.start_date), "dd MMM")} – {format(new Date(e.end_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate" title={e.reason}>{e.reason}</TableCell>
                        <TableCell><Badge className={STATUS_COLOR[e.status] ?? ""}>{e.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {e.status === "pending" && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setExcuseDecision({ id: e.id, action: "approved" }); setExcuseComment(""); }}>Approve</Button>
                              <Button size="sm" variant="destructive" className="h-7" onClick={() => { setExcuseDecision({ id: e.id, action: "rejected" }); setExcuseComment(""); }}>Reject</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!excuseDecision} onOpenChange={(o) => { if (!o) { setExcuseDecision(null); setExcuseComment(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{excuseDecision?.action === "approved" ? "Approve" : "Reject"} excuse duty</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Textarea rows={3} value={excuseComment} onChange={(e) => setExcuseComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcuseDecision(null)}>Cancel</Button>
            <Button variant={excuseDecision?.action === "rejected" ? "destructive" : "default"} onClick={() => decideExcuse.mutate()} disabled={decideExcuse.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
