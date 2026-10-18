import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Loader2, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import type { StaffListRow } from "@/lib/staff-list-import";
import { reviewStaffImport, type ImportAIFinding } from "@/lib/staff-import-ai";
import { MAX_REVIEW_ROWS } from "../../../supabase/functions/_shared/import-ai/comparison";

const labels = { likely_duplicate: "Likely duplicate", mismatch: "Mismatched details", possible_match: "Possible match", no_likely_match: "No likely match in candidates" };

export default function StaffImportAIReview({ rows }: { rows: StaffListRow[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [findings, setFindings] = useState<ImportAIFinding[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setSelected(new Set()); setFindings(null); setError(""); controller.current?.abort(); }, [rows]);
  useEffect(() => () => controller.current?.abort(), []);
  const filtered = useMemo(() => rows.filter((r) => `${r.row_no} ${r.first_name} ${r.last_name} ${r.staff_id_raw}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const pager = usePagedList(filtered, { resetKey: query });
  const run = async () => {
    if (!selected.size || selected.size > MAX_REVIEW_ROWS || busy) return;
    setBusy(true); setError(""); setFindings(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await reviewStaffImport(rows.filter((r) => selected.has(r.row_no)).map((r) => ({ row_no: r.row_no, first_name: r.first_name, last_name: r.last_name, staff_id_raw: r.staff_id_raw, intake: r.intake, rank: r.rank, unit: r.unit })), abort.signal);
      if (!abort.signal.aborted) setFindings(result);
    } catch (e) {
      setError(abort.signal.aborted ? "Review stopped. No staff records were changed." : e instanceof Error ? e.message : "AI review failed.");
    } finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}><BrainCircuit className="mr-2 h-4 w-4" aria-hidden="true" />AI comparison</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) controller.current?.abort(); }}>
      <DialogContent className="!flex max-h-[90vh] max-w-5xl flex-col !overflow-hidden">
        <DialogHeader><DialogTitle>AI staff comparison</DialogTitle><DialogDescription>Advisory findings only — no staff records or import decisions are changed. Lovable AI usage uses workspace credits.</DialogDescription></DialogHeader>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search AI comparison rows" className="pl-9" placeholder="Search names, staff IDs or row numbers" value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy} /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setSelected(new Set(pager.pageItems.slice(0, MAX_REVIEW_ROWS).map((r) => r.row_no))); setFindings(null); }}>Select this page</Button>
          <span className="text-sm text-muted-foreground">{selected.size}/{MAX_REVIEW_ROWS} selected</span>
          {busy ? <Button variant="destructive" size="sm" onClick={() => controller.current?.abort()}><Square className="mr-2 h-4 w-4" />Stop</Button> : <Button size="sm" disabled={!selected.size} onClick={run}><BrainCircuit className="mr-2 h-4 w-4" />Compare selected</Button>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {busy && <div role="status" className="flex items-center gap-2 py-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Comparing staff records…</div>}
          <Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Row</TableHead><TableHead>Imported name</TableHead><TableHead>Staff ID</TableHead><TableHead>Intake</TableHead></TableRow></TableHeader>
            <TableBody>{pager.pageItems.map((r) => <TableRow key={r.row_no}>
              <TableCell><Checkbox aria-label={`Select import row ${r.row_no}`} checked={selected.has(r.row_no)} disabled={busy || (!selected.has(r.row_no) && selected.size >= MAX_REVIEW_ROWS)} onCheckedChange={(value) => { setSelected((prev) => { const next = new Set(prev); if (value === true) next.add(r.row_no); else next.delete(r.row_no); return next; }); setFindings(null); }} /></TableCell>
              <TableCell>{r.row_no}</TableCell><TableCell>{r.first_name} {r.last_name}</TableCell><TableCell>{r.staff_id_raw || "—"}</TableCell><TableCell>{r.intake || "—"}</TableCell>
            </TableRow>)}</TableBody>
          </Table><ListPagination {...pager} label="import rows" />
          {findings && <section className="mt-4 space-y-3 border-t pt-4" aria-label="AI comparison findings"><h3 className="font-semibold">Comparison findings</h3>
            {findings.map((f) => <article key={f.row_no} className="space-y-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Row {f.row_no}</span><Badge variant={f.assessment === "mismatch" ? "destructive" : "secondary"}>{labels[f.assessment]}</Badge><span className="text-xs text-muted-foreground">{f.confidence} confidence</span></div>
              <div className="grid gap-2 text-sm sm:grid-cols-2"><p><strong>Imported:</strong> {f.imported.first_name} {f.imported.last_name} · {f.imported.staff_id_raw || "No ID"} · Intake {f.imported.intake || "—"}</p><p><strong>Existing:</strong> {f.existing ? `${f.existing.first_name ?? ""} ${f.existing.last_name ?? ""} · ${f.existing.staff_id || "No ID"} · Intake ${f.existing.intake || "—"}` : "No candidate selected"}</p></div>
              <p className="break-words text-sm">{f.reason}</p>{f.candidates_truncated && <p className="text-xs text-muted-foreground">Only the five closest candidates were compared; additional matches may exist.</p>}
            </article>)}
          </section>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}