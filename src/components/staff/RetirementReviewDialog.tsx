/**
 * Lists every staff member an import would retire and requires an explicit
 * tick + typed count before the caller may proceed. The server re-checks the
 * count at commit time, so this is a safeguard for people, not the boundary.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCellQuoted } from "@/lib/csv-safe";
import { staffStatusLabel } from "@/lib/staff-status";

export type RetiringPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  rank_name?: string | null;
  unit_name?: string | null;
  status: string | null;
};

export function canConfirmRetirement(count: number, ticked: boolean, typed: string) {
  return count === 0 || (ticked && typed.trim() === String(count));
}

export default function RetirementReviewDialog({
  open, onOpenChange, people, loading, error, mode, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  people: RetiringPerson[];
  loading?: boolean;
  error?: string;
  /** "review" = list only; "confirm" = requires tick + typed count. */
  mode: "review" | "confirm";
  busy?: boolean;
  onConfirm?: () => void;
}) {
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) { setTicked(false); setTyped(""); setQ(""); } }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter((p) =>
      [p.first_name, p.last_name, p.staff_id, p.rank_name, p.unit_name]
        .some((v) => String(v ?? "").toLowerCase().includes(s)));
  }, [people, q]);
  const pager = usePagedList(filtered, { resetKey: q });
  const count = people.length;
  const ok = canConfirmRetirement(count, ticked, typed);

  const exportCsv = () => {
    const csv = [
      "Surname,First name,Staff ID,Rank,Unit,Current status",
      ...people.map((p) => [p.last_name, p.first_name, p.staff_id, p.rank_name, p.unit_name,
        staffStatusLabel(p.status)].map((v) => csvCellQuoted(v ?? "")).join(",")),
    ].join("\n");
    downloadCSVString(csv, `staff-to-be-retired-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[90vh] max-w-3xl flex-col !overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">{loading ? "Checking staff retirements…" : error ? "Retirement list unavailable" : `${count} staff will be retired`}</DialogTitle>
          <DialogDescription className="text-xs">
            These people are posted in this command but are not on the uploaded list.
          </DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
        {mode === "confirm" && count > 0 && !loading && !error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-xs">
              They will be set to inactive. Nothing is deleted, and they can be restored later.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input className="pl-9" placeholder="Search this list" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Search staff to be retired" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!count || loading || !!error}>
            <Download className="mr-1 h-4 w-4" aria-hidden="true" /> CSV
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          {error ? null : loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Working out the list…
            </div>
          ) : (
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Staff ID</TableHead>
                  <TableHead>Rank</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{p.last_name}, {p.first_name}</TableCell>
                    <TableCell className="text-sm">{p.staff_id || "—"}</TableCell>
                    <TableCell className="text-sm">{p.rank_name || "—"}</TableCell>
                    <TableCell className="text-sm">{p.unit_name || "—"}</TableCell>
                    <TableCell className="text-sm">{staffStatusLabel(p.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ListPagination {...pager} label="people" className="p-2" />
        </div>
        {mode === "confirm" && count > 0 && !loading && !error && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-start gap-2">
              <Checkbox id="retire-ack" checked={ticked} onCheckedChange={(v) => setTicked(v === true)} />
              <Label htmlFor="retire-ack" className="text-sm leading-snug">
                I have checked this list and confirm these staff should be retired
              </Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="retire-count" className="text-sm">Type the number of people being retired</Label>
              <Input id="retire-count" inputMode="numeric" className="w-32" value={typed}
                onChange={(e) => setTyped(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {mode === "confirm" ? "Cancel" : "Close"}
          </Button>
          {mode === "confirm" && (
            <Button variant={count ? "destructive" : "default"} disabled={!ok || busy || loading || !!error} onClick={onConfirm}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm and continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
