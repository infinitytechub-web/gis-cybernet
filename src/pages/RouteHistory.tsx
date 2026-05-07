import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download, FileText, Map as MapIcon, ShieldCheck } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { downloadCSVString, downloadBlob } from "@/lib/download-utils";
import { toast } from "sonner";

interface RouteRow {
  id: string;
  recorded_at: string;
  point_count: number;
  view_mode: string | null;
  source: string | null;
  client_ip: string | null;
  user_agent: string | null;
}
interface AuditRow {
  id: string;
  surface: string;
  view_mode: string | null;
  occurred_at: string;
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signExport(args: { contentSha256: string; kind: string; range: string; recordCount: number }) {
  const { data, error } = await supabase.functions.invoke("sign-export", { body: args });
  if (error) throw new Error(error.message);
  return data as { payload: Record<string, unknown>; signature: string; algorithm: string };
}

export default function RouteHistory() {
  const [from, setFrom] = useState<Date | undefined>(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d;
  });
  const [to, setTo] = useState<Date | undefined>(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  });
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = async () => {
    if (!from || !to) return;
    setLoading(true);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const [{ data: r, error: rErr }, { data: a, error: aErr }] = await Promise.all([
      supabase.from("route_tracking_history")
        .select("id, recorded_at, point_count, view_mode, source, client_ip, user_agent")
        .gte("recorded_at", fromIso).lte("recorded_at", toIso)
        .order("recorded_at", { ascending: false }).limit(1000),
      supabase.from("map_access_audit")
        .select("id, surface, view_mode, occurred_at")
        .gte("occurred_at", fromIso).lte("occurred_at", toIso)
        .order("occurred_at", { ascending: false }).limit(1000),
    ]);
    if (rErr) toast.error(`Routes: ${rErr.message}`);
    if (aErr) toast.error(`Audit: ${aErr.message}`);
    setRoutes((r ?? []) as RouteRow[]);
    setAudit((a ?? []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from?.getTime(), to?.getTime()]);

  const stamp = useMemo(() => format(new Date(), "yyyyMMdd-HHmmss"), [routes, audit]);
  const range = from && to ? `${format(from, "yyyy-MM-dd")}_to_${format(to, "yyyy-MM-dd")}` : "all";

  const exportCsv = async () => {
    try {
      const dataLines: string[] = [];
      dataLines.push("ROUTE TRACKING HISTORY");
      dataLines.push(`Range,${csvEscape(range)}`);
      dataLines.push(`Generated,${csvEscape(new Date().toISOString())}`);
      dataLines.push(`User,${csvEscape(userId ?? "")}`);
      dataLines.push("");
      dataLines.push("Recorded At,Points,View Mode,Source,Client IP,User Agent");
      for (const r of routes) {
        dataLines.push([r.recorded_at, r.point_count, r.view_mode, r.source, r.client_ip, r.user_agent].map(csvEscape).join(","));
      }
      dataLines.push("");
      dataLines.push("MAP ACCESS AUDIT");
      dataLines.push("Occurred At,Surface,View Mode");
      for (const a of audit) dataLines.push([a.occurred_at, a.surface, a.view_mode].map(csvEscape).join(","));

      const dataBlock = dataLines.join("\n");
      const contentSha256 = await sha256Hex(dataBlock);
      const sig = await signExport({
        contentSha256, kind: "route-history-csv", range, recordCount: routes.length + audit.length,
      });

      const trailer = [
        "",
        "# === SIGNED METADATA (do not edit; covers everything ABOVE this block) ===",
        `# SHA-256: ${contentSha256}`,
        `# Algorithm: ${sig.algorithm}`,
        `# Signature: ${sig.signature}`,
        `# Payload: ${JSON.stringify(sig.payload)}`,
        "# Verify at /verify-export by uploading this file.",
      ].join("\n");

      downloadCSVString(dataBlock + "\n" + trailer + "\n", `route-history_${range}_${stamp}.csv`);
      toast.success("Signed CSV exported");
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  };

  const exportPdf = async () => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Route Tracking History", 40, 40);
      doc.setFontSize(9);
      doc.text(`Range: ${range}`, 40, 58);
      doc.text(`Generated: ${new Date().toISOString()}`, 40, 70);
      doc.text(`User: ${userId ?? ""}`, 40, 82);

      autoTable(doc, {
        startY: 100,
        head: [["Recorded At", "Points", "View", "Source", "Client IP", "User Agent"]],
        body: routes.map(r => [r.recorded_at, r.point_count, r.view_mode ?? "", r.source ?? "", r.client_ip ?? "", r.user_agent ?? ""]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [21, 94, 56] },
      });

      const afterY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
      doc.setFontSize(11);
      doc.text("Map Access Audit", 40, afterY + 24);
      autoTable(doc, {
        startY: afterY + 32,
        head: [["Occurred At", "Surface", "View Mode"]],
        body: audit.map(a => [a.occurred_at, a.surface, a.view_mode ?? ""]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [21, 94, 56] },
      });

      // Compute hash over a canonical text representation of the data
      // (independent of PDF layout — same rows yield same hash).
      const canonical = JSON.stringify({
        kind: "route-history-pdf",
        range,
        user: userId,
        routes: routes.map(r => [r.recorded_at, r.point_count, r.view_mode, r.source, r.client_ip, r.user_agent]),
        audit: audit.map(a => [a.occurred_at, a.surface, a.view_mode]),
      });
      const contentSha256 = await sha256Hex(canonical);
      const sig = await signExport({
        contentSha256, kind: "route-history-pdf", range, recordCount: routes.length + audit.length,
      });

      // Signed metadata page
      doc.addPage();
      doc.setFontSize(13);
      doc.text("Signed Export Metadata", 40, 50);
      doc.setFontSize(9);
      const lines = [
        `Algorithm: ${sig.algorithm}`,
        `SHA-256 (content): ${contentSha256}`,
        `Signature: ${sig.signature}`,
        "",
        "Payload (canonical JSON, sorted keys):",
        ...JSON.stringify(sig.payload, Object.keys(sig.payload).sort(), 2).split("\n"),
        "",
        "To verify: open /verify-export, paste the SHA-256, signature, and payload.",
        "Any modification to the data above invalidates this signature.",
      ];
      let y = 76;
      const pageH = doc.internal.pageSize.getHeight();
      for (const ln of lines) {
        if (y > pageH - 40) { doc.addPage(); y = 50; }
        doc.text(ln, 40, y);
        y += 12;
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.text("CONFIDENTIAL — GIS Cybernet", 40, doc.internal.pageSize.getHeight() - 18);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 18);
      }

      const blob = doc.output("blob");
      downloadBlob(blob, `route-history_${range}_${stamp}.pdf`);
      toast.success("Signed PDF exported");
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  };

  const DateBtn = ({ value, onChange, label }: { value: Date | undefined; onChange: (d?: Date) => void; label: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <MapIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Route Tracking History</h1>
          <p className="text-sm text-muted-foreground">Your saved routes and map access audit, with date-range export.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters &amp; Export</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Records are RLS-scoped: you only see your own; Command tier sees all.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <DateBtn value={from} onChange={setFrom} label="From date" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <DateBtn value={to} onChange={setTo} label="To date" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button onClick={exportCsv} disabled={loading || (routes.length + audit.length === 0)}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={exportPdf} variant="secondary" disabled={loading || (routes.length + audit.length === 0)}>
              <FileText className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Routes ({routes.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 600 }}>
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Recorded</th><th className="py-1 pr-3">Pts</th>
                <th className="py-1 pr-3">View</th><th className="py-1 pr-3">Source</th>
              </tr></thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 pr-3">{new Date(r.recorded_at).toLocaleString()}</td>
                    <td className="py-1 pr-3">{r.point_count}</td>
                    <td className="py-1 pr-3">{r.view_mode ?? "—"}</td>
                    <td className="py-1 pr-3">{r.source ?? "—"}</td>
                  </tr>
                ))}
                {routes.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No routes in range.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Map Access Audit ({audit.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 600 }}>
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Occurred</th><th className="py-1 pr-3">Surface</th><th className="py-1 pr-3">View</th>
              </tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="py-1 pr-3">{new Date(a.occurred_at).toLocaleString()}</td>
                    <td className="py-1 pr-3">{a.surface}</td>
                    <td className="py-1 pr-3">{a.view_mode ?? "—"}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No audit entries in range.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
