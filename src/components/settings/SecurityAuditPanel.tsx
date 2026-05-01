// src/components/settings/SecurityAuditPanel.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Download, FileJson, FileSpreadsheet, Anchor, RefreshCw, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportSecurityAudit, verifySecurityAuditChain, createSecurityAuditAnchor } from "@/lib/security-audit";
import { downloadBlob } from "@/lib/download-utils";
import { AuditImportVerifyDialog } from "./AuditImportVerifyDialog";

const sevColor: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warn: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-destructive/15 text-destructive",
};

export function SecurityAuditPanel() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(lastWeek);
  const [to, setTo] = useState(today);
  const [importOpen, setImportOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["security-audit", "preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_audit_log")
        .select("seq,id,created_at,category,action,severity,actor_label,subject,row_hash")
        .order("seq", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: retention } = useQuery({
    queryKey: ["audit-retention"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_retention_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const updateRetention = useMutation({
    mutationFn: async (patch: Partial<{ security_audit_days: number; firewall_event_days: number; account_unlock_days: number }>) => {
      const { error } = await supabase.from("audit_retention_settings").update(patch).eq("id", retention!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["audit-retention"] }); toast.success("Retention updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const buildHeaderMeta = (data: any[]) => {
    const exportedAt = new Date().toISOString();
    const head = data.length ? data.reduce((a, b) => (b.seq > a.seq ? b : a)) : null;
    return {
      exported_at: exportedAt,
      row_count: data.length,
      head_seq: head?.seq ?? null,
      head_hash: head?.row_hash ?? null,
      head_created_at: head?.created_at ?? null,
    };
  };

  const runExport = async (format: "csv" | "json", scope: "range" | "all") => {
    try {
      const data = scope === "all"
        ? await exportSecurityAudit()
        : await exportSecurityAudit(new Date(from), new Date(to + "T23:59:59"));
      const arr = (data as any[]) ?? [];
      const meta = buildHeaderMeta(arr);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = scope === "all" ? `security-audit-all_${stamp}` : `security-audit-${from}_${to}`;

      if (format === "json") {
        const payload = { header: meta, rows: arr };
        downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${baseName}.json`);
      } else {
        const headers = ["seq", "created_at", "category", "action", "severity", "actor_label", "subject", "ip_address", "row_hash", "prev_hash"];
        const metaLines = [
          `# Security Audit Log Export`,
          `# Exported At: ${meta.exported_at}`,
          `# Row Count: ${meta.row_count}`,
          `# Head Seq: ${meta.head_seq ?? ""}`,
          `# Head Hash: ${meta.head_hash ?? ""}`,
          `# Head Created At: ${meta.head_created_at ?? ""}`,
          ``,
        ];
        const csv = metaLines.concat([headers.join(",")]).concat(
          arr.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))
        ).join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${baseName}.csv`);
      }
      toast.success(`Exported ${arr.length} rows`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleExport = (format: "csv" | "json") => runExport(format, "range");
  const handleExportAll = (format: "csv" | "json" = "csv") => runExport(format, "all");

  const handleVerify = async () => {
    try {
      const broken = await verifySecurityAuditChain();
      if (Array.isArray(broken) && broken.length === 0) {
        toast.success("✓ Hash chain intact — no tampering detected");
      } else {
        const b = (broken as any[])[0];
        toast.error(`Chain broken at seq #${b?.broken_seq}`);
      }
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAnchor = async () => {
    try {
      const id = await createSecurityAuditAnchor();
      if (!id) toast.info("No rows yet to anchor");
      else toast.success("Daily anchor recorded");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Security Audit Log</CardTitle>
          <CardDescription>Hash-chained, append-only record of firewall, account, MFA, export, and DLP events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")} className="gap-2">
              <FileJson className="h-4 w-4" /> Export JSON
            </Button>
            <Button variant="outline" onClick={handleVerify} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Verify chain
            </Button>
            <Button variant="outline" onClick={handleAnchor} className="gap-2">
              <Anchor className="h-4 w-4" /> Create anchor
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Import & verify
            </Button>
            <Button onClick={() => handleExportAll("csv")} className="gap-2 ml-auto">
              <FileDown className="h-4 w-4" /> Export all (CSV)
            </Button>
            <Button onClick={() => handleExportAll("json")} className="gap-2">
              <FileJson className="h-4 w-4" /> Export all (JSON)
            </Button>
          </div>

          {retention && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/30">
              <div>
                <Label className="text-xs">Security audit retention (days)</Label>
                <Input type="number" min={30} defaultValue={retention.security_audit_days}
                  onBlur={e => updateRetention.mutate({ security_audit_days: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Firewall event retention (days)</Label>
                <Input type="number" min={30} defaultValue={retention.firewall_event_days}
                  onBlur={e => updateRetention.mutate({ firewall_event_days: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Account unlock retention (days)</Label>
                <Input type="number" min={90} defaultValue={retention.account_unlock_days}
                  onBlur={e => updateRetention.mutate({ account_unlock_days: Number(e.target.value) })} />
              </div>
            </div>
          )}

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Seq</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="font-mono text-xs">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No audit rows yet</TableCell></TableRow>
                ) : (
                  rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.seq}</TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.category}</Badge></TableCell>
                      <TableCell className="text-xs">{r.action}</TableCell>
                      <TableCell><Badge className={sevColor[r.severity] || ""}>{r.severity}</Badge></TableCell>
                      <TableCell className="text-xs">{r.actor_label || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[280px] truncate">{r.subject || "—"}</TableCell>
                      <TableCell className="font-mono text-[10px] truncate max-w-[120px]" title={r.row_hash}>{r.row_hash?.slice(0, 12)}…</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
