import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, UserCheck, UserX, Users } from "lucide-react";

export default function AttendanceLogWidget() {
  const today = new Date().toISOString().split("T")[0];

  const { data, isLoading } = useQuery({
    queryKey: ["attendance-log-widget", today],
    queryFn: async () => {
      const [profilesRes, attRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, gender, department_id, departments(name)")
          .eq("status", "active"),
        supabase
          .from("attendances")
          .select("profile_id, status")
          .eq("date", today),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (attRes.error) throw attRes.error;

      const profiles = profilesRes.data || [];
      const attendance = attRes.data || [];
      const presentIds = new Set(
        attendance.filter((a: any) => a.status === "present" || a.status === "late").map((a: any) => a.profile_id)
      );

      // Gender split for present
      const genderSplit: Record<string, number> = { Male: 0, Female: 0, Other: 0 };
      // Dept-wise totals
      const byDept: Record<string, { present: number; absent: number; total: number }> = {};

      profiles.forEach((p: any) => {
        const dept = p.departments?.name || "Unassigned";
        if (!byDept[dept]) byDept[dept] = { present: 0, absent: 0, total: 0 };
        byDept[dept].total += 1;
        if (presentIds.has(p.id)) {
          byDept[dept].present += 1;
          const g = (p.gender || "other").toLowerCase();
          if (g === "male") genderSplit.Male += 1;
          else if (g === "female") genderSplit.Female += 1;
          else genderSplit.Other += 1;
        } else {
          byDept[dept].absent += 1;
        }
      });

      const totalPresent = presentIds.size;
      const totalActive = profiles.length;
      const totalAbsent = totalActive - totalPresent;
      const deptRows = Object.entries(byDept)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total);

      return { genderSplit, deptRows, totalPresent, totalAbsent, totalActive };
    },
    refetchInterval: 60_000,
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Today's Attendance Log
          {data && (
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data.totalPresent}/{data.totalActive} present
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : !data ? null : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                <UserCheck className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                <div className="text-xl font-bold">{data.totalPresent}</div>
                <div className="text-[10px] text-muted-foreground">Present</div>
              </div>
              <div className="rounded-lg border bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
                <UserX className="h-4 w-4 text-rose-600 mx-auto mb-1" />
                <div className="text-xl font-bold">{data.totalAbsent}</div>
                <div className="text-[10px] text-muted-foreground">Absent</div>
              </div>
              <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                <Users className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                <div className="text-xl font-bold">{data.totalActive}</div>
                <div className="text-[10px] text-muted-foreground">Active staff</div>
              </div>
            </div>

            {/* Gender split */}
            <div>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">
                Gender split (present)
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  Male: {data.genderSplit.Male}
                </Badge>
                <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                  Female: {data.genderSplit.Female}
                </Badge>
                <Badge variant="secondary" className="bg-warning/10 text-warning">
                  Other/Unspecified: {data.genderSplit.Other}
                </Badge>
              </div>
            </div>

            {/* Department-wise */}
            <div>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1.5">
                Department breakdown
              </div>
              <div className="max-h-[260px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Department</TableHead>
                      <TableHead className="text-xs text-center w-16">Present</TableHead>
                      <TableHead className="text-xs text-center w-16">Absent</TableHead>
                      <TableHead className="text-xs text-right w-14">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.deptRows.map((d) => (
                      <TableRow key={d.name}>
                        <TableCell className="text-xs font-medium py-1.5">{d.name}</TableCell>
                        <TableCell className="text-xs text-center py-1.5">
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 text-[10px] px-1.5">
                            {d.present}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-center py-1.5">
                          <Badge variant="secondary" className="bg-rose-500/10 text-rose-700 text-[10px] px-1.5">
                            {d.absent}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right py-1.5 font-semibold">{d.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
