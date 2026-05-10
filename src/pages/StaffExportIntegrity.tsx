import { useState } from "react";
import { ShieldCheck, Play, CheckCircle2, XCircle, Loader2, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  runStaffExportIntegrityChecks,
  summarize,
  type IntegrityCheck,
} from "@/lib/staff-export-integrity";

function fmtBytes(n?: number) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function StaffExportIntegrity() {
  const { isAdminOrSupervisor, loading } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<IntegrityCheck[]>([]);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  if (loading) return null;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const run = async () => {
    setRunning(true);
    try {
      const r = await runStaffExportIntegrityChecks();
      setResults(r);
      setRanAt(new Date());
      const s = summarize(r);
      if (s.fail === 0) toast.success(`All ${s.total} export routes verified`);
      else toast.error(`${s.fail} of ${s.total} export routes failed`);
    } catch (e) {
      toast.error(`Integrity sweep failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const summary = summarize(results);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Staff / Employees Export Integrity
          </CardTitle>
          <CardDescription>
            Automated sweep of every Staff/Employees download route. Each generator runs with
            sample data; the produced file is intercepted and verified for the correct MIME type,
            magic-byte signature, and a sane size envelope. No actual files are downloaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running…" : "Run integrity sweep"}
            </Button>
            {results.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="gap-1">
                  <FileCheck2 className="h-3 w-3" /> {summary.total} checks
                </Badge>
                <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {summary.pass} pass
                </Badge>
                {summary.fail > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> {summary.fail} fail
                  </Badge>
                )}
                {ranAt && (
                  <span className="text-muted-foreground text-xs">
                    Last run {ranAt.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>MIME</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {r.status === "pass" ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> PASS
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> FAIL
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.route}</TableCell>
                      <TableCell className="uppercase text-xs">{r.artifact}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(r.size)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {r.actualMime ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.message}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.durationMs}ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Click <strong>Run integrity sweep</strong> to verify every Staff/Employees export route.
              Each route is exercised with realistic sample data and the produced blob is checked
              for: ✓ correct file format (PDF/DOCX/XLSX/CSV/DOC), ✓ valid magic-byte signature,
              and ✓ a non-trivial, non-runaway file size.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
