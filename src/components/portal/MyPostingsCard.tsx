/**
 * The signed-in officer's own posting and shift history.
 *
 * `my_posting_history()` only returns the caller's own transfers.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date-format";

interface PostingRow {
  id: string;
  from_unit_name: string | null;
  to_unit_name: string | null;
  from_shift_group: string | null;
  to_shift_group: string | null;
  reason: string | null;
  effective_date: string | null;
  created_at: string;
}

export function MyPostingsCard({ shiftGroup }: { shiftGroup?: string | null }) {
  const { data: postings = [], isLoading } = useQuery({
    queryKey: ["portal-my-postings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_posting_history");
      if (error) throw error;
      return (data ?? []) as unknown as PostingRow[];
    },
  });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">My posting and shift changes</CardTitle>
          <Badge variant="secondary">{postings.length}</Badge>
        </div>
        <CardDescription>Every move recorded for you, most recent first.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your postings…
          </div>
        ) : postings.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No posting changes are recorded for you. You are currently on shift group {shiftGroup ?? "—"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Effective</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postings.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.effective_date ? formatDate(p.effective_date) : formatDate(p.created_at)}
                    </TableCell>
                    <TableCell>{p.from_unit_name ?? "Unposted"}</TableCell>
                    <TableCell className="font-medium">{p.to_unit_name ?? "Unposted"}</TableCell>
                    <TableCell>
                      {p.from_shift_group !== p.to_shift_group
                        ? `${p.from_shift_group ?? "—"} → ${p.to_shift_group ?? "—"}`
                        : p.to_shift_group ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                      {p.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MyPostingsCard;
