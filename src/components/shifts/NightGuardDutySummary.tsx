import { useMemo } from "react";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Shield, Users, UserCheck, UserX, Wifi, WifiOff, Download, Clock, BarChart3 } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { downloadCSVString } from "@/lib/download-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string; gender?: string | null }[];
  todayDutyStaff?: { id: string; first_name: string; last_name: string; staff_id: string; gender?: string | null }[];
}

export function NightGuardDutySummary({ nightGuardStaff, todayDutyStaff }: Props) {
  const { onlineUsers } = useOnlineUsers();
  const displayStaff = todayDutyStaff && todayDutyStaff.length > 0 ? todayDutyStaff : nightGuardStaff;
  const nightGuardIds = new Set(displayStaff.map((s) => s.staff_id));
  const onlineGuards = onlineUsers.filter((u) => nightGuardIds.has(u.staffId));

  // Fetch today's activity log for login/logout times
  const today = new Date();
  const { data: todayActivity = [] } = useQuery({
    queryKey: ["night-guard-activity-today", format(today, "yyyy-MM-dd")],
    queryFn: async () => {
      const profileIds = nightGuardStaff.map((s) => s.id);
      if (profileIds.length === 0) return [];
      const { data, error } = await supabase
        .from("night_guard_activity_log" as any)
        .select("*")
        .in("profile_id", profileIds)
        .gte("created_at", startOfDay(today).toISOString())
        .lte("created_at", endOfDay(today).toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: nightGuardStaff.length > 0,
    refetchInterval: 30000,
  });

  // Gender breakdown
  const genderStats = useMemo(() => {
    const male = displayStaff.filter((s) => s.gender?.toLowerCase() === "male").length;
    const female = displayStaff.filter((s) => s.gender?.toLowerCase() === "female").length;
    const other = displayStaff.length - male - female;
    return { male, female, other };
  }, [displayStaff]);

  // Per-staff login/logout summary
  const staffSummary = useMemo(() => {
    return displayStaff.map((s) => {
      const events = todayActivity.filter((e: any) => e.profile_id === s.id);
      const firstLogin = events.find((e: any) => e.event_type === "online");
      const lastLogout = [...events].reverse().find((e: any) => e.event_type === "offline");
      const isOnline = onlineUsers.some((u) => u.staffId === s.staff_id);
      const onlineUser = onlineUsers.find((u) => u.staffId === s.staff_id);
      return {
        ...s,
        firstLogin: firstLogin ? new Date(firstLogin.created_at) : null,
        lastLogout: lastLogout ? new Date(lastLogout.created_at) : null,
        isOnline,
        onlineSince: onlineUser?.onlineSince ? new Date(onlineUser.onlineSince) : null,
        reported: events.some((e: any) => e.event_type === "online"),
      };
    });
  }, [displayStaff, todayActivity, onlineUsers]);

  const totalReported = staffSummary.filter((s) => s.reported || s.isOnline).length;
  const totalOnline = onlineGuards.length;
  const totalOffline = displayStaff.length - totalOnline;

  // Export functions
  const buildReportRows = () =>
    staffSummary.map((s) => [
      `${s.last_name}, ${s.first_name}`,
      s.staff_id,
      s.gender || "—",
      s.reported || s.isOnline ? "Yes" : "No",
      s.isOnline ? "Online" : "Offline",
      s.firstLogin ? format(s.firstLogin, "HH:mm:ss") : "—",
      s.lastLogout ? format(s.lastLogout, "HH:mm:ss") : "—",
    ]);

  const headers = ["Name", "Staff ID", "Gender", "Reported", "Status", "First Login", "Last Logout"];
  const dateLabel = format(today, "dd MMM yyyy");

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Night Guard Duty Summary — ${dateLabel}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Total: ${displayStaff.length} | Reported: ${totalReported} | Online: ${totalOnline} | Male: ${genderStats.male} | Female: ${genderStats.female}`, 14, 24);
    autoTable(doc, { head: [headers], body: buildReportRows(), startY: 30 });
    doc.save(`night_guard_summary_${format(today, "yyyy-MM-dd")}.pdf`);
    toast.success("PDF report downloaded");
  };

  const exportCSV = () => {
    const rows = [headers, ...buildReportRows()];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    downloadCSVString(csv, `night_guard_summary_${format(today, "yyyy-MM-dd")}.csv`);
    toast.success("CSV report downloaded");
  };

  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...buildReportRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Night Guard Summary");
    XLSX.writeFile(wb, `night_guard_summary_${format(today, "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel report downloaded");
  };

  return (
    <Card className="border-[hsl(220,80%,18%)]/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2 text-[hsl(220,70%,25%)] font-bold">
            <BarChart3 className="h-4 w-4 text-[hsl(220,70%,25%)] stroke-[2.5]" />
            Night Guard Duty Summary — {dateLabel}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                <Download className="h-3.5 w-3.5" /> Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportPDF}>PDF Report</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCSV}>CSV Report</DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>Excel Report</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-card p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-[hsl(220,70%,40%)] mb-1" />
            <p className="text-2xl font-bold text-[hsl(220,70%,25%)]">{displayStaff.length}</p>
            <p className="text-[10px] text-muted-foreground">Total Assigned</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <UserCheck className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-2xl font-bold text-emerald-700">{totalReported}</p>
            <p className="text-[10px] text-muted-foreground">Reported for Duty</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <Wifi className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-2xl font-bold text-emerald-600">{totalOnline}</p>
            <p className="text-[10px] text-muted-foreground">Currently Online</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <UserX className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold text-muted-foreground">{totalOffline}</p>
            <p className="text-[10px] text-muted-foreground">Offline</p>
          </div>
        </div>

        {/* Gender breakdown */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="font-bold text-blue-600">{genderStats.male}</span> Male
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="font-bold text-pink-600">{genderStats.female}</span> Female
          </Badge>
          {genderStats.other > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="font-bold">{genderStats.other}</span> Other/Unset
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1 ml-auto">
            <Clock className="h-3 w-3" /> Live • auto-refreshes
          </Badge>
        </div>

        {/* Staff detail table */}
        {displayStaff.length > 0 && (
          <ScrollArea className="max-h-[300px]">
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Staff</th>
                    <th className="px-2 py-2 text-left font-medium hidden sm:table-cell">Gender</th>
                    <th className="px-2 py-2 text-center font-medium">Status</th>
                    <th className="px-2 py-2 text-center font-medium">Login</th>
                    <th className="px-2 py-2 text-center font-medium">Logout</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSummary.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px] bg-muted">
                              {s.first_name?.[0]}{s.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium truncate max-w-[120px]">{s.last_name}, {s.first_name}</p>
                            <p className="text-[9px] text-muted-foreground">{s.staff_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 hidden sm:table-cell capitalize text-muted-foreground">{s.gender || "—"}</td>
                      <td className="px-2 py-2 text-center">
                        {s.isOnline ? (
                          <Badge className="text-[8px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-400">
                            <Wifi className="h-2.5 w-2.5 mr-0.5" /> Online
                          </Badge>
                        ) : s.reported ? (
                          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 text-amber-600 border-amber-400">
                            Reported
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 text-muted-foreground">
                            <WifiOff className="h-2.5 w-2.5 mr-0.5" /> Absent
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                        {s.firstLogin ? format(s.firstLogin, "HH:mm") : "—"}
                      </td>
                      <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                        {s.lastLogout ? format(s.lastLogout, "HH:mm") : s.isOnline ? "—" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
