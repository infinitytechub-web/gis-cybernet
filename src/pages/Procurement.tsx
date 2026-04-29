import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Briefcase, FileText, ShoppingCart, Receipt, FileSignature, Package, Search, Upload, Download,
  Plus, TrendingUp, AlertCircle, CheckCircle2, Clock, X, Trash2, FileBarChart,
} from "lucide-react";
import { ProcurementReportsTab } from "@/components/procurement/ProcurementReportsTab";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/download-utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-destructive/15 text-destructive",
  open: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  closed: "bg-muted text-muted-foreground",
  awarded: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  issued: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-destructive/15 text-destructive",
  closed_status: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  overdue: "bg-destructive/15 text-destructive",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  expired: "bg-destructive/15 text-destructive",
};

const fmtCurrency = (n: number, c = "GHS") =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--chart-3, 280 70% 50%))", "hsl(var(--chart-4, 30 80% 55%))", "hsl(var(--chart-5, 160 70% 45%))"];

export default function Procurement() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canManage = role === "admin" || role === "oic" || role === "2ic" || (role as string) === "procurement_officer";

  // Realtime invalidation
  useEffect(() => {
    const tables = ["procurement_vendors", "purchase_requisitions", "procurement_rfqs", "purchase_orders", "procurement_invoices", "procurement_contracts", "procurement_documents"];
    const channel = supabase.channel("procurement-rt");
    tables.forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
      qc.invalidateQueries({ queryKey: ["procurement"] });
    }));
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // ============ DATA ============
  const { data: vendors = [] } = useQuery({
    queryKey: ["procurement", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procurement_vendors").select("*").order("name");
      if (error) throw error; return data;
    },
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ["procurement", "requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_requisitions").select("*").order("created_at", { ascending: false });
      if (error) throw error; return data;
    },
  });

  const { data: rfqs = [] } = useQuery({
    queryKey: ["procurement", "rfqs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procurement_rfqs").select("*").order("created_at", { ascending: false });
      if (error) return []; return data;
    },
  });

  const { data: pos = [] } = useQuery({
    queryKey: ["procurement", "pos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders").select("*, procurement_vendors(name)").order("created_at", { ascending: false });
      if (error) return []; return data as any[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["procurement", "invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procurement_invoices").select("*, procurement_vendors(name)").order("created_at", { ascending: false });
      if (error) return []; return data as any[];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["procurement", "contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procurement_contracts").select("*, procurement_vendors(name)").order("created_at", { ascending: false });
      if (error) return []; return data as any[];
    },
  });

  // ============ KPIs ============
  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const openPOs = pos.filter(p => ["draft", "issued", "partial"].includes(p.status));
    const spendMTD = pos.filter(p => new Date(p.order_date) >= monthStart).reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const spendYTD = pos.filter(p => new Date(p.order_date) >= yearStart).reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const pendingReqs = requisitions.filter(r => r.status === "submitted").length;
    const overdueDeliveries = pos.filter(p => p.expected_delivery && new Date(p.expected_delivery) < now && !["received", "cancelled", "closed"].includes(p.status)).length;
    const overdueInvoices = invoices.filter(i => i.due_date && new Date(i.due_date) < now && i.status !== "paid").length;
    const expiringContracts = contracts.filter(c => {
      if (!c.end_date || c.status !== "active") return false;
      const d = new Date(c.end_date);
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length;
    return { openPOs: openPOs.length, spendMTD, spendYTD, pendingReqs, overdueDeliveries, overdueInvoices, expiringContracts, vendorCount: vendors.length };
  }, [pos, requisitions, invoices, contracts, vendors]);

  // Spend by vendor (top 5)
  const spendByVendor = useMemo(() => {
    const map = new Map<string, number>();
    pos.forEach(p => {
      const name = p.procurement_vendors?.name || "Unknown";
      map.set(name, (map.get(name) || 0) + Number(p.total_amount || 0));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [pos]);

  // PO status funnel
  const poStatusData = useMemo(() => {
    const map = new Map<string, number>();
    pos.forEach(p => map.set(p.status, (map.get(p.status) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [pos]);

  // Monthly spend trend (last 6 months)
  const monthlySpend = useMemo(() => {
    const now = new Date();
    const months: { name: string; spend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const total = pos.filter(p => {
        const od = new Date(p.order_date);
        return od >= d && od < next;
      }).reduce((s, p) => s + Number(p.total_amount || 0), 0);
      months.push({ name: d.toLocaleDateString("en", { month: "short" }), spend: total });
    }
    return months;
  }, [pos]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Procurement Unit</h1>
        <p className="text-muted-foreground">End-to-end procurement lifecycle: requisitions, RFQs, vendors, orders, invoices, contracts, and document vault.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Clock className="h-4 w-4 text-amber-600" />} label="Pending Requisitions" value={kpis.pendingReqs.toString()} />
        <KpiCard icon={<ShoppingCart className="h-4 w-4 text-indigo-600" />} label="Open POs" value={kpis.openPOs.toString()} />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} label="Spend MTD" value={fmtCurrency(kpis.spendMTD)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-fuchsia-600" />} label="Spend YTD" value={fmtCurrency(kpis.spendYTD)} />
        <KpiCard icon={<AlertCircle className="h-4 w-4 text-destructive" />} label="Overdue Deliveries" value={kpis.overdueDeliveries.toString()} alert={kpis.overdueDeliveries > 0} />
        <KpiCard icon={<Receipt className="h-4 w-4 text-destructive" />} label="Overdue Invoices" value={kpis.overdueInvoices.toString()} alert={kpis.overdueInvoices > 0} />
        <KpiCard icon={<FileSignature className="h-4 w-4 text-amber-600" />} label="Contracts Expiring (30d)" value={kpis.expiringContracts.toString()} alert={kpis.expiringContracts > 0} />
        <KpiCard icon={<Briefcase className="h-4 w-4 text-blue-600" />} label="Active Vendors" value={kpis.vendorCount.toString()} />
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList className="inline-flex bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/50 p-1">
            <TabsTrigger value="analytics" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"><TrendingUp className="h-4 w-4 mr-1 text-emerald-700 dark:text-emerald-400" />Analytics</TabsTrigger>
            <TabsTrigger value="requisitions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"><FileText className="h-4 w-4 mr-1 text-blue-700 dark:text-blue-400" />Requisitions</TabsTrigger>
            <TabsTrigger value="rfqs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"><FileText className="h-4 w-4 mr-1 text-indigo-700 dark:text-indigo-400" />RFQs</TabsTrigger>
            <TabsTrigger value="pos" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"><ShoppingCart className="h-4 w-4 mr-1 text-amber-700 dark:text-amber-400" />Purchase Orders</TabsTrigger>
            <TabsTrigger value="invoices" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white"><Receipt className="h-4 w-4 mr-1 text-violet-700 dark:text-violet-400" />Invoices</TabsTrigger>
            <TabsTrigger value="contracts" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"><FileSignature className="h-4 w-4 mr-1 text-teal-700 dark:text-teal-400" />Contracts</TabsTrigger>
            <TabsTrigger value="vendors" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"><Briefcase className="h-4 w-4 mr-1 text-cyan-700 dark:text-cyan-400" />Vendors</TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"><Package className="h-4 w-4 mr-1 text-slate-700 dark:text-slate-300" />Document Vault</TabsTrigger>
          </TabsList>
        </ScrollArea>

        {/* ANALYTICS */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Monthly Spend Trend</CardTitle><CardDescription>Last 6 months of PO spend</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={monthlySpend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: any) => fmtCurrency(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top Vendors by Spend</CardTitle><CardDescription>Cumulative PO value</CardDescription></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={spendByVendor} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                    <RTooltip formatter={(v: any) => fmtCurrency(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>PO Status Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={poStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {poStatusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {[...pos.slice(0, 5).map(p => ({ type: "PO", title: p.po_number, sub: p.procurement_vendors?.name, when: p.created_at })),
                    ...invoices.slice(0, 5).map(i => ({ type: "Invoice", title: i.invoice_number, sub: i.procurement_vendors?.name, when: i.created_at }))]
                    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
                    .slice(0, 8)
                    .map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{it.type}</Badge>
                          <span className="font-medium">{it.title}</span>
                          <span className="text-muted-foreground">— {it.sub}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(it.when).toLocaleDateString()}</span>
                      </div>
                    ))}
                  {pos.length === 0 && invoices.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No activity yet.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requisitions"><RequisitionsTab requisitions={requisitions} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="rfqs"><RfqsTab rfqs={rfqs} vendors={vendors} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="pos"><PosTab pos={pos} vendors={vendors} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab invoices={invoices} vendors={vendors} pos={pos} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="contracts"><ContractsTab contracts={contracts} vendors={vendors} canManage={canManage} userId={user?.id} /></TabsContent>
        <TabsContent value="vendors"><VendorsTab vendors={vendors} canManage={canManage} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab canManage={canManage} userId={user?.id} vendors={vendors} /></TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card className={cn(alert && "border-destructive/40")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          {icon}
        </div>
        <div className={cn("text-2xl font-bold mt-1", alert && "text-destructive")}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("capitalize", STATUS_COLORS[status] || "")}>{status.replace("_", " ")}</Badge>;
}

// ============ REQUISITIONS ============
function RequisitionsTab({ requisitions, canManage, userId }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal", estimated_cost: "", needed_by: "" });
  const qc = useQueryClient();

  const submit = async () => {
    if (!form.title || !userId) return;
    const pr_number = `PR-${Date.now().toString().slice(-8)}`;
    const { error } = await supabase.from("purchase_requisitions").insert({
      pr_number, title: form.title, description: form.description, priority: form.priority,
      estimated_cost: Number(form.estimated_cost) || 0,
      needed_by: form.needed_by || null,
      requested_by: userId, status: "submitted",
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Requisition submitted" });
    setOpen(false); setForm({ title: "", description: "", priority: "normal", estimated_cost: "", needed_by: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "requisitions"] });
  };

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div><CardTitle>Purchase Requisitions</CardTitle><CardDescription>Internal requests for goods or services</CardDescription></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Requisition</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Purchase Requisition</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Estimated Cost (GHS)</Label><Input type="number" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} /></div>
              </div>
              <div><Label>Needed By</Label><Input type="date" value={form.needed_by} onChange={e => setForm({ ...form, needed_by: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>PR #</TableHead><TableHead>Title</TableHead><TableHead>Priority</TableHead><TableHead>Est. Cost</TableHead><TableHead>Needed By</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {requisitions.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.pr_number}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.priority}</Badge></TableCell>
                <TableCell>{fmtCurrency(Number(r.estimated_cost))}</TableCell>
                <TableCell>{r.needed_by || "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                {canManage && <TableCell>
                  {r.status === "submitted" && <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={async () => {
                      await supabase.from("purchase_requisitions").update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() }).eq("id", r.id);
                      qc.invalidateQueries({ queryKey: ["procurement", "requisitions"] });
                    }}><CheckCircle2 className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      await supabase.from("purchase_requisitions").update({ status: "rejected" }).eq("id", r.id);
                      qc.invalidateQueries({ queryKey: ["procurement", "requisitions"] });
                    }}><X className="h-3 w-3" /></Button>
                  </div>}
                </TableCell>}
              </TableRow>
            ))}
            {requisitions.length === 0 && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">No requisitions yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ RFQ ============
function RfqsTab({ rfqs, vendors, canManage, userId }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", closing_date: "" });
  const qc = useQueryClient();
  const submit = async () => {
    if (!form.title || !userId) return;
    const rfq_number = `RFQ-${Date.now().toString().slice(-8)}`;
    const { error } = await supabase.from("procurement_rfqs").insert({ rfq_number, title: form.title, description: form.description, closing_date: form.closing_date || null, created_by: userId });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "RFQ created" }); setOpen(false); setForm({ title: "", description: "", closing_date: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "rfqs"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div><CardTitle>Request for Quotations</CardTitle><CardDescription>Solicit competitive quotes from vendors</CardDescription></div>
        {canManage && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New RFQ</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New RFQ</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Closing Date</Label><Input type="date" value={form.closing_date} onChange={e => setForm({ ...form, closing_date: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>RFQ #</TableHead><TableHead>Title</TableHead><TableHead>Closing Date</TableHead><TableHead>Status</TableHead><TableHead>Awarded</TableHead></TableRow></TableHeader>
          <TableBody>
            {rfqs.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.rfq_number}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell>{r.closing_date || "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell>{r.awarded_amount ? fmtCurrency(Number(r.awarded_amount)) : "—"}</TableCell>
              </TableRow>
            ))}
            {rfqs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No RFQs yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ PURCHASE ORDERS ============
function PosTab({ pos, vendors, canManage, userId }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: "", total_amount: "", expected_delivery: "", payment_terms: "Net 30", notes: "" });
  const qc = useQueryClient();
  const submit = async () => {
    if (!form.vendor_id || !userId) return;
    const po_number = `PO-${Date.now().toString().slice(-8)}`;
    const { error } = await supabase.from("purchase_orders").insert({
      po_number, vendor_id: form.vendor_id, total_amount: Number(form.total_amount) || 0,
      expected_delivery: form.expected_delivery || null, payment_terms: form.payment_terms,
      notes: form.notes, created_by: userId, status: "issued",
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "PO created" }); setOpen(false);
    setForm({ vendor_id: "", total_amount: "", expected_delivery: "", payment_terms: "Net 30", notes: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "pos"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div><CardTitle>Purchase Orders</CardTitle><CardDescription>Issued orders to vendors</CardDescription></div>
        {canManage && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New PO</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Vendor *</Label>
                <Select value={form.vendor_id} onValueChange={v => setForm({ ...form, vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Total (GHS)</Label><Input type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} /></div>
                <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery} onChange={e => setForm({ ...form, expected_delivery: e.target.value })} /></div>
              </div>
              <div><Label>Payment Terms</Label><Input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Issue PO</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>Vendor</TableHead><TableHead>Total</TableHead><TableHead>Order Date</TableHead><TableHead>Expected</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {pos.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.po_number}</TableCell>
                <TableCell>{p.procurement_vendors?.name}</TableCell>
                <TableCell>{fmtCurrency(Number(p.total_amount), p.currency)}</TableCell>
                <TableCell>{p.order_date}</TableCell>
                <TableCell>{p.expected_delivery || "—"}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                {canManage && <TableCell>
                  <Select value={p.status} onValueChange={async (v) => {
                    await supabase.from("purchase_orders").update({ status: v, delivered_at: v === "received" ? new Date().toISOString().slice(0, 10) : null }).eq("id", p.id);
                    qc.invalidateQueries({ queryKey: ["procurement", "pos"] });
                  }}>
                    <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem><SelectItem value="issued">Issued</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem><SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>}
              </TableRow>
            ))}
            {pos.length === 0 && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">No purchase orders yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ INVOICES ============
function InvoicesTab({ invoices, vendors, pos, canManage, userId }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invoice_number: "", vendor_id: "", po_id: "", amount: "", invoice_date: "", due_date: "" });
  const qc = useQueryClient();
  const submit = async () => {
    if (!form.invoice_number || !form.vendor_id || !userId) return;
    const { error } = await supabase.from("procurement_invoices").insert({
      invoice_number: form.invoice_number, vendor_id: form.vendor_id, po_id: form.po_id || null,
      amount: Number(form.amount) || 0, invoice_date: form.invoice_date || new Date().toISOString().slice(0, 10),
      due_date: form.due_date || null, created_by: userId,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Invoice recorded" }); setOpen(false);
    setForm({ invoice_number: "", vendor_id: "", po_id: "", amount: "", invoice_date: "", due_date: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "invoices"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div><CardTitle>Vendor Invoices</CardTitle><CardDescription>Track invoices and payments</CardDescription></div>
        {canManage && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Invoice</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Invoice # *</Label><Input value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} /></div>
              <div><Label>Vendor *</Label>
                <Select value={form.vendor_id} onValueChange={v => setForm({ ...form, vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Linked PO (optional)</Label>
                <Select value={form.po_id} onValueChange={v => setForm({ ...form, po_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                  <SelectContent>{pos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Amount (GHS)</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Record</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Vendor</TableHead><TableHead>Amount</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {invoices.map((i: any) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                <TableCell>{i.procurement_vendors?.name}</TableCell>
                <TableCell>{fmtCurrency(Number(i.amount), i.currency)}</TableCell>
                <TableCell>{i.due_date || "—"}</TableCell>
                <TableCell><StatusBadge status={i.status} /></TableCell>
                {canManage && <TableCell>
                  {i.status !== "paid" && <Button size="sm" variant="outline" onClick={async () => {
                    await supabase.from("procurement_invoices").update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) }).eq("id", i.id);
                    qc.invalidateQueries({ queryKey: ["procurement", "invoices"] });
                  }}>Mark Paid</Button>}
                </TableCell>}
              </TableRow>
            ))}
            {invoices.length === 0 && <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">No invoices yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ CONTRACTS ============
function ContractsTab({ contracts, vendors, canManage, userId }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", vendor_id: "", contract_type: "service", start_date: "", end_date: "", value: "" });
  const qc = useQueryClient();
  const submit = async () => {
    if (!form.title || !userId) return;
    const contract_number = `CT-${Date.now().toString().slice(-8)}`;
    const { error } = await supabase.from("procurement_contracts").insert({
      contract_number, title: form.title, vendor_id: form.vendor_id || null, contract_type: form.contract_type,
      start_date: form.start_date || null, end_date: form.end_date || null,
      value: Number(form.value) || 0, created_by: userId,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Contract recorded" }); setOpen(false);
    setForm({ title: "", vendor_id: "", contract_type: "service", start_date: "", end_date: "", value: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "contracts"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center">
        <div><CardTitle>Contracts & Tenders</CardTitle><CardDescription>Service, supply, framework, and tender contracts</CardDescription></div>
        {canManage && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Contract</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Vendor</Label>
                <Select value={form.vendor_id} onValueChange={v => setForm({ ...form, vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>{vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Type</Label>
                <Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service</SelectItem><SelectItem value="supply">Supply</SelectItem>
                    <SelectItem value="tender">Tender</SelectItem><SelectItem value="framework">Framework</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>End</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Value (GHS)</Label><Input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Contract #</TableHead><TableHead>Title</TableHead><TableHead>Vendor</TableHead><TableHead>Type</TableHead><TableHead>End Date</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {contracts.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.contract_number}</TableCell>
                <TableCell>{c.title}</TableCell>
                <TableCell>{c.procurement_vendors?.name || "—"}</TableCell>
                <TableCell className="capitalize">{c.contract_type}</TableCell>
                <TableCell>{c.end_date || "—"}</TableCell>
                <TableCell>{fmtCurrency(Number(c.value), c.currency)}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
              </TableRow>
            ))}
            {contracts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No contracts yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ VENDORS ============
function VendorsTab({ vendors, canManage }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", vendor_code: "", contact_person: "", email: "", phone: "", tin_number: "", category: "" });
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const filtered = vendors.filter((v: any) => !search || v.name.toLowerCase().includes(search.toLowerCase()) || (v.vendor_code || "").toLowerCase().includes(search.toLowerCase()));
  const submit = async () => {
    if (!form.name) return;
    const { error } = await supabase.from("procurement_vendors").insert(form);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Vendor added" }); setOpen(false);
    setForm({ name: "", vendor_code: "", contact_person: "", email: "", phone: "", tin_number: "", category: "" });
    qc.invalidateQueries({ queryKey: ["procurement", "vendors"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center gap-2 flex-wrap">
        <div><CardTitle>Vendor Directory</CardTitle><CardDescription>{vendors.length} registered vendors</CardDescription></div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-48" />
          </div>
          {canManage && <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Vendor</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Vendor Code</Label><Input value={form.vendor_code} onChange={e => setForm({ ...form, vendor_code: e.target.value })} /></div>
                  <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                </div>
                <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div><Label>Phone(s)</Label><MultiContactInput mode="list" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
                <div><Label>TIN</Label><Input value={form.tin_number} onChange={e => setForm({ ...form, tin_number: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Contact</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((v: any) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="font-mono text-xs">{v.vendor_code || "—"}</TableCell>
                <TableCell>{v.contact_person || "—"}</TableCell>
                <TableCell>{v.email || "—"}</TableCell>
                <TableCell>{v.phone || "—"}</TableCell>
                <TableCell>{v.category || "—"}</TableCell>
                <TableCell>{v.is_blacklisted ? <Badge variant="destructive">Blacklisted</Badge> : <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700">Active</Badge>}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No vendors</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ DOCUMENT VAULT ============
function DocumentsTab({ canManage, userId, vendors }: any) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["procurement", "documents", search, typeFilter],
    queryFn: async () => {
      let q = supabase.from("procurement_documents").select("*, procurement_vendors(name)").order("created_at", { ascending: false });
      if (typeFilter !== "all") q = q.eq("document_type", typeFilter);
      if (search) q = q.or(`title.ilike.%${search}%,file_name.ilike.%${search}%,description.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return []; return data as any[];
    },
  });

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!userId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${userId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("procurement-docs").upload(path, file);
        if (upErr) { toast({ title: "Upload error", description: upErr.message, variant: "destructive" }); continue; }
        const { error: dbErr } = await supabase.from("procurement_documents").insert({
          title: file.name, file_name: file.name, file_path: path, file_size: file.size,
          file_type: file.type || "application/octet-stream", document_type: "general", uploaded_by: userId,
        });
        if (dbErr) toast({ title: "Save error", description: dbErr.message, variant: "destructive" });
      }
      toast({ title: "Upload complete" });
      qc.invalidateQueries({ queryKey: ["procurement", "documents"] });
    } finally { setUploading(false); }
  }, [userId, qc]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const downloadDoc = async (d: any) => {
    const { data, error } = await supabase.storage.from("procurement-docs").createSignedUrl(d.file_path, 60);
    if (error || !data) return toast({ title: "Download failed", variant: "destructive" });
    triggerDownload(data.signedUrl, d.file_name);
  };

  const deleteDoc = async (d: any) => {
    if (!confirm(`Move ${d.file_name} to Recycle Bin?`)) return;
    try {
      await softDelete({
        table: "procurement_documents",
        id: d.id,
        label: d.file_name,
        storagePaths: d.file_path ? [{ bucket: "procurement-docs", path: d.file_path }] : [],
      });
      qc.invalidateQueries({ queryKey: ["procurement", "documents"] });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div><CardTitle>Document Vault</CardTitle><CardDescription>Securely store procurement documents (RFQs, POs, contracts, invoices, receipts)</CardDescription></div>
        </div>
        <div className="flex gap-2 items-center flex-wrap mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search title, filename, description…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="rfq">RFQ</SelectItem><SelectItem value="po">PO</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem><SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="receipt">Receipt</SelectItem><SelectItem value="tender">Tender</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          {canManage && <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" />{uploading ? "Uploading…" : "Upload"}
          </Button>}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
        </div>
      </CardHeader>
      <CardContent>
        {canManage && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, images — up to 50 MB each</p>
          </div>
        )}
        <Table>
          <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Size</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {docs.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell><div className="font-medium">{d.title}</div><div className="text-xs text-muted-foreground">{d.file_name}</div></TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{d.document_type}</Badge></TableCell>
                <TableCell>{(Number(d.file_size) / 1024).toFixed(1)} KB</TableCell>
                <TableCell className="text-xs">{new Date(d.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => downloadDoc(d)}><Download className="h-3 w-3" /></Button>
                    {canManage && <Button size="sm" variant="outline" onClick={() => deleteDoc(d)}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {docs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No documents found</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
