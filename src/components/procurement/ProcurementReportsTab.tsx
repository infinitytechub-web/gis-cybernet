import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportMenu } from "@/components/ui/export-menu";
import { exportReport } from "@/lib/export-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Coins,
  ShoppingCart,
  Receipt,
  FileSignature,
  Briefcase,
  AlertTriangle,
  FileBarChart,
  CalendarIcon,
  Filter,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import {
import { csvCellQuoted } from "@/lib/csv-safe";
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PIE_COLORS = ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const PROC_EXPORT_ROLES = ["admin", "oic", "2ic", "procurement_officer"] as const;

// ---- Combined-export rate limit & size guards (frontend) ----
const RATE_LIMIT_KEY = "procurement_combined_export_log";
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX_IN_WINDOW = 5;
const RATE_MIN_GAP_MS = 5 * 1000; // 5 seconds between exports
const SIZE_LIMIT_BYTES: Record<"csv" | "pdf", number> = {
  csv: 10 * 1024 * 1024, // 10 MB
  pdf: 15 * 1024 * 1024, // 15 MB
};

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const readRateLog = (): number[] => {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const cutoff = Date.now() - RATE_WINDOW_MS;
    return arr.filter((t: unknown) => typeof t === "number" && t >= cutoff);
  } catch {
    return [];
  }
};

const writeRateLog = (entries: number[]) => {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota */
  }
};

