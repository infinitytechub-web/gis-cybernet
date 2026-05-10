import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, ArrowRight, Star, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function StaffAppraisalsWidget() {
  const { isAdminOrSupervisor } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-staff-appraisals"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [recentRes, periodRes, yearRes] = await Promise.all([
        supabase
          .from("staff_appraisals" as any)
          .select("id, average_score, outstanding, status, period_year, period_month, submitted_at, staff_profile_id, profiles!staff_appraisals_staff_profile_id_fkey(first_name, last_name, staff_id, ranks(name))")
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(6),
        supabase
          .from("staff_appraisals" as any)
          .select("id, average_score, outstanding, status", { count: "exact" })
          .eq("period_year", year)
          .eq("period_month", month)
          .eq("status", "submitted"),
        supabase
          .from("staff_appraisals" as any)
          .select("average_score, outstanding")
          .eq("period_year", year)
          .eq("status", "submitted"),
      ]);

      const periodRows = (periodRes.data ?? []) as any[];
      const yearRows = (yearRes.data ?? []) as any[];
      const avg = (rows: any[]) =>
        rows.length === 0 ? 0 : rows.reduce((s, r) => s + Number(r.average_score ?? 0), 0) / rows.length;

      return {
        recent: (recentRes.data ?? []) as any[],
        periodCount: periodRes.count ?? periodRows.length,
        periodAvg: avg(periodRows),
        periodOutstanding: periodRows.filter((r) => r.outstanding).length,
        yearAvg: avg(yearRows),
        yearOutstanding: yearRows.filter((r) => r.outstanding).length,
        yearCount: yearRows.length,
      };
    },
  });

  if (!isAdminOrSupervisor) return null;
  if (isLoading) return null;
  if (!data || data.recent.length === 0) return null;

  const periodLabel = `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Staff Appraisal Reports
            <Badge variant="outline" className="ml-1 text-[10px]">{periodLabel}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => navigate("/appraisals/coverage")}
            >
              Coverage
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => navigate("/appraisals")}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">This Month</div>
            <div className="text-xl font-bold">{data.periodCount}</div>
            <div className="text-[10px] text-muted-foreground">submitted</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Score</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {data.periodAvg.toFixed(2)}
              <Star className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-[10px] text-muted-foreground">monthly average</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {data.periodOutstanding}
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-[10px] text-muted-foreground">flagged this month</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">YTD</div>
            <div className="text-xl font-bold">{data.yearCount}</div>
            <div className="text-[10px] text-muted-foreground">
              {data.yearOutstanding} outstanding · avg {data.yearAvg.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Recent appraisals */}
        <ul className="divide-y divide-border/60 rounded-lg border bg-background">
          {data.recent.map((a: any) => {
            const p = a.profiles ?? {};
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.staff_id || "Officer";
            const rank = p.ranks?.name;
            const period = a.period_month
              ? `${MONTHS[a.period_month - 1]} ${a.period_year}`
              : String(a.period_year);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 py-2 px-2.5 cursor-pointer hover:bg-muted/40"
                onClick={() => navigate(`/appraisals/${a.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {rank ? `${rank} ` : ""}{name}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">{period}</Badge>
                    {a.outstanding && (
                      <Badge className="text-[10px] py-0 px-1.5 bg-amber-500 text-white gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> Outstanding
                      </Badge>
                    )}
                    {a.submitted_at && (
                      <span>{format(new Date(a.submitted_at), "dd MMM yyyy")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {Number(a.average_score).toFixed(2)}
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
