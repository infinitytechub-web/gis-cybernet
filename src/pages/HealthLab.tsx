import { useState, useMemo, useEffect } from "react";
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
import { Activity, FileHeart, Stethoscope, CalendarClock, Pill, FilePlus2, ClipboardList, Search, AlertTriangle, Plus, Pencil, FileDown, History, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import {
  exportMedicalRecordPDF, exportMedicalRecordDOCX,
  exportHealthReportPDF, exportHealthReportDOCX,
  exportRecordsCSV, exportRecordsPDF, exportReportsCSV, exportReportsPDF,
} from "@/lib/health-lab-export";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
  scheduled: "bg-sky-100 text-sky-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-slate-200 text-slate-800",
  no_show: "bg-rose-100 text-rose-900",
};

const APPT_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;

export default function HealthLab() {
  const { isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  // Advanced filters (records & reports)
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [recordsPage, setRecordsPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const PAGE_SIZE = 20;

  // Audit log dialog
  const [auditOpen, setAuditOpen] = useState(false);

  // Records
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState({ staff_profile_id: "", chief_complaint: "", diagnosis: "", treatment: "", notes: "" });

  // Excuse duty review
  const [excuseDecision, setExcuseDecision] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [excuseComment, setExcuseComment] = useState("");

  // Inventory
  const [invOpen, setInvOpen] = useState(false);
  const [invEdit, setInvEdit] = useState<any | null>(null);
  const [invForm, setInvForm] = useState({ item_name: "", category: "", quantity: 0, unit: "", reorder_threshold: 0, expiry_date: "", notes: "" });
  const [adjustTarget, setAdjustTarget] = useState<any | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustNote, setAdjustNote] = useState("");

  // Appointments
  const [apptOpen, setApptOpen] = useState(false);
  const [apptEdit, setApptEdit] = useState<any | null>(null);
  const [apptConflict, setApptConflict] = useState<string | null>(null);
  const [overrideBy, setOverrideBy] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [apptForm, setApptForm] = useState({
    staff_profile_id: "",
    service_id: "",
    scheduled_at: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
    status: "scheduled",
    notes: "",
    authorized_by: "",
    authorized_role: "",
  });

  if (!isAdminOrSupervisor) {
    return <div className="p-6 text-sm text-muted-foreground">Access restricted to System Administrator and Command Tier.</div>;
  }

  // Realtime sync across all dashboards
  useEffect(() => {
    const ch = supabase.channel("health-lab-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_records" }, () => qc.invalidateQueries({ queryKey: ["medical-records"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "health_reports" }, () => qc.invalidateQueries({ queryKey: ["health-reports"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_appointments" }, () => qc.invalidateQueries({ queryKey: ["medical-appointments"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_inventory" }, () => qc.invalidateQueries({ queryKey: ["medical-inventory"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "excuse_duty_forms" }, () => qc.invalidateQueries({ queryKey: ["excuse-duty-all"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

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
      const { data, error } = await supabase.from("medical_appointments" as any).select("*").order("scheduled_at", { ascending: false }).limit(200);
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
  const serviceMap = useMemo(() => {
    const m: Record<string, any> = {};
    (services as any[]).forEach((s) => { m[s.id] = s; });
    return m;
  }, [services]);

  // Authorizers: command tier + all shift supervisors
  const { data: authorizers = [] } = useQuery({
    queryKey: ["health-authorizers"],
    queryFn: async () => {
      const ROLES = ["admin","oic","2ic","staff_officer","supervisor","head_of_administration","shift_supervisor","deputy_shift_supervisor"];
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("user_id, role, profiles!inner(id, first_name, last_name, staff_id, user_id)")
        .in("role", ROLES);
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id, role: r.role,
        profile: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
      })).filter((r: any) => r.profile && !seen.has(r.profile.id) && seen.add(r.profile.id));
    },
  });

  // Inventory audit log
  const { data: auditLog = [] } = useQuery({
    queryKey: ["medical-inventory-audit"],
    enabled: auditOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from("medical_inventory_audit" as any)
        .select("*").order("performed_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  const filteredRecords = useMemo(() => {
    let list = records as any[];
    if (filterFrom) list = list.filter((r) => r.visit_date >= filterFrom);
    if (filterTo) list = list.filter((r) => r.visit_date <= filterTo);
    if (filterStaff) list = list.filter((r) => r.staff_profile_id === filterStaff);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) => {
        const p = profileMap[r.staff_profile_id];
        const name = p ? `${p.first_name} ${p.last_name} ${p.staff_id}`.toLowerCase() : "";
        return name.includes(q) || (r.diagnosis ?? "").toLowerCase().includes(q) || (r.chief_complaint ?? "").toLowerCase().includes(q);
      });
    }
    return list;
  }, [records, search, filterFrom, filterTo, filterStaff, profileMap]);

  const filteredReports = useMemo(() => {
    let list = reports as any[];
    if (filterFrom) list = list.filter((r) => r.report_date >= filterFrom);
    if (filterTo) list = list.filter((r) => r.report_date <= filterTo);
    if (filterService) list = list.filter((r) => (r.category ?? "") === filterService);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [reports, search, filterFrom, filterTo, filterService]);

  const pagedRecords = useMemo(() => filteredRecords.slice((recordsPage - 1) * PAGE_SIZE, recordsPage * PAGE_SIZE), [filteredRecords, recordsPage]);
  const pagedReports = useMemo(() => filteredReports.slice((reportsPage - 1) * PAGE_SIZE, reportsPage * PAGE_SIZE), [filteredReports, reportsPage]);
  const recordsPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const reportsPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));

  const today = new Date();
  const inventoryAlerts = useMemo(() => {
    const lowStock: any[] = [];
    const expSoon: any[] = [];
    const expired: any[] = [];
    (inventory as any[]).forEach((i) => {
      if ((i.quantity ?? 0) <= (i.reorder_threshold ?? 0)) lowStock.push(i);
      if (i.expiry_date) {
        const d = new Date(i.expiry_date);
        const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
        if (days < 0) expired.push(i);
        else if (days <= 30) expSoon.push(i);
      }
    });
    return { lowStock, expSoon, expired };
  }, [inventory]);

  // ── Mutations ────────────────────────────────────────────────────────────
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
      const { error } = await supabase.from("excuse_duty_forms" as any).update({
        status: excuseDecision.action,
        review_comment: excuseComment || null,
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

  const saveInventory = useMutation({
    mutationFn: async () => {
      if (!invForm.item_name.trim()) throw new Error("Item name is required");
      const payload: any = {
        item_name: invForm.item_name.trim(),
        category: invForm.category || null,
        quantity: Number(invForm.quantity) || 0,
        unit: invForm.unit || null,
        reorder_threshold: Number(invForm.reorder_threshold) || 0,
        expiry_date: invForm.expiry_date || null,
        notes: invForm.notes || null,
      };
      if (invEdit) {
        const { error } = await supabase.from("medical_inventory" as any).update(payload).eq("id", invEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("medical_inventory" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-inventory"] });
      toast.success(invEdit ? "Item updated" : "Item created");
      setInvOpen(false); setInvEdit(null);
      setInvForm({ item_name: "", category: "", quantity: 0, unit: "", reorder_threshold: 0, expiry_date: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustInventory = useMutation({
    mutationFn: async () => {
      if (!adjustTarget) throw new Error("No item");
      const newQty = Math.max(0, (adjustTarget.quantity ?? 0) + Number(adjustDelta));
      const note = adjustNote
        ? `${adjustTarget.notes ? adjustTarget.notes + "\n" : ""}[${format(new Date(), "yyyy-MM-dd HH:mm")}] adj ${adjustDelta > 0 ? "+" : ""}${adjustDelta}: ${adjustNote}`
        : adjustTarget.notes;
      const { error } = await supabase.from("medical_inventory" as any).update({ quantity: newQty, notes: note }).eq("id", adjustTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-inventory"] });
      toast.success("Stock adjusted");
      setAdjustTarget(null); setAdjustDelta(0); setAdjustNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteInventory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("medical_inventory" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["medical-inventory"] }); toast.success("Item removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAppointment = useMutation({
    mutationFn: async () => {
      if (!apptForm.staff_profile_id) throw new Error("Select a staff member");
      if (!apptForm.scheduled_at) throw new Error("Pick a date/time");
      // Client-side conflict pre-check
      const iso = new Date(apptForm.scheduled_at).toISOString();
      const conflict = (appointments as any[]).find((a) =>
        a.staff_profile_id === apptForm.staff_profile_id &&
        new Date(a.scheduled_at).toISOString() === iso &&
        !["cancelled","no_show"].includes(a.status) &&
        a.id !== apptEdit?.id);
      if (conflict) {
        setApptConflict(`This staff member already has an appointment at ${format(new Date(conflict.scheduled_at), "dd MMM yyyy HH:mm")} (${conflict.status}). Pick a different time or cancel the existing one.`);
        throw new Error("APPOINTMENT_CONFLICT");
      }
      const payload: any = {
        staff_profile_id: apptForm.staff_profile_id,
        service_id: apptForm.service_id || null,
        scheduled_at: iso,
        status: apptForm.status,
        notes: apptForm.notes || null,
        authorized_by: apptForm.authorized_by || null,
        authorized_role: apptForm.authorized_role || null,
      };
      if (apptEdit) {
        const { error } = await supabase.from("medical_appointments" as any).update(payload).eq("id", apptEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("medical_appointments" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical-appointments"] });
      toast.success(apptEdit ? "Appointment updated" : "Appointment scheduled");
      setApptOpen(false); setApptEdit(null); setApptConflict(null);
      setApptForm({ staff_profile_id: "", service_id: "", scheduled_at: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"), status: "scheduled", notes: "", authorized_by: "", authorized_role: "" });
    },
    onError: (e: any) => {
      if (e.message?.includes("APPOINTMENT_CONFLICT")) return;
      if (typeof e.message === "string" && e.message.includes("APPOINTMENT_CONFLICT")) {
        setApptConflict("This staff member already has an appointment at that time. Please pick a different slot.");
        return;
      }
      toast.error(e.message);
    },
  });

  const updateApptStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("medical_appointments" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["medical-appointments"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const pendingExcuse = (excuseForms as any[]).filter((e) => e.status === "pending");

  const openInvCreate = () => {
    setInvEdit(null);
    setInvForm({ item_name: "", category: "", quantity: 0, unit: "", reorder_threshold: 0, expiry_date: "", notes: "" });
    setInvOpen(true);
  };
  const openInvEdit = (i: any) => {
    setInvEdit(i);
    setInvForm({
      item_name: i.item_name ?? "", category: i.category ?? "",
      quantity: i.quantity ?? 0, unit: i.unit ?? "",
      reorder_threshold: i.reorder_threshold ?? 0,
      expiry_date: i.expiry_date ?? "", notes: i.notes ?? "",
    });
    setInvOpen(true);
  };

  const openApptCreate = () => {
    setApptEdit(null); setApptConflict(null);
    setApptForm({ staff_profile_id: "", service_id: "", scheduled_at: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm"), status: "scheduled", notes: "", authorized_by: "", authorized_role: "" });
    setApptOpen(true);
  };
  const openApptEdit = (a: any) => {
    setApptEdit(a); setApptConflict(null);
    setApptForm({
      staff_profile_id: a.staff_profile_id,
      service_id: a.service_id ?? "",
      scheduled_at: format(new Date(a.scheduled_at), "yyyy-MM-dd'T'HH:mm"),
      status: a.status,
      notes: a.notes ?? "",
      authorized_by: a.authorized_by ?? "",
      authorized_role: a.authorized_role ?? "",
    });
    setApptOpen(true);
  };

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
        <Card className="border-l-4 border-l-rose-600"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Low / Expired</div><div className="text-2xl font-bold text-rose-700">{inventoryAlerts.lowStock.length + inventoryAlerts.expired.length}</div></CardContent></Card>
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
            <CardContent className="space-y-2 text-xs">
              <div>Latest record: {records[0] ? format(new Date(records[0].visit_date), "dd MMM yyyy") : "—"}</div>
              <div>Latest report: {reports[0] ? reports[0].title : "—"}</div>
              <div>Pending excuse duty: <strong>{pendingExcuse.length}</strong></div>
              <div>Low-stock items: <strong className="text-rose-700">{inventoryAlerts.lowStock.length}</strong> · Expiring ≤30d: <strong className="text-amber-700">{inventoryAlerts.expSoon.length}</strong> · Expired: <strong className="text-destructive">{inventoryAlerts.expired.length}</strong></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECORDS */}
        <TabsContent value="records" className="space-y-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search staff, diagnosis, complaint…" value={search} onChange={(e) => { setSearch(e.target.value); setRecordsPage(1); }} />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-8 w-[140px]" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setRecordsPage(1); }} />
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-8 w-[140px]" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setRecordsPage(1); }} />
              </div>
              <div className="w-[220px]">
                <StaffCombobox
                  staff={(profiles as any[]).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, staff_id: p.staff_id ?? "—" }))}
                  value={filterStaff}
                  onValueChange={(v) => { setFilterStaff(v); setRecordsPage(1); }}
                  placeholder="Filter staff…"
                />
              </div>
              {(filterFrom || filterTo || filterStaff || search) && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterStaff(""); setSearch(""); setRecordsPage(1); }}>Clear</Button>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportRecordsPDF(filteredRecords, profileMap, "filtered")}><FileDown className="h-4 w-4" /> PDF (filtered)</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportRecordsCSV(filteredRecords, profileMap, "filtered")}><FileDown className="h-4 w-4" /> CSV (filtered)</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportRecordsPDF(pagedRecords, profileMap, `page${recordsPage}`)}><FileDown className="h-4 w-4" /> PDF (page)</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setAuditOpen(true)}><History className="h-4 w-4" /> Inventory Audit</Button>
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
            </div>
          </Card>
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead>Diagnosis</TableHead><TableHead>Treatment</TableHead><TableHead className="text-right">Export</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRecords.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No records.</TableCell></TableRow>}
                    {pagedRecords.map((r: any) => {
                      const p = profileMap[r.staff_profile_id];
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{format(new Date(r.visit_date), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs font-medium">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                          <TableCell className="text-xs">{r.diagnosis ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.treatment ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => exportMedicalRecordPDF(r, p)}>PDF</Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => exportMedicalRecordDOCX(r, p)}>Word</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {pagedRecords.length} of {filteredRecords.length}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7" disabled={recordsPage <= 1} onClick={() => setRecordsPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span>Page {recordsPage} / {recordsPages}</span>
              <Button size="sm" variant="outline" className="h-7" disabled={recordsPage >= recordsPages} onClick={() => setRecordsPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports" className="space-y-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search title, summary, category…" value={search} onChange={(e) => { setSearch(e.target.value); setReportsPage(1); }} />
              </div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-8 w-[140px]" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setReportsPage(1); }} />
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-8 w-[140px]" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setReportsPage(1); }} />
              <Input className="h-8 w-[160px]" placeholder="Category…" value={filterService} onChange={(e) => { setFilterService(e.target.value); setReportsPage(1); }} />
              {(filterFrom || filterTo || filterService || search) && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterService(""); setSearch(""); setReportsPage(1); }}>Clear</Button>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportReportsPDF(filteredReports, "filtered")}><FileDown className="h-4 w-4" /> PDF (filtered)</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportReportsCSV(filteredReports, "filtered")}><FileDown className="h-4 w-4" /> CSV (filtered)</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportReportsPDF(pagedReports, `page${reportsPage}`)}><FileDown className="h-4 w-4" /> PDF (page)</Button>
              </div>
            </div>
          </Card>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Title</TableHead><TableHead>Category</TableHead><TableHead>Summary</TableHead><TableHead className="text-right">Export</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pagedReports.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No reports.</TableCell></TableRow>}
                  {pagedReports.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{format(new Date(r.report_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-xs font-medium">{r.title}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{r.category}</Badge></TableCell>
                      <TableCell className="text-xs">{r.summary ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => exportHealthReportPDF(r)}><FileDown className="h-3.5 w-3.5" /> PDF</Button>
                          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => exportHealthReportDOCX(r)}><FileDown className="h-3.5 w-3.5" /> Word</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {pagedReports.length} of {filteredReports.length}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7" disabled={reportsPage <= 1} onClick={() => setReportsPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span>Page {reportsPage} / {reportsPages}</span>
              <Button size="sm" variant="outline" className="h-7" disabled={reportsPage >= reportsPages} onClick={() => setReportsPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </TabsContent>

        {/* APPOINTMENTS */}
        <TabsContent value="appointments" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={openApptCreate}><Plus className="h-4 w-4" /> Schedule Appointment</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Staff</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead>Authorized by</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {appointments.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No appointments.</TableCell></TableRow>}
                  {appointments.map((a: any) => {
                    const p = profileMap[a.staff_profile_id];
                    const s = a.service_id ? serviceMap[a.service_id] : null;
                    const auth = (authorizers as any[]).find((u) => u.user_id === a.authorized_by);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{format(new Date(a.scheduled_at), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell className="text-xs">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                        <TableCell className="text-xs">{s?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Select value={a.status} onValueChange={(v) => updateApptStatus.mutate({ id: a.id, status: v })}>
                            <SelectTrigger className="h-7 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {APPT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs">{auth ? `${auth.profile.last_name}, ${auth.profile.first_name}` : "—"}{a.authorized_role && <div className="text-[10px] text-muted-foreground capitalize">{a.authorized_role.replace(/_/g," ")}</div>}</TableCell>
                        <TableCell className="text-xs max-w-[260px] truncate" title={a.notes ?? ""}>{a.notes ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openApptEdit(a)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SERVICES */}
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

        {/* INVENTORY */}
        <TabsContent value="inventory" className="space-y-3">
          {(inventoryAlerts.lowStock.length > 0 || inventoryAlerts.expired.length > 0 || inventoryAlerts.expSoon.length > 0) && (
            <Card className="border-l-4 border-l-rose-600 bg-rose-50/40 dark:bg-rose-950/20">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-rose-800 dark:text-rose-200"><AlertTriangle className="h-4 w-4" /> Stock Alerts</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                {inventoryAlerts.lowStock.length > 0 && <div><strong>{inventoryAlerts.lowStock.length}</strong> at or below reorder threshold</div>}
                {inventoryAlerts.expired.length > 0 && <div className="text-destructive"><strong>{inventoryAlerts.expired.length}</strong> expired</div>}
                {inventoryAlerts.expSoon.length > 0 && <div className="text-amber-700"><strong>{inventoryAlerts.expSoon.length}</strong> expiring within 30 days</div>}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={openInvCreate}><Plus className="h-4 w-4" /> New Item</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead><TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead><TableHead>Unit</TableHead>
                      <TableHead className="text-right">Reorder ≤</TableHead><TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No inventory.</TableCell></TableRow>}
                    {inventory.map((i: any) => {
                      const low = (i.quantity ?? 0) <= (i.reorder_threshold ?? 0);
                      const days = i.expiry_date ? Math.ceil((new Date(i.expiry_date).getTime() - today.getTime()) / 86400000) : null;
                      const expired = days !== null && days < 0;
                      const soon = days !== null && days >= 0 && days <= 30;
                      return (
                        <TableRow key={i.id} className={expired ? "bg-rose-100/60 dark:bg-rose-950/30" : low ? "bg-rose-50/40 dark:bg-rose-950/20" : soon ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                          <TableCell className="text-xs font-medium">{i.item_name}</TableCell>
                          <TableCell className="text-xs">{i.category ?? "—"}</TableCell>
                          <TableCell className="text-xs text-right font-bold">{i.quantity}</TableCell>
                          <TableCell className="text-xs">{i.unit ?? "—"}</TableCell>
                          <TableCell className="text-xs text-right">{i.reorder_threshold ?? 0}</TableCell>
                          <TableCell className="text-xs">{i.expiry_date ? format(new Date(i.expiry_date), "dd MMM yyyy") : "—"}{days !== null && (<div className="text-[10px] text-muted-foreground">{expired ? `expired ${Math.abs(days)}d ago` : `${days}d left`}</div>)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {low && <Badge className="bg-rose-600 hover:bg-rose-700 text-[10px]">LOW</Badge>}
                              {expired && <Badge className="bg-destructive text-[10px]">EXPIRED</Badge>}
                              {soon && !expired && <Badge className="bg-amber-500 text-[10px]">≤30d</Badge>}
                              {!low && !expired && !soon && <Badge variant="outline" className="text-[10px]">OK</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAdjustTarget(i); setAdjustDelta(0); setAdjustNote(""); }}>Adjust</Button>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => openInvEdit(i)}>Edit</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => { if (confirm(`Delete "${i.item_name}"?`)) deleteInventory.mutate(i.id); }}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXCUSE DUTY REVIEW */}
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

      {/* Excuse decision dialog */}
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

      {/* Inventory create/edit dialog */}
      <Dialog open={invOpen} onOpenChange={(o) => { if (!o) { setInvOpen(false); setInvEdit(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{invEdit ? "Edit item" : "New inventory item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Item name *</Label><Input value={invForm.item_name} onChange={(e) => setInvForm({ ...invForm, item_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><Input value={invForm.category} onChange={(e) => setInvForm({ ...invForm, category: e.target.value })} /></div>
              <div><Label>Unit</Label><Input value={invForm.unit} onChange={(e) => setInvForm({ ...invForm, unit: e.target.value })} placeholder="box, ml, tab…" /></div>
              <div><Label>Quantity</Label><Input type="number" value={invForm.quantity} onChange={(e) => setInvForm({ ...invForm, quantity: Number(e.target.value) })} /></div>
              <div><Label>Reorder threshold</Label><Input type="number" value={invForm.reorder_threshold} onChange={(e) => setInvForm({ ...invForm, reorder_threshold: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label>Expiry date</Label><Input type="date" value={invForm.expiry_date} onChange={(e) => setInvForm({ ...invForm, expiry_date: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvOpen(false); setInvEdit(null); }}>Cancel</Button>
            <Button onClick={() => saveInventory.mutate()} disabled={saveInventory.isPending}>{invEdit ? "Save changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory adjust dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust stock — {adjustTarget?.item_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">Current quantity: <strong>{adjustTarget?.quantity}</strong> {adjustTarget?.unit}</div>
            <div>
              <Label>Delta (use negative to subtract) *</Label>
              <Input type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(Number(e.target.value))} />
            </div>
            <div><Label>Note</Label><Textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Reason for adjustment…" /></div>
            <div className="text-xs text-muted-foreground">New quantity will be: <strong>{Math.max(0, (adjustTarget?.quantity ?? 0) + Number(adjustDelta))}</strong></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={() => adjustInventory.mutate()} disabled={adjustInventory.isPending || adjustDelta === 0}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment dialog */}
      <Dialog open={apptOpen} onOpenChange={(o) => { if (!o) { setApptOpen(false); setApptEdit(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{apptEdit ? "Edit appointment" : "Schedule appointment"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff *</Label>
              <StaffCombobox
                staff={(profiles as any[]).map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, staff_id: p.staff_id ?? "—" }))}
                value={apptForm.staff_profile_id}
                onValueChange={(v) => setApptForm({ ...apptForm, staff_profile_id: v })}
                placeholder="Search staff…"
              />
            </div>
            <div>
              <Label>Service type</Label>
              <Select value={apptForm.service_id || "none"} onValueChange={(v) => setApptForm({ ...apptForm, service_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select service…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No service —</SelectItem>
                  {(services as any[]).filter((s) => s.active !== false).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.category ? ` (${s.category})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Scheduled at *</Label>
                <Input type="datetime-local" value={apptForm.scheduled_at} onChange={(e) => setApptForm({ ...apptForm, scheduled_at: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={apptForm.status} onValueChange={(v) => setApptForm({ ...apptForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{APPT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Authorized by *</Label>
              <Select value={apptForm.authorized_by || "none"} onValueChange={(v) => {
                if (v === "none") { setApptForm({ ...apptForm, authorized_by: "", authorized_role: "" }); return; }
                const u = (authorizers as any[]).find((x) => x.user_id === v);
                setApptForm({ ...apptForm, authorized_by: v, authorized_role: u?.role ?? "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Select authorizer…" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="none">— None —</SelectItem>
                  {(authorizers as any[]).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.profile.last_name}, {u.profile.first_name} <span className="text-muted-foreground ml-1 text-[10px] capitalize">({u.role.replace(/_/g," ")})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Command tier &amp; all shift supervisors</p>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} /></div>
            {apptConflict && (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Scheduling conflict</div>
                <div className="mt-0.5">{apptConflict}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApptOpen(false); setApptEdit(null); setApptConflict(null); }}>Cancel</Button>
            <Button onClick={() => { setApptConflict(null); saveAppointment.mutate(); }} disabled={saveAppointment.isPending}>{apptEdit ? "Save changes" : "Schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory audit log */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Inventory Audit Log</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Δ</TableHead><TableHead>Qty</TableHead><TableHead>By</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
              <TableBody>
                {auditLog.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No audit entries.</TableCell></TableRow>}
                {auditLog.map((a: any) => {
                  const actor = (authorizers as any[]).find((u) => u.user_id === a.performed_by);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.performed_at), "dd MMM yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-[10px]">{a.action}</Badge></TableCell>
                      <TableCell className="text-xs">{a.item_name}</TableCell>
                      <TableCell className={`text-xs text-right font-mono ${a.delta && a.delta < 0 ? "text-rose-600" : a.delta && a.delta > 0 ? "text-emerald-600" : ""}`}>{a.delta != null ? (a.delta > 0 ? "+" : "") + a.delta : "—"}</TableCell>
                      <TableCell className="text-xs">{a.quantity_before ?? "—"} → {a.quantity_after ?? "—"}</TableCell>
                      <TableCell className="text-xs">{actor ? `${actor.profile.last_name}, ${actor.profile.first_name}` : (a.performed_by ? a.performed_by.slice(0,8) : "system")}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={a.note ?? ""}>{a.note ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
