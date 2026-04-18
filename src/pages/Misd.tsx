import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExportMenu } from "@/components/ui/export-menu";
import {
  Shield, AlertTriangle, Bug, Eye, FolderSearch, BarChart3, Plus, Activity,
  Lock, ShieldAlert, Crosshair, FileText, TrendingUp, Clock, CheckCircle2, Printer, Users,
} from "lucide-react";
import { OrgStructureTab } from "@/components/misd/OrgStructureTab";
import { toast } from "sonner";
import { format, subDays, differenceInDays } from "date-fns";

const safeFormat = (v: any, fmt: string, fallback = "-") => {
  if (!v) return fallback;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? fallback : format(d, fmt);
};
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  medium: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
  critical: "bg-red-600 text-white",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
  investigating: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  contained: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  closed: "bg-muted text-muted-foreground",
};

const INCIDENT_TYPES = ["phishing", "malware", "fraud", "data_breach", "unauthorized_access", "ddos", "social_engineering", "other"];
const CASE_TYPES = ["fraud", "identity_theft", "cyber_harassment", "financial_crime", "data_breach", "intellectual_property", "other"];
const INDICATOR_TYPES = ["ip", "domain", "email", "url", "hash", "phone", "account"];

const NAVY_PALETTE = ["#0B2447", "#19376D", "#1E3A8A", "#0E7490", "#22D3EE", "#67E8F9", "#A5F3FC", "#CFFAFE"];

const MisdBadge = () => (
  <Badge className="bg-blue-900 text-cyan-200 hover:bg-blue-900 text-[9px] px-1.5 py-0 h-4 font-bold tracking-wider">MISD</Badge>
);

export default function Misd() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const canManage = ["admin", "oic", "2ic"].includes(role || "");
  const canCreate = canManage || ["supervisor", "shift_supervisor", "deputy_shift_supervisor"].includes(role || "");

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("misd-rt");
    ["cyber_incidents", "cyber_threat_intel", "cyber_investigations"].forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: [t] });
        qc.invalidateQueries({ queryKey: ["misd-analytics"] });
      })
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Shield className="h-7 w-7 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-900 to-cyan-700 dark:from-cyan-300 dark:to-blue-400 bg-clip-text text-transparent">
              MISD / CYBER
            </h1>
            <p className="text-sm text-muted-foreground">Cybersecurity Operations Centre — Incidents, Threat Intel & Investigations · Managed by MISD</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/50 p-1">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200 data-[state=active]:shadow-md">
            <BarChart3 className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Dashboard
          </TabsTrigger>
          <TabsTrigger value="structure" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200">
            <Users className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Org Structure
          </TabsTrigger>
          <TabsTrigger value="incidents" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200">
            <ShieldAlert className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Incidents
          </TabsTrigger>
          <TabsTrigger value="intel" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200">
            <Eye className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Threat Intel
          </TabsTrigger>
          <TabsTrigger value="investigations" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200">
            <FolderSearch className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Investigations
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-blue-900 data-[state=active]:text-cyan-200">
            <FileText className="h-4 w-4 mr-1 text-blue-700 dark:text-cyan-300" />Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="structure"><OrgStructureTab /></TabsContent>
        <TabsContent value="incidents"><IncidentsTab canCreate={canCreate} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="intel"><ThreatIntelTab canCreate={canCreate} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="investigations"><InvestigationsTab canCreate={canCreate} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* =================== DASHBOARD =================== */
