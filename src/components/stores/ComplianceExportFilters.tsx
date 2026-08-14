import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { CalendarIcon, FileDown, Filter, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { downloadBlob, downloadCSVString } from "@/lib/download-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const FREQS = ["hourly", "daily", "weekly", "monthly"] as const;
type Freq = typeof FREQS[number] | "any";

type Run = {
  id: string;
  schedule_id: string | null;
  triggered_kind: "scheduled" | "manual";
  mismatched_count: number;
  net_variance_value: number;
  report_csv_path: string | null;
  report_pdf_path: string | null;
  created_at: string;
  summary_json: any;
  schedule?: { frequency: string } | null;
};

export function ComplianceExportFilters() {
  const { role } = useAuth();
  const canDownload = ["admin", "oic", "2ic", "storekeeper", "procurement_officer"].includes(
    role || "",
  );

  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [location, setLocation] = useState<string>("any");
  const [freq, setFreq] = useState<Freq>("any");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const { data: locations = [] } = useQuery({
    queryKey: ["inventory_item_locations", "compliance"],
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("location")
        .not("location", "is", null);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.location && set.add(r.location));
      return Array.from(set).sort();
    },
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["compliance_runs", from?.toISOString(), to?.toISOString(), freq],
    queryFn: async () => {
      let q = supabase
        .from("inventory_audit_runs" as any)
        .select(
          "id, schedule_id, triggered_kind, mismatched_count, net_variance_value, report_csv_path, report_pdf_path, created_at, summary_json, inventory_audit_schedules(frequency)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (from) q = q.gte("created_at", from.toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []).map((r: any) => ({
        ...r,
        schedule: r.inventory_audit_schedules ?? null,
      })) as Run[];
      return freq === "any" ? list : list.filter((r) => r.schedule?.frequency === freq);
    },
  });

  // Sample-pull a recent count batch filtered by location for inline summary
  const { data: items = [] } = useQuery({
    queryKey: ["compliance_items", location],
    queryFn: async () => {
      let q = supabase
        .from("inventory_items")
        .select(
          "id, asset_tag, name, qty_on_hand, unit, unit_cost, location, condition, inventory_categories(name)",
        );
      if (location !== "any") q = q.eq("location", location);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: counts = [] } = useQuery({
    queryKey: ["compliance_counts", from?.toISOString(), to?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from("inventory_audit_counts")
        .select("item_id, physical_count, system_qty, variance, counted_at")
        .order("counted_at", { ascending: false })
        .limit(5000);
      if (from) q = q.gte("counted_at", from.toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("counted_at", end.toISOString());
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const composed = useMemo(() => {
    const latest = new Map<string, any>();
    for (const c of counts as any[]) if (!latest.has(c.item_id)) latest.set(c.item_id, c);
    let mismatched = 0;
    let net = 0;
    const rows = (items as any[]).map((it) => {
      const last = latest.get(it.id);
      const phys = last ? Number(last.physical_count) : null;
      const sys = Number(it.qty_on_hand);
      const variance = phys === null ? null : phys - sys;
      const variValue = variance === null ? null : variance * Number(it.unit_cost ?? 0);
      if (variance !== null && variance !== 0) {
        mismatched += 1;
        net += variValue ?? 0;
      }
      return {
        asset_tag: it.asset_tag ?? "",
        name: it.name,
        category: it.inventory_categories?.name ?? "",
        location: it.location ?? "",
        condition: it.condition ?? "",
        sys,
        phys,
        variance,
        variValue,
        counted_at: last?.counted_at ?? null,
      };
    });
    return { rows, mismatched, net };
  }, [items, counts]);

  const filenameStem = () => {
    const parts = ["compliance"];
    if (location !== "any") parts.push(location.replace(/\W+/g, "_"));
    if (freq !== "any") parts.push(freq);
    if (from) parts.push(format(from, "yyyyMMdd"));
    if (to) parts.push(format(to, "yyyyMMdd"));
    parts.push(format(new Date(), "yyyyMMdd-HHmm"));
    return parts.join("-");
  };

  const exportCsv = () => {
    if (!canDownload) return toast.error("Not authorized to download.");
    setBusy("csv");
    try {
      const header = [
        "Asset Tag", "Item", "Category", "Location", "Condition",
        "System Qty", "Physical Count", "Variance", "Variance Value (GHS)", "Last Counted",
      ];
      const esc = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.map(esc).join(",")];
      for (const r of composed.rows) {
        lines.push([
          r.asset_tag, r.name, r.category, r.location, r.condition,
          r.sys, r.phys ?? "", r.variance ?? "",
          r.variValue === null ? "" : Number(r.variValue).toFixed(2),
          r.counted_at ? new Date(r.counted_at).toISOString() : "",
        ].map(esc).join(","));
      }
      // Run history block
      lines.push("");
      lines.push("Run history (matching filters)");
      lines.push(["Created", "Trigger", "Frequency", "Mismatched", "Net Variance (GHS)", "CSV Path", "PDF Path"].map(esc).join(","));
      for (const r of runs) {
        lines.push([
          new Date(r.created_at).toISOString(),
          r.triggered_kind,
          r.schedule?.frequency ?? "—",
          r.mismatched_count,
          Number(r.net_variance_value).toFixed(2),
          r.report_csv_path ?? "",
          r.report_pdf_path ?? "",
        ].map(esc).join(","));
      }
      downloadCSVString(lines.join("\n"), `${filenameStem()}.csv`);
      toast.success("CSV exported");
    } catch (e: any) {
      toast.error(e.message ?? "CSV export failed");
    } finally {
      setBusy(null);
    }
  };

  const exportPdf = () => {
    if (!canDownload) return toast.error("Not authorized to download.");
    setBusy("pdf");
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      doc.setFont("helvetica", "bold").setFontSize(14);
      doc.text("GIS CYBERNET — Inventory Compliance Summary", w / 2, 36, { align: "center" });
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, w / 2, 52, { align: "center" });

      autoTable(doc, {
        startY: 70,
        head: [["Filter", "Value"]],
        body: [
          ["Location/Office", location === "any" ? "All" : location],
          ["Frequency", freq === "any" ? "All" : freq],
          ["From", from ? format(from, "dd/MM/yyyy") : "—"],
          ["To", to ? format(to, "dd/MM/yyyy") : "—"],
          ["Items in scope", String(composed.rows.length)],
          ["Mismatched", String(composed.mismatched)],
          ["Net variance (GHS)", composed.net.toFixed(2)],
          ["Matching runs", String(runs.length)],
        ],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [13, 64, 36], textColor: 255 },
        margin: { left: 40, right: w / 2 + 10 },
      });

      // @ts-ignore
      let y = (doc as any).lastAutoTable.finalY + 16;
      doc.setFont("helvetica", "bold").setFontSize(10).text("Item-level variance", 40, y);
      autoTable(doc, {
        startY: y + 6,
        head: [[
          "Asset Tag", "Item", "Category", "Location", "Condition",
          "System", "Physical", "Variance", "Value (GHS)", "Last Counted",
        ]],
        body: composed.rows.map((r) => [
          r.asset_tag, r.name, r.category, r.location, r.condition,
          r.sys, r.phys ?? "", r.variance ?? "",
          r.variValue === null ? "" : Number(r.variValue).toFixed(2),
          r.counted_at ? format(new Date(r.counted_at), "dd/MM/yyyy HH:mm") : "",
        ]),
        theme: "striped",
        styles: { fontSize: 7, cellPadding: 2.5, overflow: "linebreak" },
        headStyles: { fillColor: [13, 64, 36], textColor: 255 },
        margin: { left: 40, right: 40 },
      });

      // @ts-ignore
      y = (doc as any).lastAutoTable.finalY + 16;
      if (runs.length) {
        doc.setFont("helvetica", "bold").setFontSize(10).text("Matching scheduled/manual runs", 40, y);
        autoTable(doc, {
          startY: y + 6,
          head: [["Created", "Trigger", "Frequency", "Mismatched", "Net Variance (GHS)"]],
          body: runs.map((r) => [
            format(new Date(r.created_at), "dd/MM/yyyy HH:mm"),
            r.triggered_kind,
            r.schedule?.frequency ?? "—",
            String(r.mismatched_count),
            Number(r.net_variance_value).toFixed(2),
          ]),
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [28, 56, 110], textColor: 255 },
          margin: { left: 40, right: 40 },
        });
      }

      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFontSize(7).setTextColor(110);
        doc.text(
          `CONFIDENTIAL — Cybernet HRM System • Page ${p} of ${pages}`,
          w / 2,
          doc.internal.pageSize.getHeight() - 16,
          { align: "center" },
        );
        doc.setTextColor(0);
      }

      const bytes = doc.output("blob");
      downloadBlob(bytes as Blob, `${filenameStem()}.pdf`);
      toast.success("PDF exported");
    } catch (e: any) {
      toast.error(e.message ?? "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" /> Compliance export — filtered
        </CardTitle>
        <CardDescription>
          Build a CSV or PDF compliance summary scoped by office/location, date range and audit frequency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div className="sm:col-span-3">
            <Label className="text-xs">Office / Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All locations</SelectItem>
                {(locations as string[]).map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Frequency</Label>
            <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {FREQS.map((f) => (
                  <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Label className="text-xs">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !from && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {from ? format(from, "dd/MM/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="sm:col-span-3">
            <Label className="text-xs">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !to && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {to ? format(to, "dd/MM/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="sm:col-span-1 flex">
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-full"
              onClick={() => { setFrom(undefined); setTo(undefined); setLocation("any"); setFreq("any"); }}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{composed.rows.length} items in scope</Badge>
          <Badge variant={composed.mismatched > 0 ? "destructive" : "secondary"}>
            {composed.mismatched} mismatched
          </Badge>
          <Badge variant="outline">Net ₵{composed.net.toFixed(2)}</Badge>
          <Badge variant="outline">{runs.length} matching runs</Badge>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={!canDownload || busy !== null}>
              {busy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={exportPdf} disabled={!canDownload || busy !== null}>
              {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              PDF
            </Button>
          </div>
        </div>
        {!canDownload && (
          <p className="text-[11px] text-muted-foreground">
            Your role can view this panel but not export compliance summaries.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
