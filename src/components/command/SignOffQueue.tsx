/**
 * Records waiting for the signed-in officer's sign-off.
 *
 * The list comes from `signoff_my_queue`, which only returns records the
 * officer may already see and only where their role is entitled to sign the
 * next step. Opening a row goes straight to the record's sign-off section.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileSignature, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/date-format";
import { SIGNOFF_STEP_LABEL } from "@/lib/signoff";

type QueueRow = {
  entity_type: string;
  entity_id: string;
  staff_name: string | null;
  staff_id: string | null;
  unit_name: string | null;
  next_step: string;
  last_action_at: string | null;
};

export function SignOffQueue({ limit }: { limit?: number }) {
  const [search, setSearch] = useState("");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["signoff-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("signoff_my_queue");
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? data.filter((r) =>
          [r.staff_name, r.staff_id, r.unit_name].some((v) => (v ?? "").toLowerCase().includes(term)),
        )
      : data;
    return limit ? filtered.slice(0, limit) : filtered;
  }, [data, search, limit]);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Awaiting my sign-off
          </CardTitle>
          <Badge variant="secondary">{data.length}</Badge>
        </div>
        <CardDescription>
          Records whose next step you are entitled to sign, in your command only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-8"
            placeholder="Search by name, staff number or unit"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search records awaiting sign-off"
          />
        </div>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {!isLoading && !error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing is waiting for your signature.</p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Officer</TableHead>
                  <TableHead>Staff number</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Next step</TableHead>
                  <TableHead>Last action</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.entity_id}>
                    <TableCell className="font-medium">{r.staff_name || "—"}</TableCell>
                    <TableCell>{r.staff_id || "—"}</TableCell>
                    <TableCell>{r.unit_name || "—"}</TableCell>
                    <TableCell>
                      <Badge className="bg-amber-100 text-amber-800">
                        {SIGNOFF_STEP_LABEL[r.next_step] ?? r.next_step}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_action_at ? formatDateTime(r.last_action_at) : "Not started"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/staff?edit=${r.entity_id}&tab=M`}>Sign</Link>
                      </Button>
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

export default SignOffQueue;
