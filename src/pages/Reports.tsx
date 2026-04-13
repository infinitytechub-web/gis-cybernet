import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Download, Upload, Users, CalendarCheck, CalendarOff, Search, Trash2, Eye, Printer, Mail, FileDown, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { toast } from "sonner";
import ReportPreviewDialog from "@/components/reports/ReportPreviewDialog";
import ReportScheduleManager from "@/components/reports/ReportScheduleManager";
import { triggerDownload } from "@/lib/download-utils";
import { exportReport, type ExportFormat, getFormatLabel } from "@/lib/export-utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type ReportType = "staff" | "attendance" | "leave";
type ReportCategory = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["application/pdf", "text/csv", "image/jpeg", "image/jpg"];

export default function Reports() {
  const { isAdmin, isAdminOrSupervisor, user } = useAuth();
  const qc = useQueryClient();
  const [reportType, setReportType] = useState<ReportType>("staff");
  const [startDate, setStartDate] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [generating, setGenerating] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  const [uploadForm, setUploadForm] = useState({
    title: "", description: "", category: "daily" as ReportCategory, report_date: format(new Date(), "yyyy-MM-dd"),
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Staff data
  const { data: staff = [] } = useQuery({
    queryKey: ["report-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*, ranks(name, abbreviation), departments(name)").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Attendance data
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

  // Leave data
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

  // Uploaded reports
  const { data: uploadedReports = [] } = useQuery({
    queryKey: ["report-uploads", categoryFilter],
    queryFn: async () => {
      let q = supabase.from("report_uploads").select("*").order("report_date", { ascending: false });
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

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
        report_date: uploadForm.report_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report uploaded");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadForm({ title: "", description: "", category: "daily", report_date: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (report: any) => {
      await supabase.storage.from("reports").remove([report.file_path]);
      const { error } = await supabase.from("report_uploads").delete().eq("id", report.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const reportsToDelete = uploadedReports.filter((r: any) => ids.includes(r.id));
      const filePaths = reportsToDelete.map((r: any) => r.file_path);
      if (filePaths.length > 0) {
        await supabase.storage.from("reports").remove(filePaths);
      }
      const { error } = await supabase.from("report_uploads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, ids) => {
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success(`${ids.length} report(s) deleted`);
      setSelectedReports(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedReports(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedReports.size === uploadedReports.length && uploadedReports.length > 0) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(uploadedReports.map((r: any) => r.id)));
    }
  }, [selectedReports.size, uploadedReports]);

  const handlePreview = async (report: any) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 300);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewType(report.file_type);
      setPreviewName(report.file_name);
    }
  };

  const handleDownload = async (report: any) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 60);
    if (data?.signedUrl) {
      triggerDownload(data.signedUrl, report.file_name);
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

  const handleExport = (fmt: ExportFormat) => {
    setGenerating(true);
    try {
      const { headers, rows, title } = getReportData();
      if (rows.length === 0) { toast.error("No data found for the selected period"); return; }
      const dateRange = `${format(new Date(startDate), "dd-MMM-yyyy")}_${format(new Date(endDate), "dd-MMM-yyyy")}`;
      const filename = `GIS_ASC_${reportType}_${dateRange}`;
      const subtitle = `Period: ${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(endDate), "dd MMM yyyy")} | Records: ${rows.length}`;
      exportReport(fmt, { title, filename, headers, rows, subtitle });
      toast.success(`${getFormatLabel(fmt)} report downloaded`);
    } catch (e: any) { toast.error(e.message); }
    finally { setGenerating(false); }
  };

  const reportOptions = [
    { value: "staff" as ReportType, label: "Staff Summary", icon: Users, description: "Complete staff roster", count: staff.length, color: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
    { value: "attendance" as ReportType, label: "Attendance", icon: CalendarCheck, description: "Check-in/out records", count: attendance.length, color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
    { value: "leave" as ReportType, label: "Leave/Pass", icon: CalendarOff, description: "Leave and pass requests", count: leaveRequests.length, color: "text-orange-600 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700", bg: "bg-orange-50/50 dark:bg-orange-950/20" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Reports</h1>

      {/* Generated Reports Section */}
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
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleExport("pdf")} disabled={generating} className="flex-1 gap-2"><FileText className="h-4 w-4" /> PDF</Button>
            <Button onClick={() => handleExport("csv")} disabled={generating} variant="outline" className="flex-1 gap-2"><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
            <Button onClick={() => handleExport("excel")} disabled={generating} variant="outline" className="flex-1 gap-2"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button onClick={() => handleExport("word")} disabled={generating} variant="outline" className="flex-1 gap-2"><FileDown className="h-4 w-4" /> Word</Button>
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Reports - Admin/Supervisor */}
      {isAdminOrSupervisor && <ReportScheduleManager />}

      {/* Uploaded Reports Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Uploaded Reports</CardTitle>
            {isAdminOrSupervisor && (
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Upload className="h-4 w-4" /> Upload Report</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Upload Report</DialogTitle></DialogHeader>
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
                    <div><Label>Description</Label><Textarea value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} rows={2} /></div>
                    <div>
                      <Label>File (PDF, CSV, JPEG — max 2MB) *</Label>
                      <Input ref={fileRef} type="file" accept=".pdf,.csv,.jpg,.jpeg" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={uploadMutation.isPending}>
                      {uploadMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploadedReports.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No uploaded reports</TableCell></TableRow>
                ) : uploadedReports.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                    <TableCell className="text-sm">{format(new Date(r.report_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-xs">{r.file_type.split("/")[1]?.toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{(r.file_size / 1024).toFixed(0)} KB</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handlePreview(r)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(r)} title="Download"><Download className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => window.print()} title="Print"><Printer className="h-4 w-4" /></Button>
                        {isAdminOrSupervisor && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Delete report "{r.title}"?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this report file. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(r)}>Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
