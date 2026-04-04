import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function PostingsTransfers() {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["postings-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("*, profiles(first_name, last_name, staff_id), from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-secondary">Postings & Transfers</h1>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">From</TableHead>
                <TableHead className="hidden md:table-cell">To</TableHead>
                <TableHead className="hidden lg:table-cell">Effective Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No postings or transfers</TableCell>
                </TableRow>
              ) : (
                records.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</TableCell>
                    <TableCell className="capitalize">{r.type}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.from_dept?.name ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.to_dept?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{format(new Date(r.effective_date), "PP")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