function DashboardTab() {
  const { data: incidents = [] } = useQuery({
    queryKey: ["cyber_incidents"],
    queryFn: async () => (await supabase.from("cyber_incidents").select("*").order("reported_at", { ascending: false })).data || [],
  });
  const { data: intel = [] } = useQuery({
    queryKey: ["cyber_threat_intel"],
    queryFn: async () => (await supabase.from("cyber_threat_intel").select("*")).data || [],
  });
  const { data: cases = [] } = useQuery({
    queryKey: ["cyber_investigations"],
    queryFn: async () => (await supabase.from("cyber_investigations").select("*")).data || [],
  });

  const kpis = useMemo(() => {
    const open = incidents.filter((i: any) => !["resolved", "closed"].includes(i.status)).length;
    const critical = incidents.filter((i: any) => i.severity === "critical" && !["resolved", "closed"].includes(i.status)).length;
    const resolved = incidents.filter((i: any) => i.resolved_at);
    const avgMttr = resolved.length > 0
      ? Math.round(resolved.reduce((s: number, r: any) => s + differenceInDays(new Date(r.resolved_at), new Date(r.reported_at)), 0) / resolved.length)
      : 0;
    const closureRate = incidents.length > 0
      ? Math.round((incidents.filter((i: any) => ["resolved", "closed"].includes(i.status)).length / incidents.length) * 100)
      : 0;
    return { open, critical, avgMttr, closureRate, activeIntel: intel.filter((i: any) => i.is_active).length, openCases: cases.filter((c: any) => !["closed", "resolved"].includes(c.status)).length };
  }, [incidents, intel, cases]);

  // Severity heatmap
  const severityData = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    incidents.forEach((i: any) => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  // Type distribution
  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    incidents.forEach((i: any) => { counts[i.incident_type] = (counts[i.incident_type] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [incidents]);

  // Trend (last 30 days)
  const trendData = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), 29 - i), "yyyy-MM-dd"));
    return days.map((d) => ({
      day: format(new Date(d), "dd MMM"),
      incidents: incidents.filter((i: any) => i.reported_at?.startsWith(d)).length,
      resolved: incidents.filter((i: any) => i.resolved_at?.startsWith(d)).length,
    }));
  }, [incidents]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="Open Incidents" value={kpis.open} icon={ShieldAlert} variant="cyan" />
        <KpiCard title="Critical" value={kpis.critical} icon={AlertTriangle} variant="red" />
        <KpiCard title="Avg MTTR (days)" value={kpis.avgMttr} icon={Clock} variant="navy" />
        <KpiCard title="Closure Rate" value={`${kpis.closureRate}%`} icon={CheckCircle2} variant="emerald" />
        <KpiCard title="Active IOCs" value={kpis.activeIntel} icon={Eye} variant="navy" />
        <KpiCard title="Open Cases" value={kpis.openCases} icon={FolderSearch} variant="cyan" />
      </div>

      {/* Critical alerts banner */}
      {kpis.critical > 0 && (
        <Card className="border-red-500 bg-red-50/60 dark:bg-red-950/30 animate-pulse">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-red-900 dark:text-red-200">
              {kpis.critical} CRITICAL incident{kpis.critical !== 1 ? "s" : ""} require immediate attention
            </span>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-700 dark:text-cyan-300" />Incident Trend (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" fontSize={10} interval={4} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="incidents" stroke="#1E3A8A" strokeWidth={2} name="New" />
                <Line type="monotone" dataKey="resolved" stroke="#22D3EE" strokeWidth={2} name="Resolved" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Bug className="h-4 w-4 text-blue-700 dark:text-cyan-300" />Incidents by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name} (${e.value})`} fontSize={10}>
                  {typeData.map((_, i) => <Cell key={i} fill={NAVY_PALETTE[i % NAVY_PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-cyan-600" />Severity Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.name === "critical" ? "#dc2626" :
                      entry.name === "high" ? "#ea580c" :
                      entry.name === "medium" ? "#0E7490" : "#1E3A8A"
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, variant }: { title: string; value: any; icon: any; variant: "navy" | "cyan" | "red" | "emerald" }) {
  const styles = {
    navy: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-300",
    cyan: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900 text-cyan-700 dark:text-cyan-300",
    red: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300",
  }[variant];
  return (
    <Card className={`border-2 ${styles}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-3">
        <CardTitle className="text-xs font-medium opacity-80">{title}</CardTitle>
        <Icon className="h-4 w-4" />
      </CardHeader>
      <CardContent className="px-3 pb-3"><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

/* =================== INCIDENTS =================== */
function IncidentsTab({ canCreate, canManage, userId }: { canCreate: boolean; canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSev, setFilterSev] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ title: "", description: "", incident_type: "phishing", severity: "medium", status: "open", source: "", affected_systems: "", impact_assessment: "", resolution_notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["cyber_incidents"],
    queryFn: async () => (await supabase.from("cyber_incidents").select("*").order("reported_at", { ascending: false })).data || [],
  });

  const filtered = items.filter((i: any) => {
    if (search && !`${i.title} ${i.incident_number} ${i.description || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterSev !== "all" && i.severity !== filterSev) return false;
    return true;
  });

  const openDialog = (item?: any) => {
    if (item) {
      setEditing(item);
      setForm({ ...item });
    } else {
      setEditing(null);
      setForm({ title: "", description: "", incident_type: "phishing", severity: "medium", status: "open", source: "", affected_systems: "", impact_assessment: "", resolution_notes: "" });
    }
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      if (editing) {
        const payload: any = { ...form };
        delete payload.id; delete payload.created_at; delete payload.updated_at;
        if (form.status === "resolved" && !editing.resolved_at) payload.resolved_at = new Date().toISOString();
        const { error } = await supabase.from("cyber_incidents").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const incident_number = `CYI-${format(new Date(), "yyyyMMdd-HHmmss")}`;
        const { error } = await supabase.from("cyber_incidents").insert({ ...form, incident_number, reported_by: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cyber_incidents"] }); setOpen(false); toast.success(editing ? "Updated" : "Incident logged"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["open", "investigating", "contained", "resolved", "closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSev} onValueChange={setFilterSev}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <ExportMenu getData={() => ({
          title: "Cyber Incidents",
          filename: `cyber-incidents-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Number", "Title", "Type", "Severity", "Status", "Reported", "Resolved"],
          rows: filtered.map((i: any) => [i.incident_number, i.title, i.incident_type, i.severity, i.status, safeFormat(i.reported_at, "yyyy-MM-dd"), safeFormat(i.resolved_at, "yyyy-MM-dd")]),
        })} />
        <Button variant="outline" size="icon" onClick={() => window.print()} title="Print"><Printer className="h-4 w-4" /></Button>
        {canCreate && <Button onClick={() => openDialog()} className="ml-auto bg-blue-900 hover:bg-blue-950 text-cyan-100"><Plus className="h-4 w-4 mr-1" />Log Incident</Button>}
      </div>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="bg-blue-50 dark:bg-blue-950/30">
                  <TableHead>Number</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Reported</TableHead>
                  {canCreate && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={canCreate ? 7 : 6} className="text-center py-6 text-muted-foreground">No incidents</TableCell></TableRow>
                ) : filtered.map((i: any) => (
                  <TableRow key={i.id} className={i.severity === "critical" && !["resolved", "closed"].includes(i.status) ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-mono text-xs">{i.incident_number}</TableCell>
                    <TableCell className="font-medium"><div className="flex items-center gap-1.5"><MisdBadge />{i.title}</div></TableCell>
                    <TableCell className="text-xs capitalize">{i.incident_type.replace("_", " ")}</TableCell>
                    <TableCell><Badge className={SEVERITY_COLORS[i.severity]}>{i.severity}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_COLORS[i.status]}>{i.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{safeFormat(i.reported_at, "dd MMM yyyy")}</TableCell>
                    {canCreate && <TableCell><Button variant="ghost" size="sm" onClick={() => openDialog(i)}>Open</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Incident — ${editing.incident_number}` : "Log New Incident"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Type</Label>
                <Select value={form.incident_type} onValueChange={(v) => setForm({ ...form, incident_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["open", "investigating", "contained", "resolved", "closed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Source</Label><Input value={form.source || ""} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. SIEM, user report" /></div>
              <div><Label>Affected systems</Label><Input value={form.affected_systems || ""} onChange={(e) => setForm({ ...form, affected_systems: e.target.value })} /></div>
            </div>
            <div><Label>Impact assessment</Label><Textarea rows={2} value={form.impact_assessment || ""} onChange={(e) => setForm({ ...form, impact_assessment: e.target.value })} /></div>
            {editing && <div><Label>Resolution notes</Label><Textarea rows={2} value={form.resolution_notes || ""} onChange={(e) => setForm({ ...form, resolution_notes: e.target.value })} /></div>}
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full bg-blue-900 hover:bg-blue-950 text-cyan-100">
              {save.isPending ? "Saving…" : editing ? "Update" : "Log Incident"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== THREAT INTEL =================== */
function ThreatIntelTab({ canCreate, canManage, userId }: { canCreate: boolean; canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ indicator_type: "ip", indicator_value: "", threat_level: "medium", category: "", description: "", source: "" });
  const [filter, setFilter] = useState("active");

  const { data: items = [] } = useQuery({
    queryKey: ["cyber_threat_intel"],
    queryFn: async () => (await supabase.from("cyber_threat_intel").select("*").order("first_seen", { ascending: false })).data || [],
  });

  const filtered = items.filter((i: any) => filter === "all" || (filter === "active" ? i.is_active : !i.is_active));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.indicator_value.trim()) throw new Error("Indicator value required");
      const { error } = await supabase.from("cyber_threat_intel").insert({ ...form, added_by: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cyber_threat_intel"] }); setOpen(false); toast.success("IOC added"); setForm({ indicator_type: "ip", indicator_value: "", threat_level: "medium", category: "", description: "", source: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("cyber_threat_intel").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cyber_threat_intel"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <ExportMenu getData={() => ({
          title: "Threat Intelligence",
          filename: `threat-intel-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Type", "Indicator", "Threat Level", "Category", "Active", "First Seen"],
          rows: filtered.map((i: any) => [i.indicator_type, i.indicator_value, i.threat_level, i.category || "-", i.is_active ? "Yes" : "No", safeFormat(i.first_seen, "yyyy-MM-dd")]),
        })} />
        <Button variant="outline" size="icon" onClick={() => window.print()} title="Print"><Printer className="h-4 w-4" /></Button>
        {canCreate && <Button onClick={() => setOpen(true)} className="ml-auto bg-blue-900 hover:bg-blue-950 text-cyan-100"><Plus className="h-4 w-4 mr-1" />Add IOC</Button>}
      </div>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="bg-blue-50 dark:bg-blue-950/30">
                  <TableHead>Type</TableHead><TableHead>Indicator</TableHead><TableHead>Threat Level</TableHead>
                  <TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>First Seen</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-6 text-muted-foreground">No indicators</TableCell></TableRow>
                ) : filtered.map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell><Badge variant="outline" className="uppercase border-blue-400 text-blue-700 dark:text-cyan-300">{i.indicator_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs break-all"><div className="flex items-center gap-1.5"><MisdBadge /><span>{i.indicator_value}</span></div></TableCell>
                    <TableCell><Badge className={SEVERITY_COLORS[i.threat_level]}>{i.threat_level}</Badge></TableCell>
                    <TableCell className="text-xs">{i.category || "—"}</TableCell>
                    <TableCell>{i.is_active ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{safeFormat(i.first_seen, "dd MMM yyyy")}</TableCell>
                    {canManage && <TableCell><Button variant="ghost" size="sm" onClick={() => toggle.mutate({ id: i.id, is_active: !i.is_active })}>{i.is_active ? "Deactivate" : "Activate"}</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Threat Indicator</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={form.indicator_type} onValueChange={(v) => setForm({ ...form, indicator_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INDICATOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Threat level</Label>
                <Select value={form.threat_level} onValueChange={(v) => setForm({ ...form, threat_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Indicator value *</Label><Input value={form.indicator_value} onChange={(e) => setForm({ ...form, indicator_value: e.target.value })} placeholder="e.g. 192.0.2.1, evil.example.com" /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. C2, phishing host" /></div>
            <div><Label>Source</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. internal, partner agency" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full bg-blue-900 hover:bg-blue-950 text-cyan-100">{save.isPending ? "Saving…" : "Add IOC"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== INVESTIGATIONS =================== */
function InvestigationsTab({ canCreate, canManage, userId }: { canCreate: boolean; canManage: boolean; userId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ title: "", description: "", case_type: "fraud", status: "open", priority: "medium", evidence_summary: "", suspects: "", referred_to_agency: "", outcome: "" });

  const { data: cases = [] } = useQuery({
    queryKey: ["cyber_investigations"],
    queryFn: async () => (await supabase.from("cyber_investigations").select("*").order("opened_at", { ascending: false })).data || [],
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ["cyber_incidents"],
    queryFn: async () => (await supabase.from("cyber_incidents").select("id, incident_number, title")).data || [],
  });

  const openDialog = (c?: any) => {
    if (c) { setEditing(c); setForm({ ...c }); }
    else { setEditing(null); setForm({ title: "", description: "", case_type: "fraud", status: "open", priority: "medium", evidence_summary: "", suspects: "", referred_to_agency: "", outcome: "" }); }
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      if (editing) {
        const payload: any = { ...form };
        delete payload.id; delete payload.created_at; delete payload.updated_at;
        if (form.status === "closed" && !editing.closed_at) payload.closed_at = new Date().toISOString();
        if (form.referred_to_agency && !editing.referred_at) payload.referred_at = new Date().toISOString();
        const { error } = await supabase.from("cyber_investigations").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const case_number = `CYC-${format(new Date(), "yyyyMMdd-HHmmss")}`;
        const { error } = await supabase.from("cyber_investigations").insert({ ...form, case_number, created_by: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cyber_investigations"] }); setOpen(false); toast.success(editing ? "Updated" : "Case opened"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <ExportMenu getData={() => ({
          title: "Cyber Investigations",
          filename: `investigations-${format(new Date(), "yyyy-MM-dd")}`,
          headers: ["Case #", "Title", "Type", "Status", "Priority", "Opened", "Referred"],
          rows: cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.priority, safeFormat(c.opened_at, "yyyy-MM-dd"), c.referred_to_agency || "-"]),
        })} />
        <Button variant="outline" size="icon" onClick={() => window.print()} title="Print"><Printer className="h-4 w-4" /></Button>
        {canCreate && <Button onClick={() => openDialog()} className="ml-auto bg-blue-900 hover:bg-blue-950 text-cyan-100"><Plus className="h-4 w-4 mr-1" />Open Case</Button>}
      </div>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="bg-blue-50 dark:bg-blue-950/30">
                  <TableHead>Case #</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead>
                  <TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Referred</TableHead>
                  {canCreate && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.length === 0 ? (
                  <TableRow><TableCell colSpan={canCreate ? 7 : 6} className="text-center py-6 text-muted-foreground">No cases</TableCell></TableRow>
                ) : cases.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.case_number}</TableCell>
                    <TableCell className="font-medium"><div className="flex items-center gap-1.5"><MisdBadge />{c.title}</div></TableCell>
                    <TableCell className="text-xs capitalize">{c.case_type.replace("_", " ")}</TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_COLORS[c.status]}>{c.status}</Badge></TableCell>
                    <TableCell><Badge className={SEVERITY_COLORS[c.priority]}>{c.priority}</Badge></TableCell>
                    <TableCell className="text-xs">{c.referred_to_agency || "—"}</TableCell>
                    {canCreate && <TableCell><Button variant="ghost" size="sm" onClick={() => openDialog(c)}>Open</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Case — ${editing.case_number}` : "Open New Case"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Type</Label>
                <Select value={form.case_type} onValueChange={(v) => setForm({ ...form, case_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CASE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["open", "investigating", "pending", "closed", "resolved"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Related incident</Label>
              <Select value={form.related_incident_id || "__none__"} onValueChange={(v) => setForm({ ...form, related_incident_id: v === "__none__" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Link to incident…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {incidents.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.incident_number} — {i.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Suspects</Label><Textarea rows={2} value={form.suspects || ""} onChange={(e) => setForm({ ...form, suspects: e.target.value })} placeholder="Names, aliases, contact details" /></div>
            <div><Label>Evidence summary</Label><Textarea rows={2} value={form.evidence_summary || ""} onChange={(e) => setForm({ ...form, evidence_summary: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Referred to agency</Label><Input value={form.referred_to_agency || ""} onChange={(e) => setForm({ ...form, referred_to_agency: e.target.value })} placeholder="e.g. EOCO, Police CID" /></div>
              <div><Label>Outcome</Label><Input value={form.outcome || ""} onChange={(e) => setForm({ ...form, outcome: e.target.value })} /></div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full bg-blue-900 hover:bg-blue-950 text-cyan-100">{save.isPending ? "Saving…" : editing ? "Update" : "Open Case"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* =================== REPORTS =================== */
function ReportsTab() {
  const { data: incidents = [] } = useQuery({
    queryKey: ["cyber_incidents"],
    queryFn: async () => (await supabase.from("cyber_incidents").select("*")).data || [],
  });
  const { data: cases = [] } = useQuery({
    queryKey: ["cyber_investigations"],
    queryFn: async () => (await supabase.from("cyber_investigations").select("*")).data || [],
  });

  const monthlyReport = useMemo(() => {
    const months: Record<string, { incidents: number; resolved: number; cases: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subDays(new Date(), i * 30);
      const key = format(d, "MMM yyyy");
      months[key] = { incidents: 0, resolved: 0, cases: 0 };
    }
    const safeKey = (v: any) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : format(d, "MMM yyyy");
    };
    incidents.forEach((inc: any) => {
      const key = safeKey(inc.reported_at);
      if (key && months[key]) {
        months[key].incidents += 1;
        if (inc.resolved_at) months[key].resolved += 1;
      }
    });
    cases.forEach((c: any) => {
      const key = safeKey(c.opened_at);
      if (key && months[key]) months[key].cases += 1;
    });
    return Object.entries(months).map(([month, v]) => ({ month, ...v }));
  }, [incidents, cases]);

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-700 dark:text-cyan-300" />
            6-Month Performance Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyReport}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="incidents" fill="#1E3A8A" name="Incidents" />
              <Bar dataKey="resolved" fill="#22D3EE" name="Resolved" />
              <Bar dataKey="cases" fill="#0E7490" name="Cases" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Incidents</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-blue-700 dark:text-cyan-300">{incidents.length}</div></CardContent>
        </Card>
        <Card className="border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resolution Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cyan-700 dark:text-cyan-300">
              {incidents.length > 0 ? Math.round((incidents.filter((i: any) => i.resolved_at).length / incidents.length) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cases Referred</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700 dark:text-cyan-300">
              {cases.filter((c: any) => c.referred_to_agency).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-sm">Export Reports</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <ExportMenu getData={() => ({
            title: "MISD Full Incidents Report",
            filename: `misd-incidents-${format(new Date(), "yyyy-MM-dd")}`,
            headers: ["Number", "Title", "Type", "Severity", "Status", "Reported", "Resolved", "Source", "Affected Systems"],
            rows: incidents.map((i: any) => [i.incident_number, i.title, i.incident_type, i.severity, i.status, safeFormat(i.reported_at, "yyyy-MM-dd"), safeFormat(i.resolved_at, "yyyy-MM-dd"), i.source || "-", i.affected_systems || "-"]),
          })} />
          <ExportMenu getData={() => ({
            title: "MISD Investigations Report",
            filename: `misd-investigations-${format(new Date(), "yyyy-MM-dd")}`,
            headers: ["Case #", "Title", "Type", "Status", "Priority", "Opened", "Closed", "Referred to"],
            rows: cases.map((c: any) => [c.case_number, c.title, c.case_type, c.status, c.priority, safeFormat(c.opened_at, "yyyy-MM-dd"), safeFormat(c.closed_at, "yyyy-MM-dd"), c.referred_to_agency || "-"]),
          })} />
        </CardContent>
      </Card>
    </div>
  );
}
