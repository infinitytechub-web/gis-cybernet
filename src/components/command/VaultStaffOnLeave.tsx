import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/date-format";
import { LEAVE_TYPE_LABELS } from "@/lib/leave-reasons";

const db = supabase as any;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Officers of one command with leave (current, upcoming, pending) and how many vault files are linked to each. */
export function VaultStaffOnLeave({ orgUnitId }: { orgUnitId: string }) {
  const today = iso(new Date());
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["vault-staff-on-leave", orgUnitId, today],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [leave, files] = await Promise.all([
        db.from("leave_requests")
          .select("id, profile_id, type, status, start_date, end_date, profiles!inner(id, first_name, last_name, staff_id, org_unit_id, deleted_at)")
          .eq("profiles.org_unit_id", orgUnitId).is("profiles.deleted_at", null)
          .in("status", ["approved", "pending"]).gte("end_date", today)
          .order("start_date", { ascending: true }).range(0, 4999),
        db.from("command_vault_files").select("related_profile_id").eq("org_unit_id", orgUnitId).is("archived_at", null).not("related_profile_id", "is", null).range(0, 9999),
      ]);
      if (leave.error) throw leave.error;
      if (files.error) throw files.error;
      const counts = new Map<string, number>();
      for (const f of files.data ?? []) counts.set(f.related_profile_id, (counts.get(f.related_profile_id) ?? 0) + 1);
      return { leave: (leave.data ?? []) as any[], counts };
    },
  });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.leave ?? []).filter((r) => !s || `${r.profiles.first_name} ${r.profiles.last_name} ${r.profiles.staff_id}`.toLowerCase().includes(s));
  }, [q.data, search]);
  const pager = usePagedList(rows, { resetKey: search });
  const stateOf = (r: any) => r.status === "pending" ? "Pending" : r.start_date <= today ? "On leave now" : "Upcoming";
  const onNow = (q.data?.leave ?? []).filter((r) => r.status === "approved" && r.start_date <= today).length;
  const pending = (q.data?.leave ?? []).filter((r) => r.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Staff On Leave</CardTitle>
        <CardDescription>Leave status for this command's officers, with the number of vault files linked to each. {onNow} on leave now · {pending} pending.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isError && <p role="alert" className="text-destructive">Leave status could not be loaded.</p>}
        <Input placeholder="Search officer or staff ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search officers on leave" />
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Leave</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Vault files</TableHead></TableRow></TableHeader>
            <TableBody>
              {pager.pageItems.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{q.isLoading ? "Loading…" : "No current, upcoming or pending leave"}</TableCell></TableRow>}
              {pager.pageItems.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.profiles.first_name} {r.profiles.last_name}<div className="text-xs text-muted-foreground">{r.profiles.staff_id}</div></TableCell>
                  <TableCell>{LEAVE_TYPE_LABELS[r.type] ?? r.type}</TableCell>
                  <TableCell>{formatDate(r.start_date)} – {formatDate(r.end_date)}</TableCell>
                  <TableCell><Badge variant={r.status === "pending" ? "secondary" : "default"}>{stateOf(r)}</Badge></TableCell>
                  <TableCell className="text-right">{q.data?.counts.get(r.profiles.id) ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ListPagination {...pager} label="officers" />
      </CardContent>
    </Card>
  );
}
