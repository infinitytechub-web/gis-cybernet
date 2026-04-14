import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const GENDER_COLORS: Record<string, string> = {
  Male: "hsl(var(--primary))",
  Female: "hsl(var(--destructive))",
  Other: "hsl(var(--warning))",
  "Not Set": "hsl(var(--muted-foreground))",
};

export default function GenderStatisticsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["gender-statistics"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("gender, department_id, departments(name)")
        .eq("status", "active");
      if (error) throw error;

      const overall: Record<string, number> = {};
      const byDept: Record<string, Record<string, number>> = {};

      (profiles || []).forEach((p: any) => {
        const g = p.gender || "Not Set";
        const label = g.charAt(0).toUpperCase() + g.slice(1);
        overall[label] = (overall[label] || 0) + 1;

        const dept = p.departments?.name || "Unassigned";
        if (!byDept[dept]) byDept[dept] = {};
        byDept[dept][label] = (byDept[dept][label] || 0) + 1;
      });

      const total = profiles?.length || 0;
      const overallData = Object.entries(overall)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const deptData = Object.entries(byDept)
        .map(([dept, genders]) => ({
          dept,
          total: Object.values(genders).reduce((a, b) => a + b, 0),
          ...genders,
        }))
        .sort((a, b) => b.total - a.total);

      return { overallData, deptData, total };
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Gender Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  const { overallData = [], deptData = [], total = 0 } = data || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Overall Gender Summary */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Gender Summary
            <Badge variant="outline" className="ml-auto text-[10px]">{total} staff</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={overallData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {overallData.map((entry) => (
                    <Cell key={entry.name} fill={GENDER_COLORS[entry.name] || GENDER_COLORS["Other"]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [value, "Count"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend
                  formatter={(value) => <span className="text-xs">{value}</span>}
                  iconSize={10}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            {overallData.map((g) => {
              const pct = total > 0 ? Math.round((g.value / total) * 100) : 0;
              return (
                <div key={g.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground">{g.value} ({pct}%)</span>
                  </div>
                  <Progress
                    value={pct}
                    className="h-1.5"
                    style={{ "--progress-color": GENDER_COLORS[g.name] || GENDER_COLORS["Other"] } as React.CSSProperties}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Gender by Department */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Gender by Department
            <Badge variant="outline" className="ml-auto text-[10px]">{deptData.length} depts</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 max-h-[380px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Department</TableHead>
                <TableHead className="text-xs text-center w-14">Male</TableHead>
                <TableHead className="text-xs text-center w-14">Female</TableHead>
                <TableHead className="text-xs text-center w-14 hidden sm:table-cell">Other</TableHead>
                <TableHead className="text-xs text-right w-14">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deptData.map((d: any) => (
                <TableRow key={d.dept}>
                  <TableCell className="text-xs font-medium py-1.5">{d.dept}</TableCell>
                  <TableCell className="text-xs text-center py-1.5">
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5">
                      {d.Male || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-center py-1.5">
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px] px-1.5">
                      {d.Female || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-center py-1.5 hidden sm:table-cell">
                    <Badge variant="secondary" className="bg-warning/10 text-warning text-[10px] px-1.5">
                      {(d.Other || 0) + (d["Not Set"] || 0)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right py-1.5 font-semibold">{d.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
