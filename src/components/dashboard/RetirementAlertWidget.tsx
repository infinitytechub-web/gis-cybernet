import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffIdDisplay } from "@/hooks/useStaffIdDisplay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";
import { timeUntilRetirement } from "@/lib/postings-analytics";
import { format } from "date-fns";

interface AlertRow {
  id: string;
  staffId: string;
  name: string;
  remaining: string;
  totalYears: number;
  retireDate: string;
}

export default function RetirementAlertWidget() {
  const { isAdminOrSupervisor } = useAuth();
  const { formatStaffId } = useStaffIdDisplay();
  const navigate = useNavigate();

  const { data: alerts = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["retirement-alerts"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, date_of_birth, retirement_age, status")
        .eq("status", "active");
      if (error) throw error;
      const rows: AlertRow[] = [];
      for (const p of data ?? []) {
        const dob = (p as any).date_of_birth;
        if (!dob) continue;
        const age = (p as any).retirement_age ?? 60;
        const r = timeUntilRetirement(dob, age);
        if (r.retired) continue;
        const totalYears = r.years + r.months / 12 + r.days / 365;
        if (totalYears > 2) continue;
        const retire = new Date(dob); retire.setFullYear(retire.getFullYear() + age);
        rows.push({
          id: p.id,
          staffId: (p as any).staff_id ?? "—",
          name: `${(p as any).last_name ?? ""}, ${(p as any).first_name ?? ""}`.trim(),
          remaining: `${r.years}y ${r.months}m ${r.days}d`,
          totalYears,
          retireDate: format(retire, "dd/MM/yyyy"),
        });
      }
      return rows.sort((a, b) => a.totalYears - b.totalYears);
    },
  });

  if (!isAdminOrSupervisor) return null;

  const red = alerts.filter((a) => a.totalYears <= 1);
  const orange = alerts.filter((a) => a.totalYears > 1 && a.totalYears <= 2);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 animate-pulse" />
          Retirement Trigger Alerts
          <span className="text-xs font-normal text-muted-foreground">
            (≤2 years to retirement)
          </span>
          <div className="ml-auto flex gap-2">
            {red.length > 0 && (
              <Badge className="bg-red-600 hover:bg-red-700 text-white animate-pulse">
                {red.length} · ≤1y
              </Badge>
            )}
            {orange.length > 0 && (
              <Badge className="bg-orange-500 hover:bg-orange-600 text-white animate-pulse">
                {orange.length} · ≤2y
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff approaching retirement within the next 2 years.</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {alerts.map((a) => {
              const isRed = a.totalYears <= 1;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/staff/${a.id}`)}
                  className={`w-full flex items-center gap-3 p-3 rounded-md border transition-colors text-left ${
                    isRed
                      ? "border-red-400 bg-red-50/70 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:hover:bg-red-950/60"
                      : "border-orange-400 bg-orange-50/70 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 dark:hover:bg-orange-950/60"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full animate-pulse ${
                      isRed ? "bg-red-600" : "bg-orange-500"
                    }`}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{formatStaffId(a.staffId)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-semibold ${isRed ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}`}>
                      <Clock className="inline h-3 w-3 mr-1" />
                      {a.remaining}
                    </div>
                    <div className="text-xs text-muted-foreground">Retires {a.retireDate}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground pt-3">
          Data as of: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "dd/MM/yyyy HH:mm:ss") : "—"}
        </p>
      </CardContent>
    </Card>
  );
}
