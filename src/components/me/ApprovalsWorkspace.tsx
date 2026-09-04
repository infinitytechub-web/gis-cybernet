import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CornerDownLeft,
  FolderKanban,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/date-format";
import { toast } from "sonner";
import { ApprovalDecisionDialog, type ApprovalItem } from "./ApprovalDecisionDialog";

const db = supabase as any;

type QueueFilter = "open" | "approved" | "rejected" | "returned";

type Step = {
  step_order: number;
  step_role: string | null;
  action: string | null;
  comment: string | null;
  acted_at: string | null;
  approver_name: string | null;
};

type QueueRow = ApprovalItem & { steps?: Step[] | null; record_status?: string | null; created_at?: string | null; completed_at?: string | null };

type ApprovedRecord = {
  approval_id: string;
  record_type: string;
  record_id: string;
  name: string | null;
  ref_code: string | null;
  region: string | null;
  percent_complete: number | null;
  record_status: string | null;
  approved_at: string | null;
  requested_by_name: string | null;
  final_comment: string | null;
};

type Decision = {
  approval_id: string;
  record_type: string;
  record_name: string | null;
  step_order: number;
  step_role: string | null;
  action: string | null;
  comment: string | null;
  acted_at: string | null;
  approver_name: string | null;
};

type Summary = {
  counts?: { pending?: number; approved?: number; rejected?: number; returned?: number; overdue?: number };
  by_type?: Array<{ record_type: string; pending: number; approved: number; rejected: number; returned: number }>;
  approved_records?: ApprovedRecord[];
  recent_decisions?: Decision[];
};

const typeLabels: Record<string, string> = {
  objective: "Objective",
  program: "Programme",
  project: "Project",
  budget: "Budget",
  resource: "Resource",
  procurement: "Procurement",
};

const recordLink = (recordType: string) =>
  recordType === "objective" ? "/me/objectives" : recordType === "program" ? "/me/programs" : recordType === "project" ? "/me/projects" : recordType === "budget" ? "/me/budgets" : recordType === "resource" ? "/me/resources" : "/me/approvals";

