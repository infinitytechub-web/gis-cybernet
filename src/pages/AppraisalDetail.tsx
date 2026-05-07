import { useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Award, ArrowLeft, History, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { format } from "date-fns";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CRITERION_LABELS: Record<string, string> = {
  job_knowledge: "Job Knowledge",
  quality_of_work: "Quality of Work",
  productivity: "Productivity",
  discipline_conduct: "Discipline & Conduct",
  leadership_teamwork: "Leadership / Teamwork",
  initiative: "Initiative",
  punctuality_attendance: "Punctuality & Attendance",
};

const ACTION_COLOR: Record<string, string> = {
  created: "bg-sky-100 text-sky-900",
  submitted: "bg-emerald-100 text-emerald-900",
  updated: "bg-amber-100 text-amber-900",
  duplicate_attempt: "bg-rose-100 text-rose-900",
  deleted: "bg-slate-200 text-slate-900",
};

export default function AppraisalDetail() {
  const { staffProfileId } = useParams<{ staffProfileId: string }>();
  const [searchParams] = useSearchParams();
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const monthParam = searchParams.get("month");
  const month = monthParam ? Number(monthParam) : null;

  const periodLabel = month ? `${MONTHS[month - 1]} ${year}` : `Annual ${year}`;

  const { data: profile } = useQuery({
    queryKey: ["appraisal-detail-profile", staffProfileId],
    enabled: !!staffProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, ranks(name), departments(name)")
        .eq("id", staffProfileId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: appraisal, isLoading } = useQuery({
    queryKey: ["appraisal-detail", staffProfileId, year, month],
    enabled: !!staffProfileId,
    queryFn: async () => {
      let q = supabase
        .from("staff_appraisals" as any)
        .select("*, scores:staff_appraisal_scores(criterion, score, remarks)")
        .eq("staff_profile_id", staffProfileId!)
        .eq("period_year", year)
        .limit(1);
      q = month == null ? q.is("period_month", null) : q.eq("period_month", month);
      const { data, error } = await q;
      if (error) throw error;
      return ((data as any[]) ?? [])[0] ?? null;
    },
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["appraisal-audit", staffProfileId, year, month],
    enabled: !!staffProfileId,
    queryFn: async () => {
      let q = supabase
        .from("staff_appraisal_audit" as any)
        .select("*, actor:actor_id(first_name, last_name, staff_id)")
        .eq("staff_profile_id", staffProfileId!)
        .eq("period_year", year)
        .order("created_at", { ascending: false });
      q = month == null ? q.is("period_month", null) : q.eq("period_month", month);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: trend = [] } = useQuery({
    queryKey: ["appraisal-trend", staffProfileId],
    enabled: !!staffProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_appraisals" as any)
        .select("period_year, period_month, scores:staff_appraisal_scores(criterion, score)")
        .eq("staff_profile_id", staffProfileId!)
        .order("period_year", { ascending: true })
        .order("period_month", { ascending: true, nullsFirst: true })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const officerName = profile ? `${profile.last_name ?? ""}, ${profile.first_name ?? ""}` : "—";
  const scoreRows = useMemo(() => (appraisal?.scores ?? []) as { criterion: string; score: number; remarks?: string | null }[], [appraisal]);

  const radarData = useMemo(
    () => scoreRows.map((s) => ({ criterion: CRITERION_LABELS[s.criterion] ?? s.criterion, score: s.score })),
    [scoreRows],
  );
  const trendData = useMemo(() => trend.map((a: any) => {
    const row: any = {
      period: a.period_month ? `${MONTHS[a.period_month - 1]} ${a.period_year}` : `Annual ${a.period_year}`,
    };
    (a.scores ?? []).forEach((s: any) => { row[s.criterion] = s.score; });
    return row;
  }), [trend]);
  const CRIT_KEYS = Object.keys(CRITERION_LABELS);
  const CRIT_COLORS = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899"];

  return (
    <div className="space-y-4">
      <PageHeader icon={Award} title="Appraisal Detail" subtitle={`${officerName} · ${periodLabel}`} />

      <div>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link to="/appraisals/coverage"><ArrowLeft className="h-4 w-4" /> Back to coverage report</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Officer</CardTitle>
        </CardHeader>
        <CardContent className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
          <div><span className="text-muted-foreground text-xs">Staff ID:</span> {profile?.staff_id ?? "—"}</div>
          <div><span className="text-muted-foreground text-xs">Name:</span> {officerName}</div>
          <div><span className="text-muted-foreground text-xs">Rank:</span> {profile?.ranks?.name ?? "—"}</div>
          <div><span className="text-muted-foreground text-xs">Department:</span> {profile?.departments?.name ?? "—"}</div>
        </CardContent>
      </Card>

      {(radarData.length > 0 || trendData.length > 1) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {radarData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Criterion radar · {periodLabel}</CardTitle>
                <CardDescription className="text-xs">Score per criterion (1–5).</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData} outerRadius={90}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.45} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {trendData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Score trend across periods</CardTitle>
                <CardDescription className="text-xs">Stacked criterion scores per recorded period (max 35).</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 35]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {CRIT_KEYS.map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="s" fill={CRIT_COLORS[i % CRIT_COLORS.length]} name={CRITERION_LABELS[k]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Scores · {periodLabel}</CardTitle>
          <CardDescription className="text-xs">Each criterion is rated 1 (poor) – 5 (excellent). Maximum total is 35.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="text-xs text-muted-foreground py-6 text-center">Loading…</div>}
          {!isLoading && !appraisal && (
            <div className="text-xs text-muted-foreground py-6 text-center">No appraisal exists for this officer in {periodLabel}.</div>
          )}
          {appraisal && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div>Total: <span className="font-semibold">{appraisal.total_score} / 35</span></div>
                <div>Average: <span className="font-semibold">{appraisal.average_score} / 5</span></div>
                <Badge className={appraisal.status === "submitted" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}>{appraisal.status}</Badge>
                {appraisal.outstanding && <Badge className="bg-amber-100 text-amber-900"><Star className="h-3 w-3 mr-1 inline" /> Outstanding</Badge>}
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Criterion</TableHead>
                      <TableHead className="w-24">Score</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoreRows.map((s) => (
                      <TableRow key={s.criterion}>
                        <TableCell className="text-xs">{CRITERION_LABELS[s.criterion] ?? s.criterion}</TableCell>
                        <TableCell className="text-xs font-medium">{s.score} / 5</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.remarks ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {appraisal.comments && (
                <div className="border rounded-md p-3 bg-muted/30">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Reviewer comments</div>
                  <div className="text-sm whitespace-pre-wrap">{appraisal.comments}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Audit trail</CardTitle>
          <CardDescription className="text-xs">All recorded events for this officer & period — including duplicate-submission attempts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Bulk batch</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No audit entries.</TableCell></TableRow>
                )}
                {audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs">{format(new Date(row.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell><Badge className={ACTION_COLOR[row.action] ?? ""}>{row.action.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-xs">
                      {row.actor ? `${row.actor.last_name ?? ""}, ${row.actor.first_name ?? ""}` : "—"}
                      {row.actor?.staff_id && <span className="text-muted-foreground"> ({row.actor.staff_id})</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.bulk_batch_id ? (
                        <span className="font-mono text-[10px]">{String(row.bulk_batch_id).slice(0, 8)}… · {row.bulk_size ?? "?"} officers</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.details && Object.keys(row.details).length > 0 ? (
                        <code className="text-[10px]">{JSON.stringify(row.details)}</code>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
