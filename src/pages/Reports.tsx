import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileSpreadsheet, Download, Users, CalendarCheck, CalendarOff } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ReportType = "staff" | "attendance" | "leave";

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function generatePDF(title: string, filename: string, headers: string[], rows: string[][], subtitle?: string) {
  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? "landscape" : "portrait" });

  // Header
  doc.setFontSize(16);
  doc.setTextColor(0, 102, 153);
  doc.text("GIS Amasaman Sector Command - Cybernet", 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(title, 14, 23);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, 14, 29);
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: subtitle ? 34 : 28,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 102, 153], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 248, 255] },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const pageHeight = doc.internal.pageSize.height;
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")} | Page ${i} of ${pageCount}`, 14, pageHeight - 8);
    doc.text("Powered by Infinity Techub Intelligence", doc.internal.pageSize.width - 14, pageHeight - 8, { align: "right" });
  }

  doc.save(filename);
}

export default function Reports() {
  const { isAdmin } = useAuth();
  const [reportType, setReportType] = useState<ReportType>("staff");
  const [startDate, setStartDate] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [generating, setGenerating] = useState(false);

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
      const { data, error } = await supabase
        .from("attendances")
        .select("*, profiles(first_name, last_name, staff_id)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Leave data
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["report-leave", startDate, endDate],
    enabled: reportType === "leave",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles(first_name, last_name, staff_id)")
        .gte("start_date", startDate)
        .lte("end_date", endDate)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getReportData = (): { headers: string[]; rows: string[][]; title: string } => {
    const dateRange = `${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(endDate), "dd MMM yyyy")}`;

    switch (reportType) {
      case "staff":
        return {
          title: "Staff Summary Report",
          headers: ["Staff ID", "Last Name", "First Name", "Rank", "Department", "Unit", "Shift", "Gender", "Status", "Phone"],
          rows: staff.map((s: any) => [
            s.staff_id, s.last_name, s.first_name,
            s.ranks?.abbreviation ?? "—", s.departments?.name ?? "—",
            s.unit ?? "—", s.shift_group ?? "—", s.gender ?? "—",
            s.status, s.phone ?? "—",
          ]),
        };
      case "attendance":
        return {
          title: `Attendance Report (${dateRange})`,
          headers: ["Date", "Staff ID", "Name", "Check In", "Check Out", "Status", "Notes"],
          rows: attendance.map((a: any) => [
            format(new Date(a.date), "dd MMM yyyy"),
            a.profiles?.staff_id ?? "—",
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
            l.profiles?.staff_id ?? "—",
            `${l.profiles?.last_name ?? ""}, ${l.profiles?.first_name ?? ""}`,
            l.type, format(new Date(l.start_date), "dd MMM yyyy"),
            format(new Date(l.end_date), "dd MMM yyyy"),
            l.status, l.reason ?? "",
          ]),
        };
    }
  };

  const handleExport = (fmt: "pdf" | "csv") => {
    setGenerating(true);
    try {
      const { headers, rows, title } = getReportData();
      if (rows.length === 0) {
        toast.error("No data found for the selected period");
        return;
      }
      const dateRange = `${format(new Date(startDate), "dd-MMM-yyyy")}_${format(new Date(endDate), "dd-MMM-yyyy")}`;
      const filename = `GIS_ASC_${reportType}_${dateRange}`;
      const subtitle = `Period: ${format(new Date(startDate), "dd MMM yyyy")} – ${format(new Date(endDate), "dd MMM yyyy")} | Records: ${rows.length}`;

      if (fmt === "pdf") {
        generatePDF(title, `${filename}.pdf`, headers, rows, subtitle);
        toast.success("PDF report downloaded");
      } else {
        downloadCSV(`${filename}.csv`, headers, rows);
        toast.success("CSV report downloaded");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const reportOptions = [
    { value: "staff" as ReportType, label: "Staff Summary", icon: Users, description: "Complete staff roster with ranks, departments, and contact info", count: staff.length },
    { value: "attendance" as ReportType, label: "Attendance Report", icon: CalendarCheck, description: "Check-in/out records for selected date range", count: attendance.length },
    { value: "leave" as ReportType, label: "Leave/Pass Report", icon: CalendarOff, description: "Leave and pass requests for selected period", count: leaveRequests.length },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Reports</h1>

      {/* Report Type Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {reportOptions.map((opt) => (
          <Card
            key={opt.value}
            className={`cursor-pointer transition-all ${reportType === opt.value ? "border-primary ring-1 ring-primary/30" : "border-border/50 hover:border-primary/40"}`}
            onClick={() => setReportType(opt.value)}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <opt.icon className={`h-8 w-8 shrink-0 ${reportType === opt.value ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <div className="font-semibold text-sm">{opt.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                <div className="text-lg font-bold mt-1">{opt.count} records</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Date Range (for attendance and leave) */}
      {reportType !== "staff" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Export Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button onClick={() => handleExport("pdf")} disabled={generating} className="flex-1 gap-2">
              <FileText className="h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={() => handleExport("csv")} disabled={generating} variant="outline" className="flex-1 gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Reports generated with Reports generated with GIS Amasaman Sector Command — Cybernet branding
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
