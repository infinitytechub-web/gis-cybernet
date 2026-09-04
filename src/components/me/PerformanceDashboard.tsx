/**
 * Project and programme performance dashboards.
 *
 * Data comes from the me_project_dashboard / me_program_dashboard RPCs, which
 * apply classification and unit visibility server-side, so no table is queried
 * directly from the browser. Charts use Recharts with semantic tokens only.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowLeft, CalendarClock, CircleDollarSign, Gauge, MapPin, RefreshCw, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/date-format";
import { toast } from "sonner";

const db = supabase as any;
type Row = Record<string, any>;

const CURRENCY = "GHS";

function money(value: unknown) {
  return `${CURRENCY} ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function titleCase(value: unknown) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function monthLabel(month: string) {
  const [year, m] = String(month).split("-");
  if (!year || !m) return String(month);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1] ?? m} ${year.slice(2)}`;
}

/** Achievement colour: green at/over target, amber close, red far behind. */
function achievementFill(achievement: number | null) {
  if (achievement === null) return "hsl(var(--muted-foreground))";
  if (achievement >= 100) return "hsl(var(--primary))";
  if (achievement >= 75) return "hsl(var(--secondary-foreground))";
  return "hsl(var(--destructive))";
}

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: typeof Gauge; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetCard({ budget }: { budget: Row | null | undefined }) {
  const approved = Number(budget?.approved ?? 0);
  const committed = Number(budget?.committed ?? 0);
  const spent = Number(budget?.spent ?? 0);
  const utilisation = approved > 0 ? Math.round((spent / approved) * 100) : 0;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /> Budget against approved</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved</p>
          <p className="text-2xl font-semibold tabular-nums">{money(approved)}</p>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Spent</span><span className="font-medium tabular-nums">{money(spent)}</span></div>
          <Progress value={Math.min(utilisation, 100)} aria-label="Budget utilisation" />
          <p className={`text-xs ${utilisation > 100 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{utilisation}% of approved budget used{utilisation > 100 ? " — over budget" : ""}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-muted-foreground">Committed</p><p className="font-medium tabular-nums">{money(committed)}</p></div>
          <div><p className="text-muted-foreground">Remaining</p><p className="font-medium tabular-nums">{money(Math.max(approved - spent, 0))}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiChart({ measures }: { measures: Row[] }) {
  const data = useMemo(
    () => measures.slice(0, 12).map((measure) => ({
      name: String(measure.name ?? measure.ref_code ?? "KPI").slice(0, 22),
      target: Number(measure.target_value ?? 0),
      actual: Number(measure.actual_value ?? 0),
      achievement: measure.achievement === null || measure.achievement === undefined ? null : Number(measure.achievement),
    })),
    [measures],
  );
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> KPIs: actual against target</CardTitle></CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No KPIs linked yet. Add indicators under KPIs and Indicators.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="target" name="Target" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" name="Actual" radius={[2, 2, 0, 0]}>
                  {data.map((entry, index) => <Cell key={index} fill={achievementFill(entry.achievement)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiTable({ measures }: { measures: Row[] }) {
  if (measures.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>KPI detail</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground">Indicator</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Unit</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Baseline</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Target</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actual</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Achievement</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Last reported</th>
            </tr></thead>
            <tbody>
              {measures.map((measure) => (
                <tr key={measure.id} className="border-b last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{measure.name}</p><p className="text-xs text-muted-foreground">{measure.ref_code} · {titleCase(measure.measure_class)}</p></td>
                  <td className="px-4 py-3">{measure.unit ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{measure.baseline_value ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{measure.target_value ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{measure.actual_value ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {measure.achievement === null || measure.achievement === undefined ? "—" : (
                      <Badge variant={Number(measure.achievement) >= 100 ? "secondary" : Number(measure.achievement) >= 75 ? "outline" : "destructive"}>{Number(measure.achievement)}%</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">{measure.reported_at ? formatDate(measure.reported_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceDashboard({
  scope,
  recordId,
  onBack,
}: {
  scope: "project" | "program";
  recordId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: result, error } = await db.rpc(
      scope === "project" ? "me_project_dashboard" : "me_program_dashboard",
      scope === "project" ? { _project_id: recordId } : { _program_id: recordId },
    );
    if (error) { toast.error(error.message); setData(null); } else setData(result);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [scope, recordId]);

  if (loading && !data) return <div className="py-16 text-center text-muted-foreground" role="status">Loading performance figures…</div>;
  if (!data) return (
    <div className="space-y-4 py-8 text-center">
      <p className="text-muted-foreground">These figures could not be loaded.</p>
      <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back to list</Button>
    </div>
  );

  const header = scope === "project" ? data.project : data.program;
  const measures: Row[] = data.measures ?? [];
  const activities: Row[] = data.activities ?? [];
  const projects: Row[] = data.projects ?? [];
  const milestones: Row[] = data.milestones ?? [];
  const spend: Row[] = data.spend_by_month ?? [];

  const activityChart = activities.slice(0, 14).map((activity) => ({
    name: String(activity.name ?? activity.ref_code ?? "Activity").slice(0, 20),
    progress: Number(activity.percent_complete ?? 0),
    overdue: Boolean(activity.overdue),
  }));
  const projectChart = projects.map((project) => ({
    name: String(project.name ?? project.ref_code ?? "Project").slice(0, 20),
    progress: Number(project.percent_complete ?? 0),
    budget: Number(project.budget ?? 0),
    spent: Number(project.spent ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2"><ArrowLeft className="mr-2 h-4 w-4" /> Back to {scope === "project" ? "projects" : "programs"}</Button>
          <p className="text-sm font-medium text-primary">{scope === "project" ? "Project performance" : "Programme performance"}</p>
          <h1 className="text-2xl font-bold tracking-tight">{header?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {header?.ref_code} · {titleCase(header?.status)} · {header?.region ?? "No region"} · {formatDate(header?.start_date)} – {formatDate(header?.end_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={String(header?.health).includes("critical") ? "destructive" : "secondary"}>{titleCase(header?.health) || "Health not set"}</Badge>
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh performance figures"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {scope === "project" ? (
          <>
            <Stat label="Overall progress" value={`${Math.round(Number(header?.percent_complete ?? 0))}%`} icon={Gauge} />
            <Stat label="Activities" value={activities.length} icon={CalendarClock} hint={`${activities.filter((a) => a.overdue).length} overdue`} />
            <Stat label="KPIs tracked" value={measures.length} icon={Target} hint={`${measures.filter((m) => Number(m.achievement ?? 0) >= 100).length} at or above target`} />
            <Stat label="Field reports" value={data.field_reports ?? 0} icon={MapPin} hint={`${data.open_risks ?? 0} open risks`} />
          </>
        ) : (
          <>
            <Stat label="Projects" value={projects.length} icon={CalendarClock} />
            <Stat label="Average progress" value={`${projects.length ? Math.round(projects.reduce((sum, p) => sum + Number(p.percent_complete ?? 0), 0) / projects.length) : 0}%`} icon={Gauge} />
            <Stat label="KPIs tracked" value={measures.length} icon={Target} />
            <Stat label="Performance score" value={header?.performance_score ?? "—"} icon={Target} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> {scope === "project" ? "Activity progress" : "Project progress"}</CardTitle></CardHeader>
          <CardContent>
            {(scope === "project" ? activityChart : projectChart).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{scope === "project" ? "No activities planned yet." : "No projects under this programme yet."}</p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scope === "project" ? activityChart : projectChart} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip />
                    <Bar dataKey="progress" name="% complete" radius={[2, 2, 0, 0]}>
                      {(scope === "project" ? activityChart : projectChart).map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.overdue ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <BudgetCard budget={data.budget} />
      </div>

      <KpiChart measures={measures} />

      {scope === "project" && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /> Spending over time</CardTitle></CardHeader>
          <CardContent>
            {spend.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No spending recorded against this project yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={spend.map((row) => ({ month: monthLabel(row.month), amount: Number(row.amount ?? 0) }))} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="amount" name={`Spent (${CURRENCY})`} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <KpiTable measures={measures} />

      {scope === "project" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Activity schedule</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead><tr className="border-b bg-muted/40 text-left"><th className="px-4 py-3 font-medium text-muted-foreground">Activity</th><th className="px-4 py-3 font-medium text-muted-foreground">Window</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Progress</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost</th></tr></thead>
                  <tbody>
                    {activities.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No activities recorded.</td></tr> : activities.map((activity) => (
                      <tr key={activity.id} className="border-b last:border-0">
                        <td className="px-4 py-3"><p className="font-medium">{activity.name}</p><p className="text-xs text-muted-foreground">{titleCase(activity.status)}</p></td>
                        <td className="px-4 py-3">{formatDate(activity.planned_start)} – <span className={activity.overdue ? "font-medium text-destructive" : ""}>{formatDate(activity.planned_end)}</span>{activity.overdue && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-destructive" aria-label="Overdue" />}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Math.round(Number(activity.percent_complete ?? 0))}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(activity.actual_cost)} / {money(activity.planned_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Milestones</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones set.</p> : milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <div><p className="text-sm font-medium">{milestone.name}</p><p className="text-xs text-muted-foreground">Due {formatDate(milestone.due_date)}{milestone.achieved_date ? ` · achieved ${formatDate(milestone.achieved_date)}` : ""}</p></div>
                  <Badge variant={milestone.achieved_date ? "secondary" : String(milestone.criticality) === "high" ? "destructive" : "outline"}>{titleCase(milestone.status) || (milestone.achieved_date ? "Achieved" : "Pending")}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {scope === "program" && (
        <Card>
          <CardHeader><CardTitle>Projects in this programme</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead><tr className="border-b bg-muted/40 text-left"><th className="px-4 py-3 font-medium text-muted-foreground">Project</th><th className="px-4 py-3 font-medium text-muted-foreground">Status</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Progress</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Budget</th><th className="px-4 py-3 text-right font-medium text-muted-foreground">Spent</th></tr></thead>
                <tbody>
                  {projects.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No projects linked.</td></tr> : projects.map((project) => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-4 py-3"><p className="font-medium">{project.name}</p><p className="text-xs text-muted-foreground">{project.ref_code} · {project.activities} activities</p></td>
                      <td className="px-4 py-3"><Badge variant={String(project.health).includes("critical") ? "destructive" : "secondary"}>{titleCase(project.status)}</Badge></td>
                      <td className="px-4 py-3 text-right tabular-nums">{Math.round(Number(project.percent_complete ?? 0))}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(project.budget)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(project.spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
