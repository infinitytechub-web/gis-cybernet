import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Award, Star, Trophy, Send, Save, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { OfficerSelector } from "@/components/appraisals/OfficerSelector";
import { checkExistingAppraisals, submitBulkAppraisals } from "@/lib/appraisal-submit";

const CRITERIA: { key: string; label: string; hint: string }[] = [
  { key: "job_knowledge",          label: "1. Job Knowledge",            hint: "Understanding of duties, procedures, regulations." },
  { key: "quality_of_work",        label: "2. Quality of Work",          hint: "Accuracy, thoroughness, professionalism of output." },
  { key: "productivity",           label: "3. Productivity",             hint: "Volume of work completed within time standards." },
  { key: "discipline_conduct",     label: "4. Discipline & Conduct",     hint: "Adherence to GIS code of conduct, integrity, dress." },
  { key: "leadership_teamwork",    label: "5. Leadership / Teamwork",    hint: "Collaboration, supporting peers, leading when needed." },
  { key: "initiative",             label: "6. Initiative",               hint: "Proactiveness, problem-solving, going beyond duty." },
  { key: "punctuality_attendance", label: "7. Punctuality & Attendance", hint: "Reporting times, leave compliance, reliability." },
];

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  submitted: "bg-amber-100 text-amber-900",
  acknowledged: "bg-emerald-100 text-emerald-900",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TROPHY_COLORS = ["#FFD700","#C0C0C0","#CD7F32","#10b981","#3b82f6"];

