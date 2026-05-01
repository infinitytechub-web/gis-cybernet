// src/components/settings/AuditImportVerifyDialog.tsx
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, XCircle, FileWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { verifyExportedAudit, type VerifyReport } from "@/lib/security-audit-verify";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function HashChip({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <code className="font-mono text-xs break-all" title={value}>
      {value.slice(0, 16)}…{value.slice(-8)}
    </code>
  );
}

function Row({ label, ok, children }: { label: string; ok?: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
      <div className="text-xs text-muted-foreground min-w-[140px]">{label}</div>
      <div className="text-sm flex-1 text-right flex items-center justify-end gap-2">
        {children}
        {ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {ok === false && <XCircle className="h-4 w-4 text-destructive" />}
      </div>
    </div>
  );
}

export function AuditImportVerifyDialog({ open, onOpenChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const reset = () => { setReport(null); setFileName(""); if (fileRef.current) fileRef.current.value = ""; };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    setReport(null);
    try {
      const r = await verifyExportedAudit(file);
      setReport(r);
      if (r.ok) toast.success("✓ Hash chain verified — file is intact");
      else if (r.brokenSeq) toast.error(`Chain broken at seq #${r.brokenSeq}`);
      else toast.warning("Verification finished with warnings");
    } catch (e: any) {
      toast.error(e?.message || "Failed to parse file");
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-600" /> Import & verify audit export
          </DialogTitle>
          <DialogDescription>
            Upload a previously exported <code>.csv</code> or <code>.json</code> audit file. The
            SHA-256 hash chain is recomputed in your browser and compared to the head hash and
            row count embedded in the file header.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label
            className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm">
              {fileName ? <strong>{fileName}</strong> : "Click to choose or drop a file here"}
            </div>
            <div className="text-xs text-muted-foreground">CSV or JSON exported from this panel</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </label>

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Recomputing hash chain…
            </div>
          )}

          {report && (
            <div className="rounded-lg border p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm flex items-center gap-2">
                  {report.ok ? (
                    <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Chain intact</>
                  ) : (
                    <><FileWarning className="h-4 w-4 text-destructive" /> Verification failed</>
                  )}
                </div>
                <Badge variant="outline" className="uppercase text-[10px]">{report.format}</Badge>
              </div>

              <Row label="Exported at">
                <span>{report.header.exported_at || <span className="text-muted-foreground">not in file</span>}</span>
              </Row>
              <Row label="Row count" ok={report.rowCountMatches}>
                <span>
                  {report.rowCount}
                  {typeof report.header.row_count === "number" && report.header.row_count !== report.rowCount && (
                    <span className="text-destructive"> (header: {report.header.row_count})</span>
                  )}
                </span>
              </Row>
              <Row label="Header head hash">
                <HashChip value={report.header.head_hash} />
              </Row>
              <Row label="Computed head hash" ok={report.header.head_hash ? report.headHashMatches : null}>
                <HashChip value={report.computedHeadHash} />
              </Row>
              {report.brokenSeq !== null && (
                <Row label="Broken at" ok={false}>
                  <span className="text-destructive">seq #{report.brokenSeq} — {report.brokenReason}</span>
                </Row>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={reset} disabled={busy}>Reset</Button>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
