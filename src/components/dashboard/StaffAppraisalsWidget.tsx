import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, ArrowRight, Star, Sparkles, X, Filter, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { downloadCSVString, downloadBlob } from "@/lib/download-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PROFILE_JOIN =
  "profiles!staff_appraisals_staff_profile_id_fkey!inner(first_name, last_name, staff_id, department_id, rank_id, ranks(name), departments(name))";

export default function StaffAppraisalsWidget() {
  const { isAdminOrSupervisor } = useAuth();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1)); // "all" | 1-12
  const [deptId, setDeptId] = useState<string>("all");
  const [rankId, setRankId] = useState<string>("all");

  const yearOptions = useMemo(() => {
    const cur = now.getFullYear();
    return [cur, cur - 1, cur - 2, cur - 3];
  }, [now]);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-appraisal-widget"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks-appraisal-widget"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const { data } = await supabase.from("ranks").select("id, name").order("name");
      return data ?? [];
    },
  });

  const applyProfileFilters = (q: any) => {
    if (deptId !== "all") q = q.eq("profiles.department_id", deptId);
    if (rankId !== "all") q = q.eq("profiles.rank_id", rankId);
    return q;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-staff-appraisals", year, month, deptId, rankId],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      // Recent — limited & ordered
      let recentQ: any = supabase
        .from("staff_appraisals" as any)
        .select(`id, average_score, outstanding, status, period_year, period_month, submitted_at, staff_profile_id, ${PROFILE_JOIN}`)
        .eq("status", "submitted")
        .eq("period_year", year);
      if (month !== "all") recentQ = recentQ.eq("period_month", parseInt(month, 10));
      recentQ = applyProfileFilters(recentQ).order("submitted_at", { ascending: false }).limit(6);

      // Period stats (matches selected year + optional month)
      let periodQ: any = supabase
        .from("staff_appraisals" as any)
        .select(`id, average_score, outstanding, ${PROFILE_JOIN}`, { count: "exact" })
        .eq("status", "submitted")
        .eq("period_year", year);
      if (month !== "all") periodQ = periodQ.eq("period_month", parseInt(month, 10));
      periodQ = applyProfileFilters(periodQ);

      // YTD (always full selected year, ignoring month filter)
      let yearQ: any = supabase
        .from("staff_appraisals" as any)
        .select(`average_score, outstanding, ${PROFILE_JOIN}`)
        .eq("status", "submitted")
        .eq("period_year", year);
      yearQ = applyProfileFilters(yearQ);

      const [recentRes, periodRes, yearRes] = await Promise.all([recentQ, periodQ, yearQ]);

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

  const periodLabel = month === "all"
    ? `${year} (all months)`
    : `${MONTHS[parseInt(month, 10) - 1]} ${year}`;

  const filtersActive = month !== String(now.getMonth() + 1) || year !== now.getFullYear() || deptId !== "all" || rankId !== "all";

  const clearFilters = () => {
    setYear(now.getFullYear());
    setMonth(String(now.getMonth() + 1));
    setDeptId("all");
    setRankId("all");
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Staff Appraisal Reports
            <Badge variant="outline" className="ml-1 text-[10px]">{periodLabel}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/appraisals/coverage")}>
              Coverage
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/appraisals")}>
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Filters */}
        <div className="rounded-lg border bg-background/80 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Filter className="h-3 w-3" /> Filters
            {filtersActive && (
              <Button size="sm" variant="ghost" className="ml-auto h-6 gap-1 text-[11px]" onClick={clearFilters}>
                <X className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Department</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Rank / Designation</Label>
              <Select value={rankId} onValueChange={setRankId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ranks</SelectItem>
                  {ranks.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {month === "all" ? "Selected Year" : "Selected Period"}
            </div>
            <div className="text-xl font-bold">{data?.periodCount ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">submitted</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Score</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {(data?.periodAvg ?? 0).toFixed(2)}
              <Star className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-[10px] text-muted-foreground">period average</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</div>
            <div className="text-xl font-bold flex items-center gap-1">
              {data?.periodOutstanding ?? 0}
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-[10px] text-muted-foreground">flagged in period</div>
          </div>
          <div className="rounded-lg border bg-background p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{year} YTD</div>
            <div className="text-xl font-bold">{data?.yearCount ?? 0}</div>
            <div className="text-[10px] text-muted-foreground">
              {data?.yearOutstanding ?? 0} outstanding · avg {(data?.yearAvg ?? 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Recent appraisals */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : !data || data.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No appraisals match these filters.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border bg-background">
            {data.recent.map((a: any) => {
              const p = a.profiles ?? {};
              const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.staff_id || "Officer";
              const rank = p.ranks?.name;
              const dept = p.departments?.name;
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
                      {dept && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{dept}</Badge>}
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
        )}
      </CardContent>
    </Card>
  );
}