export default function Appraisals() {
  const { user } = useAuth();
  const { isAdminOrSupervisor, isHoa } = useAuthContext();
  const canManage = isAdminOrSupervisor || isHoa;

  const today = new Date();
  const [periodYear, setPeriodYear] = useState(today.getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number | null>(today.getMonth() + 1);

  // Charts period selectors
  const [chartYear, setChartYear] = useState(today.getFullYear());
  const [chartMonth, setChartMonth] = useState(today.getMonth() + 1);

  // ---- Charts ----
  const { data: topMonth = [] } = useQuery({
    queryKey: ["top5-month", chartYear, chartMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("top5_staff_of_month" as any, { _year: chartYear, _month: chartMonth });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: topYear = [] } = useQuery({
    queryKey: ["top5-year", chartYear],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("top5_staff_of_year" as any, { _year: chartYear });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // ---- Lists ----
  const { data: appraisals = [] } = useQuery({
    queryKey: ["appraisals-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_appraisals" as any)
        .select("*, profiles:staff_profile_id(first_name, last_name, staff_id)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const outstanding = useMemo(() => appraisals.filter((a: any) => a.outstanding), [appraisals]);

  // ---- Submit form ----
  // (Officer list is now fetched inside <OfficerSelector />.)

  const [staffProfileId, setStaffProfileId] = useState<string>("");
  // Junior workflow: a single appraisal is filed per officer in this set,
  // re-using the same scoring sheet & comments.
  const [bulkProfileIds, setBulkProfileIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(CRITERIA.map(c => [c.key, 3]))
  );
  const [comments, setComments] = useState("");

  const totalSum = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
  const totalAvg = totalSum / CRITERIA.length;

  const qc = useQueryClient();

  const targetIds = useMemo(() => {
    const ids = new Set<string>();
    if (staffProfileId) ids.add(staffProfileId);
    bulkProfileIds.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [staffProfileId, bulkProfileIds]);

  // Pre-submit lookup: which selected officers already have an appraisal
  // for the chosen period? Updates live as the user changes selection/period.
  const { data: existingForPeriod = [] } = useQuery({
    queryKey: ["appraisal-existing", periodYear, periodMonth, targetIds.join(",")],
    enabled: targetIds.length > 0,
    queryFn: () =>
      checkExistingAppraisals(supabase as any, {
        targetIds,
        periodYear,
        periodMonth,
      }),
  });

  const periodLabel = periodMonth ? `${MONTHS[periodMonth - 1]} ${periodYear}` : `Annual ${periodYear}`;

  const submit = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      if (targetIds.length === 0) throw new Error("Select at least one officer");

      // Friendly pre-flight check before hitting the DB. The server-side
      // unique index/trigger remains the source of truth — this is just UX.
      const preExisting = await checkExistingAppraisals(supabase as any, {
        targetIds,
        periodYear,
        periodMonth,
      });
      const fresh = targetIds.filter((id) => !preExisting.includes(id));
      if (fresh.length === 0) {
        const e: any = new Error(
          `An appraisal already exists for ${preExisting.length === 1 ? "this officer" : `all ${preExisting.length} selected officers`} for ${periodLabel}.`,
        );
        e._preflight = true;
        throw e;
      }
      if (preExisting.length > 0) {
        toast.warning(
          `${preExisting.length} officer${preExisting.length === 1 ? " already has" : "s already have"} an appraisal for ${periodLabel} — skipping.`,
        );
      }

      const result = await submitBulkAppraisals(supabase as any, {
        targetIds: fresh,
        payloadBase: {
          appraised_by: user!.id,
          period_year: periodYear,
          period_month: periodMonth,
          status,
          comments: comments || null,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        },
        scores,
        criteria: CRITERIA,
      });
      return {
        ...result,
        duplicates: [...preExisting, ...result.duplicates],
      };
    },
    onSuccess: ({ created, duplicates, failures }, status) => {
      if (created.length) {
        toast.success(
          status === "submitted"
            ? `${created.length} appraisal${created.length === 1 ? "" : "s"} submitted to command.`
            : `${created.length} draft${created.length === 1 ? "" : "s"} saved.`,
        );
      }
      if (duplicates.length) {
        toast.warning(
          `${duplicates.length} skipped — appraisal already exists for ${periodLabel}.`,
        );
      }
      if (failures.length) {
        toast.error(`${failures.length} failed to save. ${failures[0]}`);
      }
      if (created.length) {
        setStaffProfileId(""); setBulkProfileIds([]); setComments("");
        setScores(Object.fromEntries(CRITERIA.map(c => [c.key, 3])));
        qc.invalidateQueries({ queryKey: ["appraisals-list"] });
        qc.invalidateQueries({ queryKey: ["top5-month"] });
        qc.invalidateQueries({ queryKey: ["top5-year"] });
        qc.invalidateQueries({ queryKey: ["appraisal-existing"] });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  return (
    <div className="space-y-4">
      <PageHeader icon={Award} title="Staff Appraisal Dashboard" />

      <Tabs defaultValue="charts">
        <TabsList>
          <TabsTrigger value="charts">Top Performers</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding Staff</TabsTrigger>
          <TabsTrigger value="list">All Appraisals</TabsTrigger>
          {canManage && <TabsTrigger value="new">New Appraisal</TabsTrigger>}
        </TabsList>

        {/* CHARTS */}
        <TabsContent value="charts" className="space-y-4 mt-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Year</Label>
              <Input type="number" className="h-8 w-24" value={chartYear} onChange={(e) => setChartYear(Number(e.target.value) || today.getFullYear())} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Month</Label>
              <Select value={String(chartMonth)} onValueChange={(v) => setChartMonth(Number(v))}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Staff of the Month — {MONTHS[chartMonth - 1]} {chartYear}</CardTitle>
                <CardDescription className="text-xs">Top 5 by average appraisal score</CardDescription>
              </CardHeader>
              <CardContent>
                {topMonth.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">No submitted appraisals for this month.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topMonth} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 5]} />
                      <YAxis type="category" dataKey="staff_name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avg_score" radius={[0, 6, 6, 0]}>
                        {topMonth.map((_: any, i: number) => <Cell key={i} fill={TROPHY_COLORS[i] ?? "#10b981"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-emerald-600" /> Staff of the Year — {chartYear}</CardTitle>
                <CardDescription className="text-xs">Top 5 by average appraisal score</CardDescription>
              </CardHeader>
              <CardContent>
                {topYear.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">No submitted appraisals for this year.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topYear} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 5]} />
                      <YAxis type="category" dataKey="staff_name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="avg_score" radius={[0, 6, 6, 0]}>
                        {topYear.map((_: any, i: number) => <Cell key={i} fill={TROPHY_COLORS[i] ?? "#10b981"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* OUTSTANDING */}
        <TabsContent value="outstanding" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Outstanding Staff</CardTitle>
              <CardDescription className="text-xs">Appraisals scoring 30 or more out of 35 (≈ avg ≥ 4.3 / 5).</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Period</TableHead><TableHead>Total</TableHead><TableHead>Average</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {outstanding.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No outstanding appraisals yet.</TableCell></TableRow>}
                    {outstanding.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{a.profiles?.last_name}, {a.profiles?.first_name} <span className="text-muted-foreground">({a.profiles?.staff_id})</span></TableCell>
                        <TableCell className="text-xs">{a.period_month ? MONTHS[a.period_month - 1] + " " : ""}{a.period_year}</TableCell>
                        <TableCell className="text-xs font-medium">{a.total_score} / 35</TableCell>
                        <TableCell className="text-xs">{a.average_score} / 5</TableCell>
                        <TableCell><Badge className={STATUS_COLOR[a.status] ?? ""}>{a.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIST */}
        <TabsContent value="list" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Recent Appraisals</CardTitle>
              <CardDescription className="text-xs">Most recent 100 records you can view.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Officer</TableHead><TableHead>Period</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {appraisals.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No appraisals yet.</TableCell></TableRow>}
                    {appraisals.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{format(new Date(a.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs">{a.profiles?.last_name}, {a.profiles?.first_name}</TableCell>
                        <TableCell className="text-xs">{a.period_month ? MONTHS[a.period_month - 1] + " " : ""}{a.period_year}</TableCell>
                        <TableCell className="text-xs">{a.total_score} / 35 · avg {a.average_score}</TableCell>
                        <TableCell><Badge className={STATUS_COLOR[a.status] ?? ""}>{a.status}</Badge></TableCell>
                        <TableCell className="text-xs">{a.outstanding ? <Star className="h-3.5 w-3.5 text-amber-500 inline" /> : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NEW APPRAISAL */}
        {canManage && (
          <TabsContent value="new" className="mt-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">New appraisal</CardTitle>
                <CardDescription className="text-xs">Score each criterion 1 (poor) – 5 (excellent). Total 35. Submitting routes to Command.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Officer Selection *</Label>
                  <div className="mt-1.5">
                    <OfficerSelector
                      selectedId={staffProfileId}
                      onSelect={setStaffProfileId}
                      bulkSelected={bulkProfileIds}
                      onBulkChange={setBulkProfileIds}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Period year</Label>
                    <Input type="number" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value) || today.getFullYear())} />
                  </div>
                  <div>
                    <Label>Period month</Label>
                    <Select value={periodMonth ? String(periodMonth) : "annual"} onValueChange={(v) => setPeriodMonth(v === "annual" ? null : Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual (no month)</SelectItem>
                        {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {CRITERIA.map(c => (
                    <div key={c.key} className="border rounded-md p-2.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.hint}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map(n => (
                            <button key={n} type="button"
                              onClick={() => setScores({ ...scores, [c.key]: n })}
                              className={`h-8 w-8 rounded-md border text-xs font-semibold transition ${scores[c.key] === n ? "bg-emerald-600 text-white border-emerald-700" : "bg-background hover:bg-muted"}`}>{n}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <Label>Reviewer comments</Label>
                  <Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional commendations or recommendations…" />
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <div className="text-sm">
                    Total: <span className="font-semibold">{totalSum} / 35</span> · Average: <span className="font-semibold">{totalAvg.toFixed(2)} / 5</span>
                    {totalSum >= 30 && <Badge className="ml-2 bg-amber-100 text-amber-900"><Star className="h-3 w-3 mr-1 inline" /> Outstanding</Badge>}
                    <span className="ml-2 text-xs text-muted-foreground">
                      · {targetIds.length} officer{targetIds.length === 1 ? "" : "s"} selected
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={submit.isPending || targetIds.length === 0} onClick={() => submit.mutate("draft")} className="gap-1"><Save className="h-4 w-4" /> Save draft</Button>
                    <Button disabled={submit.isPending || targetIds.length === 0} onClick={() => submit.mutate("submitted")} className="gap-1"><Send className="h-4 w-4" /> Submit to Command</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
