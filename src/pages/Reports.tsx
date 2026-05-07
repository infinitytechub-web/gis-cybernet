import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Users, CalendarCheck, CalendarOff, Clock, CheckCircle2, XCircle, FileStack, ShieldAlert, ArrowRightCircle, Gavel, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import ReportPreviewDialog from "@/components/reports/ReportPreviewDialog";
import ReportScheduleManager from "@/components/reports/ReportScheduleManager";
import ReportApprovalsTable from "@/components/reports/ReportApprovalsTable";
import { ExportMenu } from "@/components/ui/export-menu";
import AttendanceComplianceReport from "@/components/reports/AttendanceComplianceReport";
import AttendanceRecipientsPanel from "@/components/reports/AttendanceRecipientsPanel";
import { logAdminAudit } from "@/lib/admin-audit";

type ReportType = "staff" | "attendance" | "leave";
type ReportCategory = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type StatusTab = "pending_ipse" | "with_hoa" | "with_2ic" | "with_oic" | "approved" | "rejected" | "all";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "text/csv", "image/jpeg", "image/jpg"];

export default function Reports() {
  const { isAdmin, isAdminOrSupervisor, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<ReportType>("staff");
  const [startDate, setStartDate] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [uploadOpen, setUploadOpen] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>(() => {
    const t = searchParams.get("tab");
    const valid: StatusTab[] = ["pending_ipse", "with_2ic", "with_oic", "approved", "rejected", "all"];
    return valid.includes(t as StatusTab) ? (t as StatusTab) : "pending_ipse";
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadForm, setUploadForm] = useState({
    title: "", description: "", category: "daily" as ReportCategory, report_date: format(new Date(), "yyyy-MM-dd"),
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Sync tab to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (statusTab === "pending_ipse") next.delete("tab"); else next.set("tab", statusTab);
    setSearchParams(next, { replace: true });
  }, [statusTab]); // eslint-disable-line

  // Check if current user can submit reports (shift_group present or supervisor+)
  const { data: canSubmit = false } = useQuery({
    queryKey: ["can-submit-reports", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (isAdminOrSupervisor) return true;
      const { data } = await supabase.from("profiles").select("shift_group").eq("user_id", user!.id).maybeSingle();
      if (data?.shift_group) return true;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      const allowed = ["shift_supervisor", "deputy_shift_supervisor", "shift_leader", "deputy_shift_leader"];
      return (roles || []).some((r: any) => allowed.includes(r.role));
    },
  });

  // Generated reports source data
  const { data: staff = [] } = useQuery({
    queryKey: ["report-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*, ranks(name, abbreviation), departments(name)").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["report-attendance", startDate, endDate],
    enabled: reportType === "attendance",
    queryFn: async () => {
      const { data, error } = await supabase.from("attendances").select("*, profiles(first_name, last_name, staff_id)")
        .gte("date", startDate).lte("date", endDate).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["report-leave", startDate, endDate],
    enabled: reportType === "leave",
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests").select("*, profiles(first_name, last_name, staff_id)")
        .gte("start_date", startDate).lte("end_date", endDate).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // All visible report uploads (RLS handles scope)
  const { data: uploadedReports = [] } = useQuery({
    queryKey: ["report-uploads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_uploads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredReports = useMemo(() => {
    if (statusTab === "all") return uploadedReports;
    const map: Record<Exclude<StatusTab, "all">, string> = {
      pending_ipse: "pending_ipse",
      with_2ic: "forwarded_to_2ic",
      with_oic: "forwarded_to_oic",
      approved: "approved",
      rejected: "rejected",
    };
    const target = map[statusTab as Exclude<StatusTab, "all">];
    return uploadedReports.filter((r: any) => (r.ipse_status ?? "pending_ipse") === target);
  }, [uploadedReports, statusTab]);

  const counts = useMemo(() => {
    const c = { pending_ipse: 0, with_2ic: 0, with_oic: 0, approved: 0, rejected: 0, all: uploadedReports.length };
    uploadedReports.forEach((r: any) => {
      const s = r.ipse_status ?? "pending_ipse";
      if (s === "pending_ipse") c.pending_ipse++;
      else if (s === "forwarded_to_2ic") c.with_2ic++;
      else if (s === "forwarded_to_oic") c.with_oic++;
      else if (s === "approved") c.approved++;
      else if (s === "rejected") c.rejected++;
    });
    return c;
  }, [uploadedReports]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");
      if (uploadFile.size > MAX_FILE_SIZE) throw new Error("File must be less than 2MB");
      if (!ALLOWED_TYPES.includes(uploadFile.type)) throw new Error("Only PDF, CSV, and JPEG files are allowed");

      const filePath = `${Date.now()}_${uploadFile.name}`;
      const { error: uploadError } = await supabase.storage.from("reports").upload(filePath, uploadFile);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("report_uploads").insert({
        title: uploadForm.title,
        description: uploadForm.description || null,
        category: uploadForm.category,
        file_path: filePath,
        file_name: uploadFile.name,
        file_type: uploadFile.type,
        file_size: uploadFile.size,
        uploaded_by: user!.id,
        submitted_by: user!.id,
        report_date: uploadForm.report_date,
        source: "manual",
        approval_status: "pending",
        ipse_status: "pending_ipse",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report submitted — IPSE will triage and forward");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadForm({ title: "", description: "", category: "daily", report_date: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePreview = async (report: any) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewType(report.file_type);
      setPreviewName(report.file_name);
    }
  };

  const getReportData = (): { headers: string[]; rows: string[][]; title: string } => {
    const dateRange = `${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(endDate), "dd MMM yyyy")}`;
    switch (reportType) {
      case "staff":
        return {
          title: "Staff Summary Report",
          headers: ["Staff ID", "Last Name", "First Name", "Rank", "Department", "Unit", "Shift", "Gender", "Status", "Phone"],
          rows: staff.map((s: any) => [
            s.staff_id, s.last_name, s.first_name, s.ranks?.abbreviation ?? "—", s.departments?.name ?? "—",
            s.unit ?? "—", s.shift_group ?? "—", s.gender ?? "—", s.status, s.phone ?? "—",
          ]),
        };
      case "attendance":
        return {
          title: `Attendance Report (${dateRange})`,
          headers: ["Date", "Staff ID", "Name", "Check In", "Check Out", "Status", "Notes"],
          rows: attendance.map((a: any) => [
            format(new Date(a.date), "dd MMM yyyy"), a.profiles?.staff_id ?? "—",
            `${a.profiles?.last_name ?? ""}, ${a.profiles?.first_name ?? ""}`,
            a.check_in ? format(new Date(a.check_in), "HH:mm") : "—",
            a.check_out ? format(new Date(a.check_out), "HH:mm") : "—",
            a.status, a.notes ?? "",
          ]),
        };
      case "leave":
        return {
          title: `Leave/Pass Report (${dateRange})`,
          headers: ["Staff ID", "Name", "Type", "Start Date", "End Date", "Status", "Reason"],
          rows: leaveRequests.map((l: any) => [
            l.profiles?.staff_id ?? "—", `${l.profiles?.last_name ?? ""}, ${l.profiles?.first_name ?? ""}`,
            l.type, format(new Date(l.start_date), "dd MMM yyyy"),
            format(new Date(l.end_date), "dd MMM yyyy"), l.status, l.reason ?? "",
          ]),
        };
    }
  };

  const buildExportPayload = () => {
    const { headers, rows, title } = getReportData();
    const dateRange = `${format(new Date(startDate), "dd-MMM-yyyy")}_${format(new Date(endDate), "dd-MMM-yyyy")}`;
    const filename = `GIS_ASC_${reportType}_${dateRange}`;
    const subtitle = `Period: ${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(endDate), "dd MMM yyyy")} | Records: ${rows.length}`;
    return { title, filename, headers, rows, subtitle };
  };

  const reportOptions = [
    { value: "staff" as ReportType, label: "Staff Summary", icon: Users, description: "Complete staff roster", count: staff.length, color: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
    { value: "attendance" as ReportType, label: "Attendance", icon: CalendarCheck, description: "Check-in/out records", count: attendance.length, color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
    { value: "leave" as ReportType, label: "Leave/Pass", icon: CalendarOff, description: "Leave and pass requests", count: leaveRequests.length, color: "text-orange-600 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700", bg: "bg-orange-50/50 dark:bg-orange-950/20" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Reports</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {reportOptions.map((opt) => (
          <Card key={opt.value} className={`cursor-pointer transition-all ${reportType === opt.value ? `${opt.border} ring-1 ring-primary/30 ${opt.bg}` : "border-border/50 hover:border-primary/40"}`} onClick={() => setReportType(opt.value)}>
            <CardContent className="p-4 flex items-start gap-3">
              <opt.icon className={`h-8 w-8 shrink-0 ${opt.color}`} />
              <div>
                <div className="font-semibold text-sm">{opt.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                <div className="text-lg font-bold mt-1">{opt.count} records</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reportType !== "staff" && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Date Range</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} /></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4 text-primary" /> Export Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ExportMenu
            label="Export Report"
            size="default"
            variant="default"
            getData={() => {
              const payload = buildExportPayload();
              if (payload.rows.length === 0) {
                toast.error("No data found for the selected period");
                return null;
              }
              return payload;
            }}
            onExported={(fmt) => logAdminAudit("report_export", "exported", {
              format: fmt, report_type: reportType,
              from: startDate, to: endDate,
            })}
          />
          <p className="text-[11px] text-muted-foreground">
            Generated exports are downloaded directly. To submit a report for supervisor approval, save the file and upload it below.
          </p>
        </CardContent>
      </Card>

      {isAdminOrSupervisor && <ReportScheduleManager />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Attendance Compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AttendanceComplianceReport />
          {isAdminOrSupervisor && <AttendanceRecipientsPanel />}
        </CardContent>
      </Card>

      {/* Approval workflow */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileStack className="h-4 w-4 text-primary" /> Reports — Approval Workflow
            </CardTitle>
            {canSubmit && (
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Upload className="h-4 w-4" /> Submit Report</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Submit report for supervisor approval</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); uploadMutation.mutate(); }} className="space-y-3">
                    <div><Label>Title *</Label><Input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} required /></div>
                    <div><Label>Category *</Label>
                      <Select value={uploadForm.category} onValueChange={(v) => setUploadForm({ ...uploadForm, category: v as ReportCategory })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Report Date</Label><Input type="date" value={uploadForm.report_date} onChange={(e) => setUploadForm({ ...uploadForm, report_date: e.target.value })} /></div>
                    <div><Label>Description / Notes</Label><Textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} rows={2} /></div>
                    <div>
                      <Label>File (PDF, CSV, JPEG — max 2MB) *</Label>
                      <Input ref={fileRef} type="file" accept=".pdf,.csv,.jpg,.jpeg" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} required />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Your supervisor will review and either approve (visible to OIC, 2IC, Staff Officer & all staff) or return with comments.
                    </p>
                    <Button type="submit" className="w-full" disabled={uploadMutation.isPending}>
                      {uploadMutation.isPending ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center justify-end gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1 h-7" onClick={() => navigate("/ipse")}>
              <Gavel className="h-3.5 w-3.5" /> Open IPSE Triage <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
          <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
            <TabsList className="mb-3 flex-wrap h-auto">
              <TabsTrigger value="pending_ipse" className="gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Pending IPSE
                {counts.pending_ipse > 0 && <Badge variant="secondary" className="ml-1">{counts.pending_ipse}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="with_2ic" className="gap-1.5">
                <ArrowRightCircle className="h-3.5 w-3.5" /> With 2IC
                {counts.with_2ic > 0 && <Badge variant="secondary" className="ml-1">{counts.with_2ic}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="with_oic" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" /> With OIC
                {counts.with_oic > 0 && <Badge variant="secondary" className="ml-1">{counts.with_oic}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                {counts.approved > 0 && <Badge variant="secondary" className="ml-1">{counts.approved}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> Returned
                {counts.rejected > 0 && <Badge variant="secondary" className="ml-1">{counts.rejected}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            </TabsList>
            <TabsContent value={statusTab} forceMount>
              <ReportApprovalsTable
                reports={filteredReports}
                onPreview={handlePreview}
                showActions={isAdminOrSupervisor}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ReportPreviewDialog
        open={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        url={previewUrl || ""}
        fileType={previewType}
        fileName={previewName}
      />

      <p className="text-xs text-center text-muted-foreground">
        Reports generated with GIS Amasaman Sector Command branding
      </p>
    </div>
  );
}
