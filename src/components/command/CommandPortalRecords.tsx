import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPagination } from "@/components/ui/list-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagedList } from "@/hooks/usePagedList";
import { filterWorkforceRows, type WorkforceRow } from "@/lib/command-workforce";
import { formatDate } from "@/lib/date-format";

export function CommandPortalRecords({ rows, view }: { rows: WorkforceRow[]; view: "roster" | "leave" }) {
  const [search, setSearch] = useState("");
  const filtered = filterWorkforceRows(rows, search, "all");
  const pager = usePagedList(filtered, { resetKey: search });
  const details = (row: WorkforceRow) => view === "roster"
    ? `${row.shift ?? "Shift"} · ${row.start_time?.slice(0, 5) ?? "—"} – ${row.end_time?.slice(0, 5) ?? "—"}`
    : `${formatDate(row.start_date)} – ${formatDate(row.end_date)}`;
  return <section className="min-w-0 space-y-3" aria-label={view === "roster" ? "Command duty roster" : "Command current leave"}>
    <div className="max-w-md"><Label htmlFor={`portal-search-${view}`}>Search {view === "roster" ? "duty roster" : "current leave"}</Label>
      <Input id={`portal-search-${view}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Officer or shift" /></div>
    {!filtered.length ? <p className="py-6 text-sm text-muted-foreground">{view === "roster" ? "No shift assignments for this date." : "No officers on approved leave for this date."}</p> : <>
      <div className="divide-y md:hidden">{pager.pageItems.map(row => <article key={row.id} className="space-y-2 py-3">
        <h3 className="break-words font-medium">{row.name}</h3><p className="text-sm text-muted-foreground">{details(row)}</p>
        {row.status && <Badge variant="secondary" className="capitalize">{row.status}</Badge>}
      </article>)}</div>
      <div className="hidden min-w-0 overflow-x-auto md:block"><Table className="min-w-[700px]"><TableHeader><TableRow>
        <TableHead>Officer</TableHead><TableHead>{view === "roster" ? "Shift / Hours" : "Leave dates"}</TableHead>{view === "leave" && <TableHead>Status</TableHead>}
      </TableRow></TableHeader><TableBody>{pager.pageItems.map(row => <TableRow key={row.id}>
        <TableCell className="font-medium">{row.name}</TableCell><TableCell>{details(row)}</TableCell>
        {view === "leave" && <TableCell><Badge variant="secondary" className="capitalize">{row.status}</Badge></TableCell>}
      </TableRow>)}</TableBody></Table></div>
      <ListPagination {...pager} label={view === "roster" ? "shift assignments" : "leave records"} />
    </>}
  </section>;
}