function ActionBadge({ action }: { action: string | null }) {
  const label = action ?? "pending";
  const variant = label === "reject" || label === "rejected" ? "destructive" : "secondary";
  return <Badge variant={variant} className="capitalize">{label}</Badge>;
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CheckCircle2; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`text-2xl font-semibold ${tone === "danger" && value > 0 ? "text-destructive" : ""}`}>{value}</p>
        </div>
        <div className={`rounded-md p-2 ${tone === "danger" && value > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}

export function ApprovalsWorkspace() {
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const loadQueue = async (status: QueueFilter) => {
    const { data, error } = await db.rpc("me_approval_queue", { _status: status });
    if (error) { toast.error(error.message); return; }
    setRows(Array.isArray(data) ? data : []);
  };

  const loadSummary = async () => {
    const { data, error } = await db.rpc("me_approved_dashboard");
    if (error) { toast.error(error.message); return; }
    setSummary((data as Summary) ?? null);
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadQueue(filter), loadSummary()]);
    setLoading(false);
  };

  useEffect(() => { void loadAll(); }, [filter]);

  const counts = summary?.counts ?? {};
  const chartData = useMemo(
    () => (summary?.by_type ?? []).map((item) => ({
      name: typeLabels[item.record_type] ?? item.record_type,
      Approved: Number(item.approved ?? 0),
      Pending: Number(item.pending ?? 0),
      Rejected: Number(item.rejected ?? 0),
      Returned: Number(item.returned ?? 0),
    })),
    [summary],
  );

  const approvedRecords = summary?.approved_records ?? [];
  const visibleApproved = useMemo(
    () => approvedRecords.filter((record) => {
      const matchesType = typeFilter === "all" || record.record_type === typeFilter;
      const term = search.trim().toLowerCase();
      const matchesSearch = !term || [record.name, record.ref_code, record.region, record.requested_by_name].some((value) => String(value ?? "").toLowerCase().includes(term));
      return matchesType && matchesSearch;
    }),
    [approvedRecords, typeFilter, search],
  );

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => !term || [row.record_name, row.record_type, row.requested_by_name].some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-medium text-primary">Governance and assurance</p>
            <h1 className="text-2xl font-bold tracking-tight">M&amp;E Approvals</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review submissions step by step, record a decision with a written reason, and see everything already approved.</p>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => void loadAll()} aria-label="Refresh approvals"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Awaiting decision" value={Number(counts.pending ?? 0)} icon={Clock3} />
        <Stat label="Overdue" value={Number(counts.overdue ?? 0)} icon={Clock3} tone="danger" />
        <Stat label="Approved" value={Number(counts.approved ?? 0)} icon={CheckCircle2} />
        <Stat label="Rejected" value={Number(counts.rejected ?? 0)} icon={XCircle} tone="danger" />
        <Stat label="Returned" value={Number(counts.returned ?? 0)} icon={CornerDownLeft} />
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Approval queue</TabsTrigger>
          <TabsTrigger value="approved">Approved dashboard</TabsTrigger>
          <TabsTrigger value="log">Decision log</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approval status">
              {(["open", "approved", "rejected", "returned"] as QueueFilter[]).map((item) => (
                <Button key={item} variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)} className="capitalize">{item}</Button>
              ))}
            </div>
            <Input className="max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by record or requester…" aria-label="Search approvals" />
          </div>
          <Card>
            <CardHeader><CardTitle>{filter === "open" ? "Open approvals" : `${filter.charAt(0).toUpperCase()}${filter.slice(1)} approvals`}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Record</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Stage</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Requested by</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Due</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading approvals…</td></tr>
                    ) : filteredQueue.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No approvals in this view.</td></tr>
                    ) : filteredQueue.map((row) => {
                      const steps = Array.isArray(row.steps) ? row.steps : [];
                      const isOpen = expanded === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <p className="font-medium">{row.record_name ?? "Unnamed record"}</p>
                              <p className="text-xs text-muted-foreground">{typeLabels[row.record_type] ?? row.record_type} · {row.record_status ?? row.status}</p>
                            </td>
                            <td className="px-4 py-3"><Badge variant="secondary">Step {row.current_step ?? 1} of {row.total_steps ?? 1}</Badge></td>
                            <td className="px-4 py-3">{row.requested_by_name ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={row.overdue ? "font-medium text-destructive" : ""}>{formatDate(row.due_date)}</span>
                              {row.overdue && <Clock3 className="ml-1 inline h-3.5 w-3.5" aria-label="Overdue" />}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : row.id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} decision history`}>
                                  <MessageSquare className="mr-1 h-4 w-4" />{steps.filter((step) => step.comment).length}
                                  {isOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                                </Button>
                                {filter === "open" && row.can_decide ? (
                                  <Button size="sm" onClick={() => setSelected(row)}><CheckCircle2 className="mr-2 h-4 w-4" /> Review</Button>
                                ) : (
                                  <span className="self-center text-xs text-muted-foreground">Recorded</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b bg-muted/20 last:border-0">
                              <td colSpan={5} className="px-4 py-4">
                                {steps.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
                                ) : (
                                  <ol className="space-y-3">
                                    {steps.map((step) => (
                                      <li key={`${row.id}-${step.step_order}`} className="rounded-md border bg-background p-3">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                          <span className="font-medium">Step {step.step_order}</span>
                                          <Badge variant="secondary" className="capitalize">{step.step_role ?? "reviewer"}</Badge>
                                          <ActionBadge action={step.action} />
                                          <span className="text-muted-foreground">{step.approver_name ?? "Awaiting reviewer"}</span>
                                          <span className="ml-auto text-xs text-muted-foreground">{step.acted_at ? formatDate(step.acted_at) : "—"}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-muted-foreground">{step.comment ?? "No comment recorded."}</p>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Decisions by record type</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No approvals recorded yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <ChartTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--card-foreground))" }} />
                      <Legend />
                      <Bar dataKey="Approved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pending" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Returned" fill="hsl(var(--secondary-foreground))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Rejected" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            {["all", "objective", "program", "project"].map((item) => (
              <Button key={item} variant={typeFilter === item ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(item)}>
                {item === "all" ? "All approved" : `${typeLabels[item] ?? item}s`}
              </Button>
            ))}
            <Input className="max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search approved records…" aria-label="Search approved records" />
          </div>

          <Card>
            <CardHeader><CardTitle>Approved objectives, programmes and projects</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Record</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Region</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Progress</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Approved</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Closing comment</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading approved records…</td></tr>
                    ) : visibleApproved.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nothing approved in this view yet.</td></tr>
                    ) : visibleApproved.map((record) => (
                      <tr key={record.approval_id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{record.name ?? "Unnamed record"}</p>
                          <p className="text-xs text-muted-foreground">{record.ref_code ?? "No reference"} · requested by {record.requested_by_name ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="gap-1">
                            {record.record_type === "objective" ? <Target className="h-3 w-3" /> : <FolderKanban className="h-3 w-3" />}
                            {typeLabels[record.record_type] ?? record.record_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{record.region ?? "—"}</td>
                        <td className="px-4 py-3">
                          {record.percent_complete === null || record.percent_complete === undefined ? (
                            <span className="text-muted-foreground">{record.record_status ?? "—"}</span>
                          ) : (
                            <div className="min-w-[120px]">
                              <div className="h-2 w-full rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, Number(record.percent_complete)))}%` }} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{Number(record.percent_complete)}%</p>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{formatDate(record.approved_at)}</td>
                        <td className="max-w-[240px] px-4 py-3 text-muted-foreground"><span className="line-clamp-2">{record.final_comment ?? "—"}</span></td>
                        <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="outline"><Link to={recordLink(record.record_type)}>Open</Link></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardHeader><CardTitle>Recent decisions and comments</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading decisions…</p>
              ) : (summary?.recent_decisions ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (summary?.recent_decisions ?? []).map((decision) => (
                <div key={`${decision.approval_id}-${decision.step_order}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{decision.record_name ?? "Unnamed record"}</span>
                    <Badge variant="secondary">{typeLabels[decision.record_type] ?? decision.record_type}</Badge>
                    <ActionBadge action={decision.action} />
                    <span className="text-muted-foreground">Step {decision.step_order} · {decision.step_role ?? "reviewer"} · {decision.approver_name ?? "—"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(decision.acted_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{decision.comment ?? "No comment recorded."}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ApprovalDecisionDialog
        approval={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onCompleted={() => void loadAll()}
      />
    </div>
  );
}
