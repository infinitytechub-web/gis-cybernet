import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck2, Download, Printer, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { triggerDownload } from "@/lib/download-utils";
import { toast } from "sonner";

export default function ApprovedReportsWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: reports = [] } = useQuery({
    queryKey: ["dashboard-approved-reports"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_uploads")
        .select("id, title, category, report_date, file_name, file_path, file_type, approved_at, severity, ipse_comment")
        .eq("approval_status", "approved")
        .order("approved_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const sevClass = (s: string | null | undefined) => {
    if (s === "high") return "bg-red-600 text-white";
    if (s === "medium") return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    if (s === "low") return "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200";
    return "";
  };

  const handleDownload = async (report: any) => {
    const { data, error } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Unable to download — file may have been removed");
      return;
    }
    triggerDownload(data.signedUrl, report.file_name);
  };

  const handlePrint = async (report: any) => {
    const { data } = await supabase.storage.from("reports").createSignedUrl(report.file_path, 120);
    if (!data?.signedUrl) {
      toast.error("Unable to open file for print");
      return;
    }
    const w = window.open(data.signedUrl, "_blank");
    if (w) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 800);
  };

  if (reports.length === 0) return null;

  return (
    <Card className="border-success/30 bg-success/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-success" />
            Approved Reports
            <Badge variant="outline" className="ml-1 text-[10px]">{reports.length}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => navigate("/reports?tab=approved")}
          >
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60">
          {reports.map((r: any) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">{r.category}</Badge>
                  {r.severity && (
                    <Badge className={`text-[10px] py-0 px-1.5 ${sevClass(r.severity)}`}>
                      {String(r.severity).toUpperCase()}
                    </Badge>
                  )}
                  <span>{format(new Date(r.report_date), "dd MMM yyyy")}</span>
                </div>
                {r.ipse_comment && (
                  <div className="text-[10px] italic text-muted-foreground mt-0.5 truncate" title={r.ipse_comment}>
                    IPSE: {r.ipse_comment}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(r)} title="Download">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r)} title="Print">
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