const fmtCurrency = (n: number) => `₵${Number(n || 0).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

type AnyRow = Record<string, any>;

export function ProcurementReportsTab() {
  const { role } = useAuth();
  const canExport = PROC_EXPORT_ROLES.includes((role || "") as any);

  // ============ DATA ============
  const { data: vendors = [] } = useQuery({
    queryKey: ["procurement", "reports", "vendors"],
    queryFn: async () => {
      const { data } = await supabase.from("procurement_vendors").select("id, name, status").order("name");
      return (data ?? []) as AnyRow[];
    },
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ["procurement", "reports", "requisitions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requisitions")
        .select("id, pr_number, title, status, priority, estimated_cost, needed_by, created_at, department_id")
        .order("created_at", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  const { data: pos = [] } = useQuery({
    queryKey: ["procurement", "reports", "pos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, po_number, status, total_amount, tax_amount, currency, order_date, expected_delivery, delivered_at, vendor_id, procurement_vendors(name)")
        .order("order_date", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["procurement", "reports", "invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("procurement_invoices")
        .select("id, invoice_number, status, amount, tax_amount, currency, invoice_date, due_date, paid_at, vendor_id, procurement_vendors(name)")
        .order("invoice_date", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["procurement", "reports", "contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("procurement_contracts")
        .select("id, contract_number, title, contract_type, status, value, currency, start_date, end_date, vendor_id, procurement_vendors(name)")
        .order("start_date", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  // ============ KPIs / Aggregates ============
  const kpis = useMemo(() => {
    const poTotal = pos.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const invTotal = invoices.reduce((s, r) => s + Number(r.amount || 0), 0);
    const invPaid = invoices.filter(i => i.status === "paid").reduce((s, r) => s + Number(r.amount || 0), 0);
    const invOutstanding = invTotal - invPaid;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = invoices.filter((i) => i.status !== "paid" && i.due_date && i.due_date < today);
    const expiringContracts = contracts.filter((c) => {
      if (!c.end_date) return false;
      const days = (new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 30;
    });
    return { poTotal, invTotal, invPaid, invOutstanding, overdueCount: overdue.length, overdue, expiringContracts };
  }, [pos, invoices, contracts]);

  const spendByVendor = useMemo(() => {
    const m = new Map<string, number>();
    pos.forEach((p) => {
      const name = p.procurement_vendors?.name || "Unassigned";
      m.set(name, (m.get(name) || 0) + Number(p.total_amount || 0));
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [pos]);

  const poByStatus = useMemo(() => {
    const m = new Map<string, number>();
    pos.forEach((p) => m.set(p.status || "unknown", (m.get(p.status || "unknown") || 0) + 1));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [pos]);

  const reqByStatus = useMemo(() => {
    const m = new Map<string, number>();
    requisitions.forEach((r) => m.set(r.status || "unknown", (m.get(r.status || "unknown") || 0) + 1));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [requisitions]);

  // ============ Combined export ============
  // ============ Combined export sections (memoised) ============
  const buildSections = () => [
    {
      title: "Spend by Vendor (Top 10)",
      headers: ["Vendor", "Total PO Value"],
      rows: spendByVendor.map((r) => [r.name, fmtCurrency(r.value)]),
    },
    {
      title: "Purchase Orders by Status",
      headers: ["Status", "Count"],
      rows: poByStatus.map((r) => [r.name, String(r.value)]),
    },
    {
      title: "Requisitions by Status",
      headers: ["Status", "Count"],
      rows: reqByStatus.map((r) => [r.name, String(r.value)]),
    },
    {
      title: "Overdue Invoices",
      headers: ["Invoice #", "Vendor", "Amount", "Due"],
      rows: kpis.overdue.map((i: AnyRow) => [
        i.invoice_number,
        i.procurement_vendors?.name ?? "—",
        fmtCurrency(Number(i.amount)),
        i.due_date ?? "",
      ]),
    },
    {
      title: "Contracts Expiring (next 30 days)",
      headers: ["Contract #", "Title", "Vendor", "Ends"],
      rows: kpis.expiringContracts.map((c: AnyRow) => [
        c.contract_number,
        c.title,
        c.procurement_vendors?.name ?? "—",
        c.end_date ?? "",
      ]),
    },
  ];

  // ============ Confirmation + rate limit + size guards ============
  const [confirm, setConfirm] = useState<{
    open: boolean;
    fmt: "csv" | "pdf";
    estBytes: number;
    rowCount: number;
    recentCount: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  const requestExport = (fmt: "csv" | "pdf") => {
    const sections = buildSections();
    const rowCount = sections.reduce((s, sec) => s + sec.rows.length, 0);

    // Rough payload size estimate from raw text
    const text =
      `Procurement Combined Report ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}\n` +
      sections
        .map(
          (s) =>
            `# ${s.title}\n${s.headers.join(",")}\n${s.rows.map((r) => r.join(",")).join("\n")}`,
        )
        .join("\n");
    const csvBytes = new Blob([text]).size;
    // PDF is heavier per row; rough multiplier
    const estBytes = fmt === "pdf" ? Math.round(csvBytes * 2.5) + 8 * 1024 : csvBytes;

    // Hard size cap
    if (estBytes > SIZE_LIMIT_BYTES[fmt]) {
      toast.error(
        `Combined ${fmt.toUpperCase()} export would be ~${fmtBytes(estBytes)} (limit ${fmtBytes(SIZE_LIMIT_BYTES[fmt])}). Use the filtered export below to narrow the data.`,
      );
      return;
    }

    // Rate limit
    const log = readRateLog();
    const now = Date.now();
    const last = log[log.length - 1];
    if (last && now - last < RATE_MIN_GAP_MS) {
      const wait = Math.ceil((RATE_MIN_GAP_MS - (now - last)) / 1000);
      toast.error(`Please wait ${wait}s before exporting again.`);
      return;
    }
    if (log.length >= RATE_MAX_IN_WINDOW) {
      const oldest = log[0];
      const minsLeft = Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 60000);
      toast.error(
        `Export limit reached (${RATE_MAX_IN_WINDOW} per ${Math.round(RATE_WINDOW_MS / 60000)} min). Try again in ~${minsLeft} min.`,
      );
      return;
    }

    setConfirm({ open: true, fmt, estBytes, rowCount, recentCount: log.length });
  };

  const performExport = async () => {
    if (!confirm) return;
    const { fmt } = confirm;
    setExporting(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const sections = buildSections();

      if (fmt === "csv") {
        const lines: string[] = [];
        lines.push(`"Procurement — Combined Report"`);
        lines.push(`"Generated","${format(new Date(), "dd/MM/yyyy HH:mm:ss")}"`);
        lines.push(`"Total PO value","${fmtCurrency(kpis.poTotal)}"`);
        lines.push(`"Invoices total","${fmtCurrency(kpis.invTotal)}"`);
        lines.push(`"Invoices outstanding","${fmtCurrency(kpis.invOutstanding)}"`);
        lines.push("");
        sections.forEach((s) => {
          lines.push(`"# ${s.title}"`);
          lines.push(s.headers.map((h) => `"${h}"`).join(","));
          s.rows.forEach((r) =>
            lines.push(r.map((c) => csvCellQuoted((c ?? "").toString())).join(",")),
          );
          lines.push("");
        });
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });

        // Final actual-size enforcement (after building)
        if (blob.size > SIZE_LIMIT_BYTES.csv) {
          toast.error(
            `CSV is ${fmtBytes(blob.size)} (limit ${fmtBytes(SIZE_LIMIT_BYTES.csv)}). Export aborted.`,
          );
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `procurement-combined-report-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(`Combined report (CSV, ${fmtBytes(blob.size)}) downloaded`);
      } else {
        const headers = ["Col 1", "Col 2", "Col 3", "Col 4"];
        const rows: string[][] = [];
        sections.forEach((s) => {
          rows.push([`▶ ${s.title}`, "", "", ""]);
          rows.push([...s.headers, ...Array(Math.max(0, 4 - s.headers.length)).fill("")]);
          s.rows.forEach((r) => rows.push([...r, ...Array(Math.max(0, 4 - r.length)).fill("")]));
          rows.push(["", "", "", ""]);
        });
        exportReport("pdf", {
          title: "Procurement — Combined Report",
          subtitle: `Generated ${format(new Date(), "dd/MM/yyyy HH:mm:ss")} · PO total ${fmtCurrency(kpis.poTotal)} · Outstanding ${fmtCurrency(kpis.invOutstanding)}`,
          filename: `procurement-combined-report-${today}`,
          headers,
          rows,
        });
        toast.success("Combined report (PDF) downloaded");
      }

      // Record the successful export for rate limiting
      const fresh = readRateLog();
      fresh.push(Date.now());
      writeRateLog(fresh);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-4">
      {canExport && (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <FileBarChart className="h-4 w-4" /> Export combined report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => requestExport("pdf")}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestExport("csv")}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog
        open={!!confirm?.open}
        onOpenChange={(o) => { if (!o && !exporting) setConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm combined export</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  You are about to download the combined Procurement report as{" "}
                  <strong className="uppercase">{confirm?.fmt}</strong>.
                </div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>Estimated size: <strong className="text-foreground">{confirm ? fmtBytes(confirm.estBytes) : ""}</strong> (limit {confirm ? fmtBytes(SIZE_LIMIT_BYTES[confirm.fmt]) : ""})</li>
                  <li>Rows across all sections: <strong className="text-foreground">{confirm?.rowCount ?? 0}</strong></li>
                  <li>Recent exports in last {Math.round(RATE_WINDOW_MS / 60000)} min: <strong className="text-foreground">{confirm?.recentCount ?? 0}/{RATE_MAX_IN_WINDOW}</strong></li>
                </ul>
                <div className="text-xs text-muted-foreground">
                  Large repeat downloads are throttled to protect storage and bandwidth.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performExport} disabled={exporting}>
              {exporting ? "Generating…" : "Download"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Coins} label="Total PO value" value={fmtCurrency(kpis.poTotal)} accent="text-emerald-600" />
        <Tile icon={Receipt} label="Invoiced" value={fmtCurrency(kpis.invTotal)} accent="text-violet-600" />
        <Tile
          icon={AlertTriangle}
          label="Outstanding"
          value={fmtCurrency(kpis.invOutstanding)}
          sub={kpis.overdueCount > 0 ? `${kpis.overdueCount} overdue` : undefined}
          accent={kpis.overdueCount > 0 ? "text-destructive" : "text-amber-600"}
        />
        <Tile icon={FileSignature} label="Active vendors" value={String(vendors.length)} accent="text-cyan-600" />
      </div>

      {/* Spend by vendor */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-cyan-600" /> Spend by vendor
              </CardTitle>
              <CardDescription>Top 10 vendors by total PO value.</CardDescription>
            </div>
            {canExport && (
              <ExportMenu
                getData={() => ({
                  title: "Spend by Vendor",
                  filename: `spend-by-vendor-${format(new Date(), "yyyy-MM-dd")}`,
                  headers: ["Vendor", "Total PO Value (₵)"],
                  rows: spendByVendor.map((r) => [r.name, r.value.toFixed(2)]),
                })}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendByVendor}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtCurrency(Number(v))} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={poByStatus} dataKey="value" nameKey="name" outerRadius={90} label={(e) => `${e.name}`}>
                  {poByStatus.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Overdue invoices */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Overdue invoices
              </CardTitle>
              <CardDescription>Unpaid invoices past their due date.</CardDescription>
            </div>
            {canExport && (
              <ExportMenu
                getData={() => ({
                  title: "Overdue Invoices",
                  filename: `overdue-invoices-${format(new Date(), "yyyy-MM-dd")}`,
                  headers: ["Invoice #", "Vendor", "Amount", "Due", "Status"],
                  rows: kpis.overdue.map((i: AnyRow) => [
                    i.invoice_number,
                    i.procurement_vendors?.name ?? "—",
                    fmtCurrency(Number(i.amount)),
                    i.due_date ?? "",
                    i.status,
                  ]),
                })}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.overdue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No overdue invoices.
                    </TableCell>
                  </TableRow>
                ) : (
                  kpis.overdue.map((i: AnyRow) => (
                    <TableRow key={i.id} className="bg-destructive/5">
                      <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                      <TableCell className="text-xs">{i.procurement_vendors?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-xs">
                        {fmtCurrency(Number(i.amount))}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="destructive" className="font-normal">
                          {i.due_date ? format(new Date(i.due_date), "dd/MM/yyyy") : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{i.status}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Contracts expiring */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-amber-600" /> Contracts expiring (≤ 30 days)
              </CardTitle>
              <CardDescription>Upcoming contract expirations needing renewal review.</CardDescription>
            </div>
            {canExport && (
              <ExportMenu
                getData={() => ({
                  title: "Contracts Expiring (30 days)",
                  filename: `contracts-expiring-${format(new Date(), "yyyy-MM-dd")}`,
                  headers: ["Contract #", "Title", "Vendor", "Type", "Value", "Ends"],
                  rows: kpis.expiringContracts.map((c: AnyRow) => [
                    c.contract_number,
                    c.title,
                    c.procurement_vendors?.name ?? "—",
                    c.contract_type,
                    fmtCurrency(Number(c.value || 0)),
                    c.end_date ?? "",
                  ]),
                })}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.expiringContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                      No contracts expiring soon.
                    </TableCell>
                  </TableRow>
                ) : (
                  kpis.expiringContracts.map((c: AnyRow) => (
                    <TableRow key={c.id} className="bg-amber-50/40 dark:bg-amber-950/10">
                      <TableCell>
                        <div className="font-medium text-xs">{c.title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{c.contract_number}</div>
                      </TableCell>
                      <TableCell className="text-xs">{c.procurement_vendors?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs capitalize">{c.contract_type}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {fmtCurrency(Number(c.value || 0))}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Filtered compliance export */}
      <ProcurementComplianceExport
        canExport={canExport}
        pos={pos}
        invoices={invoices}
        vendors={vendors}
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className={`h-3.5 w-3.5 ${accent ?? "text-primary"}`} /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-destructive mt-0.5">{sub}</div>}
    </div>
  );
}

// ===================== Filtered compliance export =====================

type Dataset = "purchase_orders" | "invoices" | "contracts" | "requisitions";

function ProcurementComplianceExport({
  canExport,
  pos,
  invoices,
  vendors,
}: {
  canExport: boolean;
  pos: AnyRow[];
  invoices: AnyRow[];
  vendors: AnyRow[];
}) {
  const [dataset, setDataset] = useState<Dataset>("purchase_orders");
  const [vendorId, setVendorId] = useState<string>("any");
  const [status, setStatus] = useState<string>("any");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();

  // Pull contracts/requisitions on-demand
  const { data: contracts = [] } = useQuery({
    queryKey: ["procurement", "compliance", "contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("procurement_contracts")
        .select("id, contract_number, title, contract_type, status, value, currency, start_date, end_date, vendor_id, procurement_vendors(name)")
        .order("start_date", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  const { data: requisitions = [] } = useQuery({
    queryKey: ["procurement", "compliance", "requisitions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requisitions")
        .select("id, pr_number, title, status, priority, estimated_cost, needed_by, created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as AnyRow[];
    },
  });

  const filtered = useMemo(() => {
    const fromIso = from ? format(from, "yyyy-MM-dd") : null;
    const toIso = to ? format(to, "yyyy-MM-dd") : null;
    const inRange = (d?: string | null) => {
      if (!d) return !fromIso && !toIso;
      const v = d.slice(0, 10);
      if (fromIso && v < fromIso) return false;
      if (toIso && v > toIso) return false;
      return true;
    };
    const matchVendor = (vid?: string | null) =>
      vendorId === "any" ? true : vid === vendorId;
    const matchStatus = (s?: string | null) =>
      status === "any" ? true : (s || "") === status;

    if (dataset === "purchase_orders") {
      return pos.filter(
        (p) => inRange(p.order_date) && matchVendor(p.vendor_id) && matchStatus(p.status),
      );
    }
    if (dataset === "invoices") {
      return invoices.filter(
        (i) => inRange(i.invoice_date) && matchVendor(i.vendor_id) && matchStatus(i.status),
      );
    }
    if (dataset === "contracts") {
      return contracts.filter(
        (c) => inRange(c.start_date) && matchVendor(c.vendor_id) && matchStatus(c.status),
      );
    }
    return requisitions.filter(
      (r) => inRange(r.created_at?.slice(0, 10)) && matchStatus(r.status),
    );
  }, [dataset, pos, invoices, contracts, requisitions, vendorId, status, from, to]);

  const statusOptions = useMemo(() => {
    const src: AnyRow[] =
      dataset === "purchase_orders"
        ? pos
        : dataset === "invoices"
          ? invoices
          : dataset === "contracts"
            ? contracts
            : requisitions;
    return Array.from(new Set(src.map((r) => r.status).filter(Boolean))).sort();
  }, [dataset, pos, invoices, contracts, requisitions]);

  const buildPayload = () => {
    if (dataset === "purchase_orders") {
      return {
        title: "Procurement — Purchase Orders",
        filename: `procurement-pos-${format(new Date(), "yyyy-MM-dd")}`,
        headers: ["PO #", "Vendor", "Status", "Order Date", "Expected", "Total"],
        rows: filtered.map((p) => [
          p.po_number,
          p.procurement_vendors?.name ?? "—",
          p.status,
          p.order_date ?? "",
          p.expected_delivery ?? "",
          fmtCurrency(Number(p.total_amount || 0)),
        ]),
      };
    }
    if (dataset === "invoices") {
      return {
        title: "Procurement — Invoices",
        filename: `procurement-invoices-${format(new Date(), "yyyy-MM-dd")}`,
        headers: ["Invoice #", "Vendor", "Status", "Invoice Date", "Due", "Amount"],
        rows: filtered.map((i) => [
          i.invoice_number,
          i.procurement_vendors?.name ?? "—",
          i.status,
          i.invoice_date ?? "",
          i.due_date ?? "",
          fmtCurrency(Number(i.amount || 0)),
        ]),
      };
    }
    if (dataset === "contracts") {
      return {
        title: "Procurement — Contracts",
        filename: `procurement-contracts-${format(new Date(), "yyyy-MM-dd")}`,
        headers: ["Contract #", "Title", "Vendor", "Status", "Start", "End", "Value"],
        rows: filtered.map((c) => [
          c.contract_number,
          c.title,
          c.procurement_vendors?.name ?? "—",
          c.status,
          c.start_date ?? "",
          c.end_date ?? "",
          fmtCurrency(Number(c.value || 0)),
        ]),
      };
    }
    return {
      title: "Procurement — Requisitions",
      filename: `procurement-requisitions-${format(new Date(), "yyyy-MM-dd")}`,
      headers: ["PR #", "Title", "Status", "Priority", "Estimated cost", "Needed by"],
      rows: filtered.map((r) => [
        r.pr_number,
        r.title,
        r.status,
        r.priority,
        fmtCurrency(Number(r.estimated_cost || 0)),
        r.needed_by ?? "",
      ]),
    };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" /> Filtered compliance export
        </CardTitle>
        <CardDescription>
          Export procurement records by dataset, vendor, status and date range. CSV/PDF available to authorised roles only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Dataset</Label>
            <Select value={dataset} onValueChange={(v) => { setDataset(v as Dataset); setStatus("any"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase_orders">Purchase Orders</SelectItem>
                <SelectItem value="invoices">Invoices</SelectItem>
                <SelectItem value="contracts">Contracts</SelectItem>
                <SelectItem value="requisitions">Requisitions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId} disabled={dataset === "requisitions"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any vendor</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any status</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start", !from && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {from ? format(from, "dd/MM/yyyy") : "Any"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={from} onSelect={setFrom} />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start", !to && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  {to ? format(to, "dd/MM/yyyy") : "Any"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={to} onSelect={setTo} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal">
            {filtered.length} record{filtered.length === 1 ? "" : "s"} match
          </Badge>
          {canExport ? (
            <ExportMenu label="Export filtered" getData={buildPayload} />
          ) : (
            <Button size="sm" variant="outline" disabled className="gap-1.5">
              <FileDown className="h-4 w-4" /> Export restricted
            </Button>
          )}
        </div>

        {!canExport && (
          <div className="text-xs text-muted-foreground">
            CSV/PDF export is limited to Admin, OIC, 2IC, and Procurement Officer roles.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
