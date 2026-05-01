import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Shield, Gavel, FileWarning, BarChart3, Users, Clock, ArrowRightCircle, CheckCircle2, XCircle, Search, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  high: "bg-red-600 text-white",
};

const STATUS_LABEL: Record<string, string> = {
  pending_ipse: "Pending IPSE",
  forwarded_to_2ic: "With 2IC",
  forwarded_to_oic: "With OIC",
  approved: "Approved",
  rejected: "Returned",
};

const OLIVE_PALETTE = ["#556B2F", "#6B8E23", "#808000", "#9ACD32", "#BDB76B", "#8FBC8F"];

export default function Ipse() {
  const { user, isAdmin, isIpse, is2ic, isOic } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [decision, setDecision] = useState<{ report: any; action: "forward_2ic" | "forward_oic" | "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<string>("");
  const [drillStaffId, setDrillStaffId] = useState<string>("");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: "", severity: "", ipse_comment: "" });
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  // Realtime
  useEffect(() => {
    const ch = supabase.channel("ipse-rt");
    ch.on("postgres_changes", { event: "*", schema: "public", table: "report_uploads" }, () => {
      qc.invalidateQueries({ queryKey: ["ipse-reports"] });
      qc.invalidateQueries({ queryKey: ["ipse-analytics"] });
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: reports = [] } = useQuery({
    queryKey: ["ipse-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_uploads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sanctions = [] } = useQuery({
    queryKey: ["ipse-sanctions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipse_sanctions" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["ipse-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, staff_id, departments(name)")
        .eq("status", "active")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // IPSE staff (supervisor + deputy) — for direct dashboard linkage
  const { data: ipseUserIds = [] } = useQuery({
    queryKey: ["ipse-staff-user-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["ipse_supervisor", "ipse_deputy_supervisor"]);
      if (error) throw error;
      return (data || []).map((r: any) => r.user_id);
    },
  });
  const ipseUserIdSet = useMemo(() => new Set(ipseUserIds), [ipseUserIds]);

  // Analytics
  const analytics = useMemo(() => {
    const total = reports.length;
    const bySeverity = { low: 0, medium: 0, high: 0, none: 0 };
    const byStatus: Record<string, number> = { pending_ipse: 0, forwarded_to_2ic: 0, forwarded_to_oic: 0, approved: 0, rejected: 0 };
    const submitterCount: Record<string, number> = {};
    const trend: Record<string, number> = {};

    reports.forEach((r: any) => {
      bySeverity[(r.severity as keyof typeof bySeverity) || "none"]++;
      byStatus[r.ipse_status || "pending_ipse"] = (byStatus[r.ipse_status || "pending_ipse"] ?? 0) + 1;
      const sb = r.submitted_by || r.uploaded_by || "unknown";
      submitterCount[sb] = (submitterCount[sb] ?? 0) + 1;
      const day = format(new Date(r.created_at), "dd MMM");
      trend[day] = (trend[day] ?? 0) + 1;
    });

    // Resolution time avg (created → approved/rejected)
    const resolved = reports.filter((r: any) => r.ipse_reviewed_at);
    const avgIpseHours = resolved.length
      ? Math.round((resolved.reduce((a: number, r: any) => a + (new Date(r.ipse_reviewed_at).getTime() - new Date(r.created_at).getTime()) / 36e5, 0) / resolved.length) * 10) / 10
      : 0;

    const topOffenders = Object.entries(submitterCount)
      .map(([id, count]) => {
        const p: any = (profiles as any[]).find((pp) => pp.user_id === id);
        return {
          id,
          name: p ? `${p.last_name}, ${p.first_name}` : "Unknown",
          staff_id: p?.staff_id ?? "—",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // IPSE-submitted reports (direct dashboard linkage)
    const ipseSubmissions = reports.filter((r: any) => {
      const sb = r.submitted_by || r.uploaded_by;
      return sb && ipseUserIdSet.has(sb);
    });
    const ipseBySeverity = { low: 0, medium: 0, high: 0, none: 0 };
    const ipseByStatus: Record<string, number> = { pending_ipse: 0, forwarded_to_2ic: 0, forwarded_to_oic: 0, approved: 0, rejected: 0 };
    ipseSubmissions.forEach((r: any) => {
      ipseBySeverity[(r.severity as keyof typeof ipseBySeverity) || "none"]++;
      ipseByStatus[r.ipse_status || "pending_ipse"] = (ipseByStatus[r.ipse_status || "pending_ipse"] ?? 0) + 1;
    });

    return {
      total,
      bySeverity,
      byStatus,
      avgIpseHours,
      trend: Object.entries(trend).slice(-14).map(([day, count]) => ({ day, count })),
      topOffenders,
      severityChart: [
        { name: "Low", value: bySeverity.low, color: "#3B82F6" },
        { name: "Medium", value: bySeverity.medium, color: "#F59E0B" },
        { name: "High", value: bySeverity.high, color: "#DC2626" },
      ].filter((x) => x.value > 0),
      ipseSubmissions,
      ipseTotal: ipseSubmissions.length,
      ipseBySeverity,
      ipseByStatus,
    };
  }, [reports, profiles, ipseUserIdSet]);

  const drillReports = useMemo(() => {
    if (!drillStaffId) return [];
    return (reports as any[]).filter((r) => r.submitted_by === drillStaffId || r.uploaded_by === drillStaffId);
  }, [reports, drillStaffId]);

  // Mutations
  const decideMutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("No decision");
      const { report, action } = decision;
      const updates: any = {};
      if (action === "forward_2ic") {
        if (!severity) throw new Error("Pick a severity level");
        updates.severity = severity;
        updates.ipse_status = "forwarded_to_2ic";
        updates.ipse_comment = comment.trim() || null;
        updates.forwarded_to = "2ic";
      } else if (action === "forward_oic") {
        updates.ipse_status = "forwarded_to_oic";
        updates.two_ic_comment = comment.trim() || null;
        updates.forwarded_to = "oic";
      } else if (action === "approve") {
        updates.ipse_status = "approved";
      } else if (action === "reject") {
        if (!comment.trim()) throw new Error("Comment required when returning a report");
        updates.ipse_status = "rejected";
        updates.review_comment = comment.trim();
      }
      const { error } = await supabase.from("report_uploads").update(updates).eq("id", report.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ipse-reports"] });
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report updated");
      setDecision(null);
      setComment("");
      setSeverity("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("No report");
      if (!editForm.title.trim()) throw new Error("Title required");
      const updates: any = {
        title: editForm.title.trim(),
        severity: editForm.severity || null,
        ipse_comment: editForm.ipse_comment.trim() || null,
      };
      const { error } = await supabase.from("report_uploads").update(updates).eq("id", editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ipse-reports"] });
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report updated");
      setEditTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error("No report");
      await softDelete({
        table: "report_uploads",
        id: deleteTarget.id,
        label: deleteTarget.title || "Report",
        storagePaths: deleteTarget.file_path ? [{ bucket: "reports", path: deleteTarget.file_path }] : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ipse-reports"] });
      qc.invalidateQueries({ queryKey: ["report-uploads"] });
      toast.success("Report deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canActIpse = isAdmin || isIpse;
  const canAct2ic = isAdmin || is2ic;
  const canActOic = isAdmin || isOic;
  const canManage = isAdmin || isIpse;

  return (
    <div className="space-y-4">
      {/* Hero header with gradient */}
      <div className="relative overflow-hidden rounded-xl border border-[hsl(82,40%,30%)]/20 bg-gradient-to-r from-[hsl(82,40%,30%)] via-[hsl(82,35%,38%)] to-[hsl(195,55%,35%)] p-5 shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="rounded-lg bg-white/15 backdrop-blur p-2.5 ring-1 ring-white/20">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight">IPSE</h1>
            <p className="text-xs text-white/80">Immigration Professional Standards & Ethics</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto bg-muted/60 p-1">
          <TabsTrigger value="dashboard" className="gap-1.5 data-[state=active]:bg-[hsl(82,40%,30%)] data-[state=active]:text-white"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="triage" className="gap-1.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white"><FileWarning className="h-4 w-4" /> Reports Triage</TabsTrigger>
          <TabsTrigger value="sanctions" className="gap-1.5 data-[state=active]:bg-rose-700 data-[state=active]:text-white"><Gavel className="h-4 w-4" /> Sanctions Reference</TabsTrigger>
          <TabsTrigger value="drilldown" className="gap-1.5 data-[state=active]:bg-sky-700 data-[state=active]:text-white"><Search className="h-4 w-4" /> Officer Drill-down</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="border-l-4 border-l-[hsl(82,40%,30%)]"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total reports</div><div className="text-2xl font-bold text-[hsl(82,40%,30%)] dark:text-[hsl(82,50%,65%)]">{analytics.total}</div></CardContent></Card>
            <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending IPSE</div><div className="text-2xl font-bold text-amber-600">{analytics.byStatus.pending_ipse ?? 0}</div></CardContent></Card>
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="text-xs text-muted-foreground">With 2IC</div><div className="text-2xl font-bold text-blue-600">{analytics.byStatus.forwarded_to_2ic ?? 0}</div></CardContent></Card>
            <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="text-xs text-muted-foreground">With OIC</div><div className="text-2xl font-bold text-purple-600">{analytics.byStatus.forwarded_to_oic ?? 0}</div></CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg IPSE response (h)</div><div className="text-2xl font-bold text-emerald-600">{analytics.avgIpseHours}</div></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-t-4 border-t-rose-500">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /> Severity breakdown</CardTitle></CardHeader>
              <CardContent>
                {analytics.severityChart.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No triaged reports yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={analytics.severityChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {analytics.severityChart.map((d, i) => (<Cell key={i} fill={d.color} />))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-[hsl(82,40%,30%)]">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[hsl(82,40%,30%)]" /> Submission trend (last 14 entries)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={analytics.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#556B2F" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* IPSE Unit submissions — direct linkage from Reports dashboard */}
          <Card className="border-t-4 border-t-[hsl(82,40%,30%)]">
            <CardHeader className="pb-2 bg-[hsl(82,40%,30%)]/5 rounded-t-lg">
              <CardTitle className="text-sm flex items-center gap-2 text-[hsl(82,40%,25%)] dark:text-[hsl(82,50%,70%)]">
                <Shield className="h-4 w-4" /> IPSE Unit submissions
              </CardTitle>
              <CardDescription className="text-xs">
                Reports submitted directly by the IPSE Supervisor and Deputy IPSE Supervisor — captured automatically into IPSE analytics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border p-2 bg-[hsl(82,40%,30%)]/5">
                  <div className="text-[11px] text-muted-foreground">Total submitted</div>
                  <div className="text-xl font-bold text-[hsl(82,40%,30%)] dark:text-[hsl(82,50%,65%)]">{analytics.ipseTotal}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">High severity</div>
                  <div className="text-xl font-bold text-red-600">{analytics.ipseBySeverity.high}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Approved</div>
                  <div className="text-xl font-bold text-emerald-600">{analytics.ipseByStatus.approved ?? 0}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">In workflow</div>
                  <div className="text-xl font-bold text-amber-600">
                    {(analytics.ipseByStatus.pending_ipse ?? 0) + (analytics.ipseByStatus.forwarded_to_2ic ?? 0) + (analytics.ipseByStatus.forwarded_to_oic ?? 0)}
                  </div>
                </div>
              </div>

              {analytics.ipseSubmissions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No reports submitted by IPSE staff yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Submitter</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.ipseSubmissions.slice(0, 8).map((r: any) => {
                      const sb = r.submitted_by || r.uploaded_by;
                      const p: any = (profiles as any[]).find((pp) => pp.user_id === sb);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell className="font-medium text-xs">{r.title}</TableCell>
                          <TableCell className="text-xs">{p ? `${p.last_name}, ${p.first_name}` : "—"}</TableCell>
                          <TableCell>
                            {r.severity ? <Badge className={SEVERITY_BADGE[r.severity] || ""}>{r.severity}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{STATUS_LABEL[r.ipse_status || "pending_ipse"]}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-sky-600">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-600" /> Top reported officers</CardTitle></CardHeader>
            <CardContent>
              {analytics.topOffenders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Staff ID</TableHead><TableHead className="text-right">Reports</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {analytics.topOffenders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-sky-50/60 dark:hover:bg-sky-950/20" onClick={() => { setDrillStaffId(o.id); setTab("drilldown"); }}>
                        <TableCell className="font-medium">{o.name}</TableCell>
                        <TableCell className="text-xs">{o.staff_id}</TableCell>
                        <TableCell className="text-right"><Badge className="bg-sky-600 hover:bg-sky-700">{o.count}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRIAGE */}
        <TabsContent value="triage" className="space-y-3">
          <Card className="border-t-4 border-t-amber-500">
            <CardHeader className="pb-2 bg-amber-50/50 dark:bg-amber-950/20 rounded-t-lg"><CardTitle className="text-sm flex items-center gap-2 text-amber-900 dark:text-amber-200"><FileWarning className="h-4 w-4" /> Active reports queue</CardTitle><CardDescription className="text-xs">IPSE assigns severity → forwards to 2IC → 2IC forwards to OIC → OIC issues final approval.</CardDescription></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.filter((r: any) => r.ipse_status !== "approved" && r.ipse_status !== "rejected").length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">No active reports.</TableCell></TableRow>
                    )}
                    {reports.filter((r: any) => r.ipse_status !== "approved" && r.ipse_status !== "rejected").map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.title}</TableCell>
                        <TableCell className="text-xs">{format(new Date(r.report_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>{r.severity ? <Badge className={SEVERITY_BADGE[r.severity]}>{r.severity.toUpperCase()}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell><Badge variant="outline">{STATUS_LABEL[r.ipse_status] ?? r.ipse_status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {r.ipse_status === "pending_ipse" && canActIpse && (
                              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => { setDecision({ report: r, action: "forward_2ic" }); setSeverity(r.severity ?? ""); setComment(""); }}>
                                <ArrowRightCircle className="h-3.5 w-3.5" /> Forward to 2IC
                              </Button>
                            )}
                            {r.ipse_status === "forwarded_to_2ic" && canAct2ic && (
                              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => { setDecision({ report: r, action: "forward_oic" }); setComment(""); }}>
                                <ArrowRightCircle className="h-3.5 w-3.5" /> Forward to OIC
                              </Button>
                            )}
                            {r.ipse_status === "forwarded_to_oic" && canActOic && (
                              <Button size="sm" className="gap-1 h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setDecision({ report: r, action: "approve" }); setComment(""); }}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </Button>
                            )}
                            {(canActIpse || canAct2ic || canActOic) && (
                              <Button size="sm" variant="outline" className="gap-1 h-7 text-destructive" onClick={() => { setDecision({ report: r, action: "reject" }); setComment(""); }}>
                                <XCircle className="h-3.5 w-3.5" /> Return
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => { setEditTarget(r); setEditForm({ title: r.title ?? "", severity: r.severity ?? "", ipse_comment: r.ipse_comment ?? "" }); }}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="outline" className="gap-1 h-7 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setDeleteTarget(r)}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SANCTIONS */}
        <TabsContent value="sanctions">
          <Card className="border-t-4 border-t-rose-700">
            <CardHeader className="bg-rose-50/50 dark:bg-rose-950/20 rounded-t-lg"><CardTitle className="text-sm flex items-center gap-2 text-rose-900 dark:text-rose-200"><Gavel className="h-4 w-4" /> Severity-of-Sanction Reference</CardTitle><CardDescription>Official scale used by IPSE before forwarding any report up the chain.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Description</TableHead><TableHead>Recommended action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sanctions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><Badge className={SEVERITY_BADGE[s.code]}>{s.label}</Badge></TableCell>
                      <TableCell className="text-sm">{s.description}</TableCell>
                      <TableCell className="text-sm">{s.recommended_action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DRILL-DOWN */}
        <TabsContent value="drilldown" className="space-y-3">
          <Card className="border-t-4 border-t-sky-700">
            <CardHeader className="pb-2 bg-sky-50/50 dark:bg-sky-950/20 rounded-t-lg">
              <CardTitle className="text-sm flex items-center gap-2 text-sky-900 dark:text-sky-200"><Search className="h-4 w-4" /> Per-officer report history</CardTitle>
              <CardDescription className="text-xs">Search by first name, surname or staff ID to view that officer's full IPSE history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="max-w-md">
                <StaffCombobox
                  staff={(profiles as any[]).map((p) => ({
                    id: p.user_id ?? p.id,
                    first_name: p.first_name,
                    last_name: p.last_name,
                    staff_id: p.staff_id ?? "—",
                  }))}
                  value={drillStaffId}
                  onValueChange={setDrillStaffId}
                  placeholder="Search and select an officer…"
                  includeAllOption
                  allOptionLabel="Clear selection"
                />
              </div>

              {drillStaffId && (
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Date</TableHead><TableHead>Severity</TableHead><TableHead>Stage</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {drillReports.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No reports for this officer.</TableCell></TableRow>}
                    {drillReports.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.title}</TableCell>
                        <TableCell className="text-xs">{format(new Date(r.report_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>{r.severity ? <Badge className={SEVERITY_BADGE[r.severity]}>{r.severity.toUpperCase()}</Badge> : "—"}</TableCell>
                        <TableCell><Badge variant="outline">{STATUS_LABEL[r.ipse_status] ?? r.ipse_status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Decision dialog */}
      <Dialog open={!!decision} onOpenChange={(o) => { if (!o) { setDecision(null); setComment(""); setSeverity(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "forward_2ic" && "Assign severity & forward to 2IC"}
              {decision?.action === "forward_oic" && "Forward to OIC"}
              {decision?.action === "approve" && "Final OIC approval"}
              {decision?.action === "reject" && "Return report"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm"><strong>{decision?.report?.title}</strong></p>
            {decision?.action === "forward_2ic" && (
              <div>
                <label className="text-sm font-medium">Severity *</label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue placeholder="Pick severity level" /></SelectTrigger>
                  <SelectContent>
                    {sanctions.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.label} — {s.recommended_action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{decision?.action === "reject" ? "Reason *" : "Comment (optional)"}</label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              variant={decision?.action === "reject" ? "destructive" : "default"}
              disabled={decideMutation.isPending || (decision?.action === "forward_2ic" && !severity) || (decision?.action === "reject" && !comment.trim())}
              onClick={() => decideMutation.mutate()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Severity</label>
              <Select value={editForm.severity || "none"} onValueChange={(v) => setEditForm({ ...editForm, severity: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No severity</SelectItem>
                  {sanctions.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">IPSE comment</label>
              <Textarea rows={3} value={editForm.ipse_comment} onChange={(e) => setEditForm({ ...editForm, ipse_comment: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !editForm.title.trim()}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently removed along with its uploaded file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
